import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { withAuth } from '@/lib/api/auth';
import { recordAuditEvent } from '@/lib/audit/server';
import {
  deleteAllDailyRecords,
  deleteAllStorageObjects,
  deleteAuthUser,
  deleteUserDoc,
} from '@/lib/firebase/adminDelete';

/**
 * POST /api/account/abandon-signup
 *
 * 가입 직후 동의 화면에서 이탈한 사용자가 자신의 계정·문서·스토리지를 즉시 폐기한다.
 *
 * 배경:
 *   - Google OAuth 등 우리 동의 UI보다 먼저 Auth 사용자가 생성되는 흐름이 있다.
 *     사용자가 동의를 거부/이탈하면 "동의 미완료 Auth 사용자"가 남는다.
 *   - 본 엔드포인트는 그 상태를 깨끗이 청소하는 단방향 경로다.
 *
 * 인증 (withAuth wrapper):
 *   Authorization: Bearer <Firebase ID Token>
 *   - verifyIdToken(token, true) — revoked check 포함
 *   - withConsent는 사용하지 않는다 — 이 엔드포인트는 정확히 "consent 미완료"
 *     사용자만 통과시켜야 하므로 일반 consent 게이트와 정반대 조건이다.
 *     pending 가드는 아래 단계 (1)에 인라인으로 둔다.
 *   - 재인증(auth_time) 5분 강제는 불필요 — 가입 직후 흐름이라 토큰이 이미 신선.
 *
 * 안전 가드:
 *   - users/{uid} 문서가 존재하고 sensitivePhotoVersion === null 인 경우(=동의
 *     미완료 pending 상태)에만 진행한다.
 *   - 문서가 이미 동의 완료 상태(sensitivePhotoVersion !== null)이면
 *     `403 ALREADY_AGREED` 반환 — 실수로 호출되어 정상 사용자가 날아가는 사고
 *     방지.
 *   - 문서가 아예 없는 경우는 "Auth만 있고 Firestore는 없음" 상태로 안전하게
 *     진행 가능 (Storage·Firestore 단계는 no-op, Auth는 정상 삭제).
 *
 * 삭제 순서 (account/delete와 동일):
 *   1) Firestore: users/{uid}/dailyRecords/* (실제로는 비어있을 것)
 *   2) Firestore: users/{uid}
 *   3) Storage:   /{uid}/*  (실제로는 비어있을 것)
 *   4) Auth:      deleteUser(uid)
 *
 * 1~3 단계 중 하나라도 실패하면 4(auth delete)는 스킵. 사용자가 재시도하거나
 * 지원 채널로 문의할 수 있도록 어느 단계까지 진행됐는지를 응답에 포함.
 *
 * 응답:
 *   200 { abandoned: true }
 *   401 { error: "MISSING_TOKEN" | "INVALID_TOKEN" }
 *   403 { error: "ALREADY_AGREED" }
 *   500 { error: "PARTIAL_FAILURE", stage, completed: string[] }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Stage = 'dailyRecords' | 'userDoc' | 'storage' | 'auth';

// Account-mutation responses must never be cached. Same policy as delete.
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private' } as const;

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export const POST = withAuth(async (_req, { uid }) => {
  // 1) 안전 가드 — pending(동의 미완료) 사용자만 폐기 진행. withConsent와 반대 조건.
  try {
    const userRef = adminDb().collection('users').doc(uid);
    const snap = await userRef.get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const sensitivePhotoVersion = data.sensitivePhotoVersion as
        | string
        | null
        | undefined;
      if (sensitivePhotoVersion != null) {
        return jsonError(403, { error: 'ALREADY_AGREED' });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[account/abandon-signup] guard lookup failed: ${message}`);
    return jsonError(500, {
      error: 'PARTIAL_FAILURE',
      stage: 'userDoc' satisfies Stage,
      completed: [],
    });
  }

  // 2) 순차 폐기 — 단계별 진행 상태 추적
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

  if (failedStage) {
    console.error(
      `[account/abandon-signup] partial failure at stage="${failedStage}": ${failureMessage}`,
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
    console.error(
      `[account/abandon-signup] auth deletion failed (data already wiped): ${message}`,
    );
    return jsonError(500, {
      error: 'PARTIAL_FAILURE',
      stage: 'auth',
      completed,
    });
  }

  // 감사 기록 — abandon은 동의 미완료 사용자의 자발적 폐기. account.deleted와 동일한
  // 이유로 최상위 audit 컬렉션에 남긴다 (사용자 본인은 더 이상 조회 불가, 운영자만 추적).
  await recordAuditEvent({
    uid,
    event: 'account.abandoned',
    meta: { stages: completed.length },
  });

  return NextResponse.json(
    { abandoned: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
});
