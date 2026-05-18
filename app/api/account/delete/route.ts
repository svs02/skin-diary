import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/auth';
import { recordAuditEvent } from '@/lib/audit/server';
import {
  deleteAllDailyRecords,
  deleteAllStorageObjects,
  deleteAuthUser,
  deleteUserDoc,
} from '@/lib/firebase/adminDelete';

/**
 * POST /api/account/delete
 *
 * 사용자 본인이 자신의 계정과 모든 데이터를 영구 삭제한다.
 *
 * 인증 (withAuth wrapper):
 *   Authorization: Bearer <Firebase ID Token>
 *   - verifyIdToken(token, true) — revoked check 포함
 *
 * 추가 검증 (인라인):
 *   - auth_time 5분 이내 — 재인증 강제 (REAUTH_REQUIRED)
 *   - consent 게이트는 적용하지 않는다 — 동의 철회 = 탈퇴이므로 pending 사용자도
 *     자기 데이터를 정리할 수 있어야 한다.
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REAUTH_WINDOW_SECONDS = 300; // 5분

type Stage = 'dailyRecords' | 'userDoc' | 'storage' | 'auth';

// Account-mutation responses must never be cached — leaking even error states
// (REAUTH_REQUIRED vs INVALID_TOKEN) to an intermediary would be a privacy
// regression.
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private' } as const;

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export const POST = withAuth(async (req, { uid, decoded }) => {
  // 1) 본문 검증 — confirm 일치
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

  // 2) 재인증 강제 — 토큰의 auth_time이 5분 이내여야 함
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - decoded.auth_time > REAUTH_WINDOW_SECONDS) {
    return jsonError(401, { error: 'REAUTH_REQUIRED' });
  }

  // 3) 순차 삭제 — 단계별 진행 상태 추적
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

  // 감사 기록 — Auth/사용자 문서가 모두 사라졌으므로 사용자 본인은 더 이상 이 로그를
  // 조회할 수 없다(보안 룰의 owner read가 막힘). 이는 의도된 동작: 사고/소송 추적은
  // 운영자가 Admin SDK로 cross-uid 쿼리하여 확보한다. 최상위 audit 컬렉션을 택한 이유.
  await recordAuditEvent({
    uid,
    event: 'account.deleted',
    meta: { stages: completed.length },
  });

  return NextResponse.json(
    { deleted: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
});
