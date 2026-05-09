'use client';

import useSWR from 'swr';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  getDailyRecord,
  listRecordKeysInRange,
  type RecordRangeItem,
} from '@/lib/firebase/dailyRecord';
import type { DailyRecord } from '@/types';
import { addDaysKey, todayKey } from '@/lib/utils/dateKey';

/**
 * Overview 탭 데이터 hook 모음.
 *
 * - SWR 키는 항상 배열 첫 번째 요소를 namespace로 둬서 다른 화면과 충돌 방지.
 * - uid가 없을 때는 SWR 키를 null로 만들어 자동 비활성화 (CLAUDE.md §3.4).
 * - recent60은 [-60d, +1d) 범위 — 오늘을 포함하기 위해 endExclusive에 +1d.
 *
 * Streak 정의 (CLAUDE.md 도메인): "기록이 있는 날" = record 문서 존재.
 *   listRecordKeysInRange는 photos 메타도 같이 반환하지만 Streak 계산은 단순히
 *   문서 존재로만 결정한다. (메모만 있어도 "기록"으로 인정)
 */

const RECENT_DAYS = 60;

function recent60Fetcher([, uid]: [string, string]): Promise<RecordRangeItem[]> {
  const today = todayKey();
  const start = addDaysKey(today, -RECENT_DAYS);
  const endExclusive = addDaysKey(today, 1);
  return listRecordKeysInRange(uid, start, endExclusive);
}

function todayRecordFetcher(
  [, uid, dateKey]: [string, string, string],
): Promise<DailyRecord | null> {
  return getDailyRecord(uid, dateKey);
}

export function useRecent60() {
  const { user } = useAuth();
  const today = todayKey();
  return useSWR<RecordRangeItem[]>(
    user ? (['overview/recent60', user.uid, today] as const) : null,
    // SWR가 키를 그대로 fetcher에 넘긴다 — 첫 두 인자만 사용하므로 today는 캐시 분리용.
    ([ns, uid]) => recent60Fetcher([ns as string, uid as string]),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    },
  );
}

export function useTodayRecord() {
  const { user } = useAuth();
  const today = todayKey();
  return useSWR<DailyRecord | null>(
    user ? (['dailyRecord', user.uid, today] as const) : null,
    ([ns, uid, dateKey]) =>
      todayRecordFetcher([ns as string, uid as string, dateKey as string]),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    },
  );
}

/**
 * Streak = 오늘부터 역순으로 연속한 dateKey가 records에 존재하는 일수.
 * recent60 데이터에서 파생 (별도 fetch 안 함).
 *
 * 예: today=2026-05-08, records=[..., '2026-05-06', '2026-05-07', '2026-05-08']
 *  → 3일 streak.
 * 단 하루라도 끊기면 거기서 종료 (오늘 포함 1일도 카운트).
 *
 * recent60 미로드 상태에서는 undefined 반환 (호출부에서 skeleton 분기).
 */
export function useStreak(): number | undefined {
  const { data } = useRecent60();
  if (!data) return undefined;

  const recordSet = new Set(data.map((r) => r.date));
  let streak = 0;
  let cursor = todayKey();
  // 안전 상한: RECENT_DAYS + 1 (그 이상은 60일 윈도우 밖이라 어차피 끊김)
  for (let i = 0; i <= RECENT_DAYS; i++) {
    if (recordSet.has(cursor)) {
      streak++;
      cursor = addDaysKey(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}
