import { NextResponse } from 'next/server';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';

/**
 * POST /api/account/delete
 *
 * 사용자 본인이 자신의 계정과 모든 데이터를 영구 삭제한다.
 *
 * 인증:
 *   Authorization: Bearer <Firebase ID Token>
 *   - verifyIdToken(token, true) — revoked check 포함
 *   - auth_time 5분 이내 — 재인증 강제 (REAUTH_REQUIRED)
 *
 * 본문 (JSON):
 *   { "confirm": "DELETE_MY_ACCOUNT" }
 *
 * 삭제 순서 (CLAUDE.md §4 단일 데이터 모델 기준):
 *   1) Firestore: users/{uid}/dailyRecords/* (batch 500)
 *   2) Firestore: users/{uid}
 *   3) Storage:   /{uid}/* (deleteFiles by prefix)
 *   4) Auth:      deleteUser(uid)
 *
 * 1~3 단계 중 하나라도 실패하면 4(auth delete)는 스킵.
 *  - 데이터는 남고 사용자만 사라지면 사용자가 재로그인으로 복구 불가.
 *  - 응답에 어떤 단계까지 성공했는지 포함하여 사용자가 재시도/지원 요청 가능.
 *
 * 응답:
 *   200 { deleted: true }
 *   400 { error: "INVALID_BODY" }                    // confirm 미일치
 *   401 { error: "MISSING_TOKEN" | "INVALID_TOKEN" | "REAUTH_REQUIRED" }
 *   500 { error: "PARTIAL_FAILURE", stage, completed: string[] }
 *
 * 응답에 uid·email 등 PII 미포함.
 *
 * TODO(devops): Vercel Function 자체 보호 + Firebase Auth quota로 충분하나,
 *   사용량 증가 시 Upstash Ratelimit 등 외부 의존성 추가 검토.
 */

export const runtime = 'nodejs'; // Edge 런타임 불가 (firebase-admin은 Node 전용)
export const dynamic = 'force-dynamic';

const REAUTH_WINDOW_SECONDS = 300; // 5분
const BATCH_SIZE = 500; // Firestore batch 한도

type Stage = 'dailyRecords' | 'userDoc' | 'storage' | 'auth';

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * users/{uid}/dailyRecords 하위 모든 문서를 BATCH_SIZE씩 삭제.
 * select() 없이 ID만 필요한 쿼리는 Admin SDK가 내부적으로 효율적으로 처리.
 */
async function deleteAllDailyRecords(uid: string): Promise<void> {
  const db = adminDb();
  const colRef = db.collection('users').doc(uid).collection('dailyRecords');

  // 무한 루프 방지 — 비정상적으로 큰 컬렉션은 조기 차단 (실제 도메인상 365 * N년 수준)
  // 안전 상한 50,000개. 초과 시 명시적 에러로 운영자가 인지하도록 함.
  let totalDeleted = 0;
  const safetyMax = 50_000;

  while (true) {
    const snap = await colRef.limit(BATCH_SIZE).get();
    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    totalDeleted += snap.size;
    if (snap.size < BATCH_SIZE) return; // 마지막 페이지

    if (totalDeleted > safetyMax) {
      throw new Error(
        `dailyRecords delete exceeded safety cap (${safetyMax}). Manual cleanup required.`,
      );
    }
  }
}

async function deleteUserDoc(uid: string): Promise<void> {
  await adminDb().collection('users').doc(uid).delete();
}

async function deleteAllStorageObjects(uid: string): Promise<void> {
  const bucket = adminStorage().bucket();
  // prefix 끝 슬래시 필수 — `${uid}/` 가 없으면 동일 prefix를 가진 다른 uid까지 매칭될 위험.
  // (Firebase uid는 충돌하지 않지만 방어적으로 명시)
  await bucket.deleteFiles({ prefix: `${uid}/`, force: true });
}

async function deleteAuthUser(uid: string): Promise<void> {
  await adminAuth().deleteUser(uid);
}

export async function POST(req: Request) {
  // 1) 토큰 추출
  const token = extractBearerToken(req);
  if (!token) {
    return jsonError(401, { error: 'MISSING_TOKEN' });
  }

  // 2) 본문 검증 — confirm 일치
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, { error: 'INVALID_BODY' });
  }
  if (
    !body ||
    typeof body !== 'object' ||
    (body as Record<string, unknown>).confirm !== 'DELETE_MY_ACCOUNT'
  ) {
    return jsonError(400, { error: 'INVALID_BODY' });
  }

  // 3) ID 토큰 검증 (revoked check 포함)
  let uid: string;
  let authTimeSec: number;
  try {
    const decoded = await adminAuth().verifyIdToken(token, true);
    uid = decoded.uid;
    authTimeSec = decoded.auth_time;
  } catch {
    // revoked, expired, malformed 모두 동일하게 INVALID_TOKEN으로 처리 (PII/공격 표면 최소화).
    // 세부 에러코드(auth/id-token-revoked 등)는 서버 로그로만 남기지 않음 — 호출자에게는
    // 차이를 노출할 이점이 없고, 균일 응답이 정찰 공격을 차단한다.
    return jsonError(401, { error: 'INVALID_TOKEN' });
  }

  // 4) 재인증 강제 — 토큰의 auth_time이 5분 이내여야 함
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authTimeSec > REAUTH_WINDOW_SECONDS) {
    return jsonError(401, { error: 'REAUTH_REQUIRED' });
  }

  // 5) 순차 삭제 — 단계별 진행 상태 추적
  const completed: Stage[] = [];
  let failedStage: Stage | null = null;
  let failureMessage = '';

  try {
    await deleteAllDailyRecords(uid);
    completed.push('dailyRecords');
  } catch (err) {
    failedStage = 'dailyRecords';
    failureMessage = err instanceof Error ? err.message : String(err);
  }

  if (!failedStage) {
    try {
      await deleteUserDoc(uid);
      completed.push('userDoc');
    } catch (err) {
      failedStage = 'userDoc';
      failureMessage = err instanceof Error ? err.message : String(err);
    }
  }

  if (!failedStage) {
    try {
      await deleteAllStorageObjects(uid);
      completed.push('storage');
    } catch (err) {
      failedStage = 'storage';
      failureMessage = err instanceof Error ? err.message : String(err);
    }
  }

  // 1~3 단계 중 실패가 있으면 auth delete는 스킵.
  // (사용자 계정만 사라지고 데이터가 남으면 사용자 입장에서 복구 불가)
  if (failedStage) {
    // 콘솔 로그는 Vercel Function 로그로 수집 — 요청자에게는 PII 미노출
    console.error(
      `[account/delete] partial failure at stage="${failedStage}": ${failureMessage}`,
    );
    return jsonError(500, {
      error: 'PARTIAL_FAILURE',
      stage: failedStage,
      completed,
    });
  }

  try {
    await deleteAuthUser(uid);
    completed.push('auth');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[account/delete] auth deletion failed (data already wiped): ${message}`);
    return jsonError(500, {
      error: 'PARTIAL_FAILURE',
      stage: 'auth',
      completed,
    });
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
