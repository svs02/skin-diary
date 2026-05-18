import { NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase/admin';
import { withConsent } from '@/lib/api/auth';
import { recordAuditEvent } from '@/lib/audit/server';
import { checkRateLimit } from '@/lib/audit/rateLimit';
import { isFuture, isValidDateKey } from '@/lib/utils/dateKey';
import type { Angle } from '@/types';

/**
 * POST /api/photo/signed-url
 *
 * 클라이언트가 자신의 사진을 읽기 위한 V4 Signed URL을 발급한다.
 *
 * 보안 핵심:
 *  - GCS 객체 경로는 **반드시 서버에서** `${uid}/${date}/${angle}.jpg` 로 조립한다.
 *    클라이언트가 uid를 보내지 않으므로 IDOR(타인 자료 열람) 원천 차단.
 *  - URL 자체가 자격 증명이므로 GET 금지. POST로만 받아 쿼리스트링 로그 노출을 차단.
 *  - 만료는 10분. 화면 전환·재요청 비용을 최소화하면서도 유출시 영향 시간을 짧게.
 *
 * 인증 / 동의 (withConsent wrapper):
 *   Authorization: Bearer <Firebase ID Token>
 *   - verifyIdToken(token, true) — revoked check 포함
 *   - users/{uid}.sensitivePhotoVersion != null — 민감정보(얼굴 사진) 동의 완료 확인
 *   - 재인증(auth_time) 강제는 없음 (단순 read).
 *
 * 본문 (JSON):
 *   { "items": [{ "date": "YYYY-MM-DD", "angle": "front"|"left"|"right" }, ...] }
 *   - items.length: 1 ~ 6  (compare 화면 from/to × 3각도가 상한)
 *
 * 응답:
 *   200 { urls: [{ date, angle, url, expiresAt }] }  // Cache-Control: no-store, private
 *   400 { error: "INVALID_BODY" }
 *   401 { error: "MISSING_TOKEN" | "INVALID_TOKEN" }
 *   403 { error: "PENDING_CONSENT" }            // 민감정보 동의 미완료
 *   429 { error: "RATE_LIMITED" }               // uid 기준 30 req/min 초과
 *   500 { error: "SIGN_FAILED" | "CONSENT_CHECK_FAILED" }
 *
 * 응답에 uid·email 등 PII 미포함. 상세 에러는 콘솔에만 남기고 호출자에는 균일 응답.
 * 본문에 URL(자격증명)이 들어가므로 `Cache-Control: no-store, private` 명시 — 회사망
 * 중간 프록시·브라우저 캐시의 타인 노출 차단. `dynamic = 'force-dynamic'`은 Vercel
 * CDN 캐싱만 회피하므로 이 헤더가 추가로 필요하다.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const URL_TTL_MS = 10 * 60 * 1000;
const MAX_ITEMS = 6;
const ALLOWED_ANGLES: ReadonlyArray<Angle> = ['front', 'left', 'right'];

// 정상 사용자는 dedupingInterval 30s + 클라 캐시 1분 버퍼로 분당 1~3 호출이 한계.
// 30/min은 정상 사용 약 8배 여유. 악의적 polling을 차단하면서 정상 사용은 영향 없음.
const RATE_LIMIT = {
  scope: 'photoSignedUrl',
  windowMs: 60_000,
  max: 30,
} as const;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private' } as const;

type Item = { date: string; angle: Angle };

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function parseItems(body: unknown): Item[] | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>).items;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0 || raw.length > MAX_ITEMS) return null;

  const items: Item[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const date = (entry as Record<string, unknown>).date;
    const angle = (entry as Record<string, unknown>).angle;
    if (typeof date !== 'string' || !isValidDateKey(date)) return null;
    if (isFuture(date)) return null; // CLAUDE.md §5.5
    if (typeof angle !== 'string' || !ALLOWED_ANGLES.includes(angle as Angle)) return null;
    items.push({ date, angle: angle as Angle });
  }
  return items;
}

export const POST = withConsent(async (req, { uid }) => {
  // Rate limit — 인증된 사용자가 다량 발급을 트리거해 비용·audit 잡음을 만들지 못하게.
  // Firestore 장애 시 fail-open: 사용자가 본인 사진을 못 보는 UX 피해가 더 크다.
  try {
    const rl = await checkRateLimit(uid, RATE_LIMIT);
    if (!rl.allowed) {
      return jsonError(429, { error: 'RATE_LIMITED' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[photo/signed-url] rate limit check failed (fail-open): ${message}`);
  }

  // 본문 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, { error: 'INVALID_BODY' });
  }
  const items = parseItems(body);
  if (!items) {
    return jsonError(400, { error: 'INVALID_BODY' });
  }

  // Signed URL 발급 — 경로는 서버에서만 조립 (IDOR 차단)
  const bucket = adminStorage().bucket();
  const expiresAt = Date.now() + URL_TTL_MS;

  try {
    const urls = await Promise.all(
      items.map(async ({ date, angle }) => {
        const path = `${uid}/${date}/${angle}.jpg`;
        const [url] = await bucket.file(path).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: expiresAt,
        });
        return { date, angle, url, expiresAt };
      }),
    );
    // 감사 기록 — 발급 자체가 민감 사진 접근 행위이므로 항상 남긴다.
    // meta는 PII 최소화: 개수만 기록 (date/angle 조합은 사용자 본인이 이미 알고
    // 있고, 감사 컬렉션의 폭이 너무 넓어지면 활용이 어려워진다).
    await recordAuditEvent({
      uid,
      event: 'photo.signed_url_issued',
      meta: { count: items.length },
    });

    return NextResponse.json({ urls }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[photo/signed-url] sign failed: ${message}`);
    return jsonError(500, { error: 'SIGN_FAILED' });
  }
});
