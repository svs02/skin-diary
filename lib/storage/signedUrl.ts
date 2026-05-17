import { auth } from '@/lib/firebase/client';
import type { Angle } from '@/types';

/**
 * 사진 read용 Signed URL 클라이언트 헬퍼.
 *
 * 핵심 원칙:
 *  - 발급된 URL은 **인메모리만 유지**. localStorage/sessionStorage 저장 절대 금지
 *    (URL 자체가 자격증명이며, 디바이스 도난·XSS 시 영구 유출 위험).
 *  - 모듈 스코프 Map = 탭 단위 싱글톤 캐시. 페이지 새로고침 시 사라짐 (의도된 동작).
 *  - 만료 1분 이상 남은 URL만 hit으로 간주 — 사용 직전 만료 회피.
 *  - 401(INVALID_TOKEN) 응답 시 getIdToken(true)로 강제 갱신 후 **1회**만 재시도.
 */

type CacheEntry = { url: string; expiresAt: number };
type ServerItem = { date: string; angle: Angle };
type ServerResponseItem = { date: string; angle: Angle; url: string; expiresAt: number };

const HIT_BUFFER_MS = 60_000; // 만료 1분 이상 남아야 hit
const ENDPOINT = '/api/photo/signed-url';

// 인메모리 캐시. localStorage/sessionStorage 사용 금지.
const cache = new Map<string, CacheEntry>();

function cacheKey(date: string, angle: Angle): string {
  return `${date}/${angle}`;
}

function isFresh(entry: CacheEntry, now: number): boolean {
  return entry.expiresAt - now > HIT_BUFFER_MS;
}

async function getIdTokenOrThrow(forceRefresh: boolean): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('NOT_AUTHENTICATED');
  }
  return user.getIdToken(forceRefresh);
}

async function requestSignedUrls(
  items: ServerItem[],
  forceRefresh: boolean,
): Promise<{ ok: boolean; status: number; data?: { urls: ServerResponseItem[] } }> {
  const token = await getIdTokenOrThrow(forceRefresh);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
    cache: 'no-store',
  });

  if (res.status === 200) {
    const data = (await res.json()) as { urls: ServerResponseItem[] };
    return { ok: true, status: 200, data };
  }
  return { ok: false, status: res.status };
}

/**
 * 여러 (date, angle) 쌍에 대한 Signed URL을 batch 발급한다.
 * - 캐시 hit인 항목은 fetch 스킵.
 * - 401 INVALID_TOKEN 응답 시 토큰 강제 갱신 후 1회 재시도.
 * - 네트워크/401 재시도 실패 → throw (호출부가 재시도 결정).
 *
 * @returns Map<`${date}/${angle}`, {url, expiresAt}>
 */
export async function fetchSignedURLs(
  items: ServerItem[],
): Promise<Map<string, CacheEntry>> {
  const now = Date.now();
  const result = new Map<string, CacheEntry>();
  const misses: ServerItem[] = [];

  // 캐시 분류
  for (const item of items) {
    const key = cacheKey(item.date, item.angle);
    const hit = cache.get(key);
    if (hit && isFresh(hit, now)) {
      result.set(key, hit);
    } else {
      misses.push(item);
    }
  }

  if (misses.length === 0) {
    return result;
  }

  // 1차 요청
  let response = await requestSignedUrls(misses, false);

  // 401 → 토큰 갱신 후 1회 재시도
  if (!response.ok && response.status === 401) {
    response = await requestSignedUrls(misses, true);
  }

  if (!response.ok || !response.data) {
    throw new Error(`SIGNED_URL_REQUEST_FAILED: ${response.status}`);
  }

  for (const entry of response.data.urls) {
    const key = cacheKey(entry.date, entry.angle);
    const cached: CacheEntry = { url: entry.url, expiresAt: entry.expiresAt };
    cache.set(key, cached);
    result.set(key, cached);
  }

  return result;
}

/**
 * 단건 편의 함수.
 */
export async function getSignedURL(date: string, angle: Angle): Promise<string> {
  const map = await fetchSignedURLs([{ date, angle }]);
  const entry = map.get(cacheKey(date, angle));
  if (!entry) {
    throw new Error('SIGNED_URL_MISSING');
  }
  return entry.url;
}

/**
 * 캐시 무효화. 업로드/삭제 직후 호출하여 stale URL 노출 차단.
 */
export function invalidateSignedURL(date: string, angle: Angle): void {
  cache.delete(cacheKey(date, angle));
}

/**
 * 백그라운드 갱신 트리거 (현 PR 미사용, 추후 prefetch 도입용 placeholder).
 * 호출 시 해당 키를 즉시 만료 처리하여 다음 fetchSignedURLs 호출에서 새로 받도록 한다.
 */
export function markPhotoCacheRefresh(date: string, angle: Angle): void {
  const key = cacheKey(date, angle);
  const entry = cache.get(key);
  if (entry) {
    cache.set(key, { ...entry, expiresAt: 0 });
  }
}
