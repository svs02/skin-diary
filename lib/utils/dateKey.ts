/**
 * 사용자 디바이스 로컬 타임존 기준 YYYY-MM-DD 키.
 * - CLAUDE.md §2.1 파일/문서 키 규약에 사용.
 * - CLAUDE.md §5.2 "오늘 날짜 자동 선택"의 자연스러운 해석 = 사용자 로컬 TZ.
 * - Firestore Rules는 ±1일 tolerance로 글로벌 TZ 안전성을 보장한다.
 */
const formatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayKey(now: Date = new Date()): string {
  return formatter.format(now);
}

/**
 * dateKey가 `YYYY-MM-DD` 형식인지 검증. Firestore/Storage Rules의 `isValidDate`와 동일 규약.
 */
export function isValidDateKey(value: string): boolean {
  return DATE_KEY_PATTERN.test(value);
}

/**
 * dateKey가 사용자 로컬 TZ 기준 오늘보다 미래인지 판단.
 * - CLAUDE.md §5.5: 미래 날짜 기록 작성/수정 금지.
 * - 문자열 비교(`YYYY-MM-DD`는 사전순 = 시간순)로 충분.
 * - 형식이 잘못된 입력은 false 반환 (호출부에서 isValidDateKey로 별도 확인).
 */
export function isFuture(dateKey: string, now: Date = new Date()): boolean {
  if (!isValidDateKey(dateKey)) return false;
  return dateKey > todayKey(now);
}

/**
 * dateKey(YYYY-MM-DD)에서 days 만큼 더한 dateKey 반환.
 * UTC 산술 사용 — 문자열 비교가 사전순=시간순이라 타임존 영향 없음 (저장된 키는 이미 로컬 TZ 기준).
 */
export function addDaysKey(dateKey: string, days: number): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * 두 dateKey 사이의 일수 차이 (b - a). UTC 기준이라 DST 영향 없음.
 */
export function daysBetweenKeys(a: string, b: string): number {
  if (!isValidDateKey(a) || !isValidDateKey(b)) {
    throw new Error(`Invalid dateKey(s): ${a}, ${b}`);
  }
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((bUtc - aUtc) / (24 * 60 * 60 * 1000));
}
