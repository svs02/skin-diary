'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useRecent60 } from './useOverviewData';
import { getAngleDownloadURL } from '@/lib/storage/upload';
import { pickFirstAngle } from '@/lib/utils/comparePair';
import { todayKey } from '@/lib/utils/dateKey';
import type { Angle } from '@/types';

/**
 * Recent gallery — bg-surface, py-12 px-4, top hairline.
 *  - Gate: 사진 ≥ 2장 (hero가 가져간 첫 1장 제외 후 ≥ 1장도 사실 노출)
 *  - 정확히는: photoCount >= 2일 때 노출 (hero 1장 + 갤러리 1장 이상이면 의미있음)
 *  - hero가 가져간 가장 최근 1장은 제외하고 다음 6장까지.
 *  - n <= 3: 가로 스크롤 144 / n >= 4: 2열 격자 165
 */

const MAX_ITEMS = 6;

type Item = { date: string; angle: Angle; url: string | null };

function formatMD(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function RecentGalleryBlock() {
  const { user } = useAuth();
  const { data, isLoading } = useRecent60();
  const t = useTranslations('overview.recent');

  // hero가 오늘 사진을 가져갔으므로, 갤러리 candidate에서 todayKey()는 제외.
  const candidates = useMemo(() => {
    if (!data) return null;
    const today = todayKey();
    const out: { date: string; angle: Angle }[] = [];
    // recent60은 ASC 정렬이므로 reverse — 최신 우선
    for (let i = data.length - 1; i >= 0 && out.length < MAX_ITEMS; i--) {
      const item = data[i];
      const angle = pickFirstAngle(item.photos);
      if (!angle) continue;
      // hero가 오늘 사진을 가져갔으므로 today는 스킵
      if (item.date === today) continue;
      out.push({ date: item.date, angle });
    }
    return out;
  }, [data]);

  const [resolved, setResolved] = useState<Item[]>([]);

  useEffect(() => {
    if (!user || !candidates) return;
    let cancelled = false;
    Promise.all(
      candidates.map(async (c) => {
        try {
          const url = await getAngleDownloadURL(user.uid, c.date, c.angle);
          return { ...c, url } as Item;
        } catch {
          return { ...c, url: null } as Item;
        }
      }),
    ).then((items) => {
      if (!cancelled) setResolved(items);
    });
    return () => {
      cancelled = true;
    };
  }, [user, candidates]);

  if (isLoading || !candidates) return null;
  if (candidates.length === 0) return null;

  const display = resolved.length > 0 ? resolved : candidates.map((c) => ({ ...c, url: null }));
  const isGrid = candidates.length >= 4;

  return (
    <section
      className="flex flex-col gap-5 bg-[color:var(--color-surface)] px-4 py-12"
      style={{ borderTop: '1px solid var(--color-border)' }}
      aria-label={t('title')}
    >
      <div className="flex items-baseline justify-between">
        <h3
          className="text-[22px] font-bold text-[color:var(--color-fg)]"
          style={{ letterSpacing: '-0.018em' }}
        >
          {t('title')}
        </h3>
        <Link
          href="/calendar"
          className="text-[15px] font-medium text-[color:var(--color-accent)] hover:underline"
        >
          {t('viewAll')} →
        </Link>
      </div>

      {isGrid ? (
        <div className="grid grid-cols-2 gap-[13px]">
          {display.slice(0, MAX_ITEMS).map((item) => (
            <GalleryCard key={`${item.date}-${item.angle}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="-mx-4 flex gap-[10px] overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {display.map((item) => (
            <GalleryCard
              key={`${item.date}-${item.angle}`}
              item={item}
              fixedSize={144}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GalleryCard({
  item,
  fixedSize,
}: {
  item: Item;
  fixedSize?: number;
}) {
  const sizeStyle = fixedSize
    ? { width: `${fixedSize}px`, height: `${fixedSize}px`, flexShrink: 0 as const }
    : undefined;

  return (
    <Link
      href={`/record/${item.date}`}
      className="flex flex-col gap-[6px] transition-[opacity,transform] duration-150 hover:opacity-95 active:scale-[0.98]"
      style={fixedSize ? { width: `${fixedSize}px`, flexShrink: 0 } : undefined}
      aria-label={item.date}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-[12px] bg-[color:var(--color-surface-2)]"
        style={{
          ...sizeStyle,
          boxShadow: 'inset 0 0 0 1px var(--color-border)',
        }}
      >
        {item.url ? (
          <Image
            src={item.url}
            alt=""
            fill
            sizes={fixedSize ? `${fixedSize}px` : '50vw'}
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>
      <span
        className="pl-[2px] text-[12px] text-[color:var(--color-fg-muted)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatMD(item.date)}
      </span>
    </Link>
  );
}
