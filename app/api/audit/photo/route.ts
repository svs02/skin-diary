import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { recordAuditEvent, type AuditEvent } from '@/lib/audit/server';
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
 *   Authorization: Bearer <Firebase ID Token>
 *   - verifyIdToken(token, true) — revoked check 포함
 *
 * 본문 (JSON):
 *   { "event": "photo.upload" | "photo.delete",
 *     "date":  "YYYY-MM-DD",
 *     "angle": "front" | "left" | "right" }
 *
 * 응답:
 *   204 (no content) — 성공
 *   400 { error: "INVALID_BODY" }
 *   401 { error: "MISSING_TOKEN" | "INVALID_TOKEN" }
 *
 * 보안 노트:
 *  - event는 화이트리스트로 제한 — 임의 enum 주입 차단.
 *  - meta는 {date, angle}만 기록. URL/blob 크기 등은 PII/노이즈라 제외.
 *  - 응답은 success/failure만 알 수 있는 최소 정보. PII 미노출.
 *  - 감사 기록 실패 시에도 204 반환 (recordAuditEvent가 내부 흡수). 호출자가
 *    fire-and-forget이므로 별도 알림 채널 없음 — Vercel 로그가 단일 소스.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set<AuditEvent>(['photo.upload', 'photo.delete']);
const ALLOWED_ANGLES: ReadonlySet<Angle> = new Set(['front', 'left', 'right']);

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(req: Request) {
  // 1) 토큰 추출
  const token = extractBearerToken(req);
  if (!token) {
    return jsonError(401, { error: 'MISSING_TOKEN' });
  }

  // 2) ID 토큰 검증
  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token, true);
    uid = decoded.uid;
  } catch {
    return jsonError(401, { error: 'INVALID_TOKEN' });
  }

  // 3) 본문 검증
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

  // 4) 감사 기록. recordAuditEvent는 내부에서 실패를 흡수하므로 throw 없음.
  await recordAuditEvent({
    uid,
    event: event as AuditEvent,
    source: 'client',
    meta: { date, angle },
  });

  // 본문 없이 204 반환. fire-and-forget 호출자가 파싱하지 않음.
  return new NextResponse(null, { status: 204 });
}
