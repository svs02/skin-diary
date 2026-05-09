'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useRecent60, useStreak } from './useOverviewData';
import { getAngleDownloadURL } from '@/lib/storage/upload';
import { pickComparePair } from '@/lib/utils/comparePair';

/**
 * Compare nudge — Streak ≥ 7일에서 자체 가드로 노출.
 * 페어링은 lib/utils/comparePair#pickComparePair (minGapDays: 7)로 위임.
 */

export function CompareNudge() {
  const { user } = useAuth();
  const streak = useStreak();
  const { data } = useRecent60();
  const t = useTranslations('overview.compare');

  const pair = useMemo(() => {
    if (!data) return null;
    return pickComparePair(data, { minGapDays: 7 });
  }, [data]);

  const [oldUrl, setOldUrl] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !pair) return;
    let cancelled = false;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          getAngleDownloadURL(user.uid, pair.from.date, pair.from.angle),
          getAngleDownloadURL(user.uid, pair.to.date, pair.to.angle),
        ]);
        if (!cancelled) {
          setOldUrl(a);
          setNewUrl(b);
        }
      } catch {
        // 객체 누락 시 그대로 placeholder 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, pair]);

  if (streak === undefined || streak < 7) return null;
  if (!pair) return null;

  const compareHref = `/compare?from=${pair.from.date}&to=${pair.to.date}&angle=${pair.angle}`;

  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-[color:var(--color-surface)] p-[18px] shadow-[var(--shadow-sm)]">
      <p className="text-[15px] font-semibold text-[color:var(--color-fg)]">
        {t('title', { n: pair.days })}
      </p>
      <div className="flex items-center gap-3">
        <div className="relative aspect-square h-[88px] w-[88px] overflow-hidden rounded-[12px] bg-[color:var(--color-surface-2)]">
          {oldUrl && (
            <Image
              src={oldUrl}
              alt=""
              width={88}
              height={88}
              className="h-full w-full object-cover"
              unoptimized
            />
          )}
        </div>
        <div className="relative aspect-square h-[88px] w-[88px] overflow-hidden rounded-[12px] bg-[color:var(--color-surface-2)]">
          {newUrl && (
            <Image
              src={newUrl}
              alt=""
              width={88}
              height={88}
              className="h-full w-full object-cover"
              unoptimized
            />
          )}
        </div>
        <Link
          href={compareHref}
          className="ml-auto inline-flex h-[40px] items-center justify-center rounded-[12px] bg-[color:var(--color-accent)] px-4 text-[13px] font-semibold text-[color:var(--color-accent-text)] hover:opacity-90"
        >
          {t('cta')}
        </Link>
      </div>
    </section>
  );
}
