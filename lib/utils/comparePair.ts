import type { Angle } from '@/types';
import type { RecordRangeItem } from '@/lib/firebase/dailyRecord';
import { daysBetweenKeys } from '@/lib/utils/dateKey';

export const ANGLE_ORDER: Angle[] = ['front', 'left', 'right'];

type PhotoFlags = { front: boolean; left: boolean; right: boolean };

export function pickFirstAngle(photos: PhotoFlags): Angle | null {
  for (const a of ANGLE_ORDER) {
    if (photos[a]) return a;
  }
  return null;
}

export function pickSharedAngle(a: PhotoFlags, b: PhotoFlags): Angle | null {
  for (const angle of ANGLE_ORDER) {
    if (a[angle] && b[angle]) return angle;
  }
  return null;
}

export type ComparePair = {
  from: { date: string; angle: Angle };
  to: { date: string; angle: Angle };
  angle: Angle;
  days: number;
};

/**
 * recent60 같은 dateKey 오름차순 RecordRangeItem 배열에서
 * 가장 오래된 사진 항목과 가장 최근 사진 항목을 잡아 비교 페어를 만든다.
 *
 *  - 공통 angle이 있으면 그 angle 우선 (front > left > right)
 *  - 없으면 latest의 1순위 angle을 메인으로 쓰되, oldest는 자기 1순위로 fallback
 *  - opts.minGapDays(default 0) 미만 간격이면 null
 */
export function pickComparePair(
  records: RecordRangeItem[],
  opts: { minGapDays?: number } = {},
): ComparePair | null {
  const { minGapDays = 0 } = opts;
  const withPhotos = records.filter(
    (r) => r.photos.front || r.photos.left || r.photos.right,
  );
  if (withPhotos.length < 2) return null;
  const oldest = withPhotos[0];
  const latest = withPhotos[withPhotos.length - 1];
  if (oldest.date === latest.date) return null;

  const days = daysBetweenKeys(oldest.date, latest.date);
  if (days < minGapDays) return null;

  const shared = pickSharedAngle(oldest.photos, latest.photos);
  const angle =
    shared ?? pickFirstAngle(latest.photos) ?? pickFirstAngle(oldest.photos);
  if (!angle) return null;

  return {
    from: {
      date: oldest.date,
      angle: oldest.photos[angle] ? angle : pickFirstAngle(oldest.photos)!,
    },
    to: {
      date: latest.date,
      angle: latest.photos[angle] ? angle : pickFirstAngle(latest.photos)!,
    },
    angle,
    days,
  };
}
