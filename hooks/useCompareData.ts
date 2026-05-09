'use client';

import useSWR from 'swr';
import { getDailyRecord } from '@/lib/firebase/dailyRecord';
import { getAngleDownloadURL } from '@/lib/storage/upload';
import type { Angle, DailyRecord } from '@/types';

/**
 * Compare 페이지에서 두 날짜의 record + 해당 angle photo URL을 동시에 로드.
 *
 * SWR 키 네임스페이스:
 *   ['compare/record', uid, dateKey]
 *   ['compare/photoUrl', uid, dateKey, angle]
 *
 * 가드:
 *  - uid가 null이면 모든 키를 null (자동 비활성)
 *  - photoUrl 페치는 record가 해당 angle의 사진을 갖고 있을 때만 호출.
 *    그 외에는 url=null 반환 (storage/object-not-found 노이즈 방지).
 */

type RecordKey = readonly ['compare/record', string, string];
type PhotoUrlKey = readonly ['compare/photoUrl', string, string, Angle];

async function recordFetcher([, uid, dateKey]: RecordKey): Promise<DailyRecord | null> {
  return getDailyRecord(uid, dateKey);
}

async function photoUrlFetcher([, uid, dateKey, angle]: PhotoUrlKey): Promise<string | null> {
  try {
    return await getAngleDownloadURL(uid, dateKey, angle);
  } catch {
    return null;
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

  const fromUrlKey: PhotoUrlKey | null =
    uid && fromHasPhoto ? (['compare/photoUrl', uid, fromKey, angle] as const) : null;
  const toUrlKey: PhotoUrlKey | null =
    uid && toHasPhoto ? (['compare/photoUrl', uid, toKey, angle] as const) : null;

  const fromUrl = useSWR<string | null>(
    fromUrlKey,
    (key) => photoUrlFetcher(key as PhotoUrlKey),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  const toUrl = useSWR<string | null>(
    toUrlKey,
    (key) => photoUrlFetcher(key as PhotoUrlKey),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  // record는 페치 중일 수 있고, 해당 angle 사진이 있어야만 url 페치.
  // 사진이 없는 경우 url=null로 즉시 결정 (loading 아님).
  const fromUrlResolved: string | null | undefined = fromHasPhoto ? fromUrl.data : null;
  const toUrlResolved: string | null | undefined = toHasPhoto ? toUrl.data : null;

  const isLoading =
    (uid && (fromRecord.isLoading || toRecord.isLoading)) ||
    (fromHasPhoto && fromUrl.isLoading) ||
    (toHasPhoto && toUrl.isLoading) ||
    false;

  return {
    records: { from: fromRecord.data, to: toRecord.data },
    urls: { from: fromUrlResolved, to: toUrlResolved },
    isLoading: !!isLoading,
  };
}
