/**
 * America/Vancouver (PST/PDT, DST 자동 반영) 기준 YYYY-MM-DD 키.
 * CLAUDE.md §2.1 파일/문서 키 규약에 사용.
 */
export const APP_TIMEZONE = 'America/Vancouver';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
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
 * dateKey가 앱 타임존(America/Vancouver) 기준 오늘보다 미래인지 판단.
 * - CLAUDE.md §5.5: 미래 날짜 기록 작성/수정 금지.
 * - 문자열 비교(`YYYY-MM-DD`는 사전순 = 시간순)로 충분.
 * - 형식이 잘못된 입력은 false 반환 (호출부에서 isValidDateKey로 별도 확인).
 */
export function isFuture(dateKey: string, now: Date = new Date()): boolean {
  if (!isValidDateKey(dateKey)) return false;
  return dateKey > todayKey(now);
}
