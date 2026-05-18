'use client';

import useSWR from 'swr';
import { getDailyRecord } from '@/lib/firebase/dailyRecord';
import { fetchSignedURLs } from '@/lib/storage/signedUrl';
import type { Angle, DailyRecord } from '@/types';

/**
 * Compare 페이지에서 두 날짜의 record + 해당 angle photo URL을 동시에 로드.
 *
 * SWR 키 네임스페이스:
 *   ['compare/record', uid, dateKey]
 *   ['compare/photoUrls', uid, fromKey, toKey, angle]  // batch fetch 키
 *
 * 가드:
 *  - uid가 null이면 모든 키를 null (자동 비활성)
 *  - photoUrl 페치는 두 record가 모두 해당 angle의 사진을 갖고 있을 때 batch 호출.
 *    한쪽만 있는 경우는 그 한쪽만 요청. 둘 다 없으면 키 null.
 *  - 404 분기는 더 이상 fetcher에서 처리하지 않음 — <img onError>가 처리.
 */

type RecordKey = readonly ['compare/record', string, string];
type PhotoUrlsKey = readonly [
  'compare/photoUrls',
  string,
  string,
  string,
  Angle,
  /* fromHas */ boolean,
  /* toHas */ boolean,
];

async function recordFetcher([, uid, dateKey]: RecordKey): Promise<DailyRecord | null> {
  return getDailyRecord(uid, dateKey);
}

async function photoUrlsFetcher([
  ,
  ,
  fromKey,
  toKey,
  angle,
  fromHas,
  toHas,
]: PhotoUrlsKey): Promise<{ from: string | null; to: string | null }> {
  const items: { date: string; angle: Angle }[] = [];
  if (fromHas) items.push({ date: fromKey, angle });
  if (toHas) items.push({ date: toKey, angle });
  if (items.length === 0) return { from: null, to: null };

  try {
    const map = await fetchSignedURLs(items);
    return {
      from: fromHas ? (map.get(`${fromKey}/${angle}`)?.url ?? null) : null,
      to: toHas ? (map.get(`${toKey}/${angle}`)?.url ?? null) : null,
    };
  } catch {
    // batch 실패 시 양쪽 모두 placeholder. (개별 404는 새 헬퍼 흐름에서 발생하지 않음 — 200+URL,
    // 객체 누락은 호출부 <img onError>가 처리.)
    return { from: null, to: null };
  }
}

export interface UseCompareDataResult {
  records: {
    from: DailyRecord | null | undefined;
    to: DailyRecord | null | undefined;
  };
  urls: {
    from: string | null | undefined;
    to: string | null | undefined;
  };
  isLoading: boolean;
}

function isValidKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key);
}

export function useCompareData(
  uid: string | null,
  fromKey: string,
  toKey: string,
  angle: Angle,
): UseCompareDataResult {
  const fromValid = isValidKey(fromKey);
  const toValid = isValidKey(toKey);
  const fromRecKey: RecordKey | null =
    uid && fromValid ? (['compare/record', uid, fromKey] as const) : null;
  const toRecKey: RecordKey | null =
    uid && toValid ? (['compare/record', uid, toKey] as const) : null;

  const fromRecord = useSWR<DailyRecord | null>(
    fromRecKey,
    (key) => recordFetcher(key as RecordKey),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  const toRecord = useSWR<DailyRecord | null>(
    toRecKey,
    (key) => recordFetcher(key as RecordKey),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const fromHasPhoto = !!fromRecord.data?.photos?.[angle];
  const toHasPhoto = !!toRecord.data?.photos?.[angle];

  // batch key: from/to 둘 중 하나라도 있으면 활성화. 둘 다 없으면 null.
  const urlsKey: PhotoUrlsKey | null =
    uid && (fromHasPhoto || toHasPhoto)
      ? ([
          'compare/photoUrls',
          uid,
          fromKey,
          toKey,
          angle,
          fromHasPhoto,
          toHasPhoto,
        ] as const)
      : null;

  // URL은 10분 TTL이라 방치된 탭으로 돌아왔을 때 만료되어 있을 수 있다.
  // revalidateOnFocus로 다시 fetcher를 돌리면 signedUrl.ts의 모듈 캐시가
  // HIT_BUFFER_MS=60s 전부터 miss로 판정해 자동 재발급한다 — 만료 전이면
  // 캐시 hit으로 서버 호출 0. records SWR은 변경 빈도가 낮아 false 유지.
  const urls = useSWR<{ from: string | null; to: string | null }>(
    urlsKey,
    (key) => photoUrlsFetcher(key as PhotoUrlsKey),
    { revalidateOnFocus: true, dedupingInterval: 30_000 },
  );

  // 사진이 없는 쪽은 url=null로 즉시 결정 (loading 아님).
  const fromUrlResolved: string | null | undefined = fromHasPhoto
    ? urls.data?.from
    : null;
  const toUrlResolved: string | null | undefined = toHasPhoto ? urls.data?.to : null;

  const isLoading =
    (uid && (fromRecord.isLoading || toRecord.isLoading)) ||
    ((fromHasPhoto || toHasPhoto) && urls.isLoading) ||
    false;

  return {
    records: { from: fromRecord.data, to: toRecord.data },
    urls: { from: fromUrlResolved, to: toUrlResolved },
    isLoading: !!isLoading,
  };
}
