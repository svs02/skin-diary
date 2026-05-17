import { NextResponse } from 'next/server';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';
import { recordAuditEvent } from '@/lib/audit/server';
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
 * 인증:
 *   Authorization: Bearer <Firebase ID Token>
 *   - verifyIdToken(token, true) — revoked check 포함
 *   - account/delete와 달리 재인증(auth_time) 강제는 없음 (단순 read).
 *
 * 본문 (JSON):
 *   { "items": [{ "date": "YYYY-MM-DD", "angle": "front"|"left"|"right" }, ...] }
 *   - items.length: 1 ~ 6  (compare 화면 from/to × 3각도가 상한)
 *
 * 응답:
 *   200 { urls: [{ date, angle, url, expiresAt }] }
 *   400 { error: "INVALID_BODY" }
 *   401 { error: "MISSING_TOKEN" | "INVALID_TOKEN" }
 *   403 { error: "PENDING_CONSENT" }     // 민감정보(얼굴 사진) 동의 미완료
 *   500 { error: "SIGN_FAILED" }
 *
 * 응답에 uid·email 등 PII 미포함. 상세 에러는 콘솔에만 남기고 호출자에는 균일 응답.
 */

export const runtime = 'nodejs'; // Edge 런타임 불가 (firebase-admin은 Node 전용)
export const dynamic = 'force-dynamic';

const URL_TTL_MS = 10 * 60 * 1000; // 10분
const MAX_ITEMS = 6;
const ALLOWED_ANGLES: ReadonlyArray<Angle> = ['front', 'left', 'right'];

type Item = { date: string; angle: Angle };

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
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

export async function POST(req: Request) {
  // 1) 토큰 추출
  const token = extractBearerToken(req);
  if (!token) {
    return jsonError(401, { error: 'MISSING_TOKEN' });
  }

  // 2) ID 토큰 검증 (revoked check 포함). 균일 응답으로 정찰 차단.
  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token, true);
    uid = decoded.uid;
  } catch {
    return jsonError(401, { error: 'INVALID_TOKEN' });
  }

  // 3) 동의 게이트 — 민감정보(얼굴 사진) 동의 완료 사용자만 통과.
  //   - 사용자 문서가 없거나 sensitivePhotoVersion이 null이면 PENDING_CONSENT.
  //   - 비용: 요청당 user doc read 1회. 같은 응답 내 multiple items에 대해선
  //     아래 Promise.all 외부에서 단 한 번만 읽고 재사용한다.
  //   - 클라이언트는 인메모리 캐시로 호출 빈도가 충분히 낮음(같은 세션의 동일
  //     이미지는 재요청 없음) → 비용 영향 무시 가능.
  try {
    const userSnap = await adminDb().collection('users').doc(uid).get();
    const sensitivePhotoVersion = userSnap.exists
      ? (userSnap.data()?.sensitivePhotoVersion as string | null | undefined)
      : null;
    if (sensitivePhotoVersion == null) {
      return jsonError(403, { error: 'PENDING_CONSENT' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[photo/signed-url] consent lookup failed: ${message}`);
    return jsonError(500, { error: 'SIGN_FAILED' });
  }

  // 4) 본문 검증
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

  // 5) Signed URL 발급 — 경로는 서버에서만 조립 (IDOR 차단)
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

    return NextResponse.json({ urls }, { status: 200 });
  } catch (err) {
    // 상세는 콘솔에만, 응답은 PII 미노출.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[photo/signed-url] sign failed: ${message}`);
    return jsonError(500, { error: 'SIGN_FAILED' });
  }
}
