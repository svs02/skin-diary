import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/auth';
import { recordAuditEvent, type AuditEvent } from '@/lib/audit/server';
import { checkRateLimit } from '@/lib/audit/rateLimit';
import { isValidDateKey } from '@/lib/utils/dateKey';
import type { Angle } from '@/types';

/**
 * POST /api/audit/photo
 *
 * 클라이언트가 사진 업로드/삭제 직후 fire-and-forget으로 호출하는 감사 통보
 * 엔드포인트. 클라이언트는 Firestore audit 컬렉션에 직접 write할 수 없으므로
 * (보안 룰에서 차단), 이 endpoint가 ID 토큰을 검증한 뒤 Admin SDK로 대신 기록한다.
 *
 * 인증:
 *   Authorization: Bearer <Firebase ID Token>  (withAuth wrapper 처리)
 *   - verifyIdToken(token, true) — revoked check 포함
 *   - consent 게이트는 적용하지 않는다 — audit 통보는 본인 자신 행위 기록에 한정되어
 *     추가 권한 확장이 없고, withConsent의 Firestore read 비용이 부담된다(사진
 *     업로드/삭제마다 호출되는 hot path).
 *
 * 본문 (JSON):
 *   { "event": "photo.upload" | "photo.delete",
 *     "date":  "YYYY-MM-DD",
 *     "angle": "front" | "left" | "right" }
 *
 * 응답:
 *   204 (no content)             — 성공
 *   400 { error: "INVALID_BODY" }
 *   401 { error: "MISSING_TOKEN" | "INVALID_TOKEN" }
 *   429 { error: "RATE_LIMITED" } — uid 기준 분당 한도 초과 (audit 무력화 방지)
 *
 * 보안 노트:
 *  - event는 화이트리스트로 제한 — 임의 enum 주입 차단.
 *  - meta는 {date, angle}만 기록. URL/blob 크기 등은 PII/노이즈라 제외.
 *  - 응답은 success/failure만 알 수 있는 최소 정보. PII 미노출.
 *  - 감사 기록 실패 시에도 204 반환 (recordAuditEvent가 내부 흡수). 호출자가
 *    fire-and-forget이므로 별도 알림 채널 없음 — Vercel 로그가 단일 소스.
 *  - uid 기준 fixed-window rate limit (60 req/min)으로 audit 폭주 차단.
 *    정상 사용자는 사진 업로드/삭제가 분당 수회 이하이므로 한도와 거리가 멀다.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set<AuditEvent>(['photo.upload', 'photo.delete']);
const ALLOWED_ANGLES: ReadonlySet<Angle> = new Set(['front', 'left', 'right']);

const RATE_LIMIT = {
  scope: 'auditPhoto',
  windowMs: 60_000,
  max: 60,
} as const;

// Audit responses are tiny ack/error envelopes — explicitly no-store so they
// never get cached by any intermediary alongside the user's session.
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private' } as const;

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export const POST = withAuth(async (req, { uid }) => {
  // 1) Rate limit — 인증된 사용자가 임의 (date, angle) audit을 무제한 생성해
  //   본인 audit 추적을 무력화하거나 운영 비용을 끌어올리는 공격을 차단한다.
  //   Firestore 장애 시 fail-open (정상 흐름 통과) — audit 자체가 fire-and-forget
  //   이므로 가용성을 우선한다.
  try {
    const rl = await checkRateLimit(uid, RATE_LIMIT);
    if (!rl.allowed) {
      return jsonError(429, { error: 'RATE_LIMITED' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[audit/photo] rate limit check failed (fail-open): ${message}`);
  }

  // 2) 본문 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, { error: 'INVALID_BODY' });
  }
  if (!body || typeof body !== 'object') {
    return jsonError(400, { error: 'INVALID_BODY' });
  }
  const event = (body as Record<string, unknown>).event;
  const date = (body as Record<string, unknown>).date;
  const angle = (body as Record<string, unknown>).angle;

  if (
    typeof event !== 'string' ||
    !ALLOWED_EVENTS.has(event as AuditEvent) ||
    typeof date !== 'string' ||
    !isValidDateKey(date) ||
    typeof angle !== 'string' ||
    !ALLOWED_ANGLES.has(angle as Angle)
  ) {
    return jsonError(400, { error: 'INVALID_BODY' });
  }

  // 3) 감사 기록. recordAuditEvent는 내부에서 실패를 흡수하므로 throw 없음.
  await recordAuditEvent({
    uid,
    event: event as AuditEvent,
    source: 'client',
    meta: { date, angle },
  });

  return new NextResponse(null, { status: 204 });
});
