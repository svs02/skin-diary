'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useRecent60 } from './useOverviewData';
import { RecentStripSkeleton } from './Skeletons';
import { getAngleDownloadURL } from '@/lib/storage/upload';
import type { Angle } from '@/types';

/**
 * 최근 사진 strip — recent60에서 사진이 있는 항목만 필터, 최근 7개.
 *  - 정렬: dateKey 내림차순 (가장 최근이 좌측 첫 번째).
 *  - 항목 0개면 컴포넌트 자체 return null (자가 unmount).
 *  - thumb는 64×64 1:1 (CLAUDE.md §1.2 — Storage 원본이 1024×1024 정사각이므로 안전).
 *  - angle 우선순위: front → left → right (가장 대표적인 각도 노출).
 */

const MAX_ITEMS = 7;

function pickAngle(photos: { front: boolean; left: boolean; right: boolean }): Angle | null {
  if (photos.front) return 'front';
  if (photos.left) return 'left';
  if (photos.right) return 'right';
  return null;
}

type ResolvedItem = {
  date: string;
  angle: Angle;
  url: string | null; // null = 아직 미해결 / 실패
};

export function RecentStrip() {
  const { user } = useAuth();
  const { data, isLoading } = useRecent60();
  const t = useTranslations('overview.recent');

  const candidates = useMemo(() => {
    if (!data) return null;
    const filtered: { date: string; angle: Angle }[] = [];
    // 최신부터 (recent60은 ASC 정렬이므로 reverse)
    for (let i = data.length - 1; i >= 0 && filtered.length < MAX_ITEMS; i--) {
      const item = data[i];
      const angle = pickAngle(item.photos);
      if (angle) filtered.push({ date: item.date, angle });
    }
    return filtered;
  }, [data]);

  const [resolved, setResolved] = useState<ResolvedItem[]>([]);

  useEffect(() => {
    if (!user || !candidates) return;
    let cancelled = false;
    Promise.all(
      candidates.map(async (c) => {
        try {
          const url = await getAngleDownloadURL(user.uid, c.date, c.angle);
          return { ...c, url } as ResolvedItem;
        } catch {
          // object-not-found 등 — 메타와 실제 객체 불일치 시 thumb 생략
          return { ...c, url: null } as ResolvedItem;
        }
      }),
    ).then((items) => {
      if (!cancelled) setResolved(items);
    });
    return () => {
      cancelled = true;
    };
  }, [user, candidates]);

  if (isLoading || !candidates) return <RecentStripSkeleton />;
  if (candidates.length === 0) return null;

  // resolved 아직 안 도착했더라도 frame은 남겨야 CLS 방지
  const display = resolved.length > 0 ? resolved : candidates.map((c) => ({ ...c, url: null }));

  return (
    <section className="flex flex-col gap-2" aria-label={t('title')}>
      <p className="text-[13px] font-medium text-[color:var(--color-fg-muted)]">
        {t('title')}
      </p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {display.map((item) => (
          <Link
            key={`${item.date}-${item.angle}`}
            href={`/record/${item.date}`}
            className="block aspect-square h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[12px] bg-[color:var(--color-surface-2)]"
            aria-label={item.date}
          >
            {item.url ? (
              <Image
                src={item.url}
                alt=""
                width={64}
                height={64}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
