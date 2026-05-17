'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useRecent60, useStreak } from './useOverviewData';
import { fetchSignedURLs } from '@/lib/storage/signedUrl';
import { pickComparePair } from '@/lib/utils/comparePair';

/**
 * Compare block — bg-bg, py-12 px-4.
 *  - Gate: streak >= 7 + pickComparePair(minGapDays:7) 결과 존재
 *  - eyebrow + title + 사진 페어 + 인라인 텍스트 링크
 */

function formatMD(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function CompareBlock() {
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
        // batch 호출: 2개 사진 한 번에 요청
        const map = await fetchSignedURLs([
          { date: pair.from.date, angle: pair.from.angle },
          { date: pair.to.date, angle: pair.to.angle },
        ]);
        if (!cancelled) {
          setOldUrl(map.get(`${pair.from.date}/${pair.from.angle}`)?.url ?? null);
          setNewUrl(map.get(`${pair.to.date}/${pair.to.angle}`)?.url ?? null);
        }
      } catch {
        // 네트워크/401 재시도 실패 — placeholder 유지
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
    <section className="bg-[color:var(--color-bg)] px-4 py-12">
      <p
        className="mb-[6px] text-[11px] font-semibold uppercase text-[color:var(--color-fg-subtle)]"
        style={{ letterSpacing: '0.12em' }}
      >
        {t('eyebrow')}
      </p>
      <h3
        className="mb-5 text-[22px] font-bold text-[color:var(--color-fg)]"
        style={{ letterSpacing: '-0.018em' }}
      >
        {t('title')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <ComparePhoto
          url={oldUrl}
          caption={t('thenLabel', { n: pair.days, date: formatMD(pair.from.date) })}
        />
        <ComparePhoto
          url={newUrl}
          caption={t('nowLabel', { date: formatMD(pair.to.date) })}
        />
      </div>
      <div className="mt-4">
        <Link
          href={compareHref}
          className="text-[15px] font-medium text-[color:var(--color-accent)] hover:underline"
        >
          {t('cta')} →
        </Link>
      </div>
    </section>
  );
}

function ComparePhoto({ url, caption }: { url: string | null; caption: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative aspect-square overflow-hidden rounded-[12px] bg-[color:var(--color-surface-2)]"
        style={{ boxShadow: 'inset 0 0 0 1px var(--color-border)' }}
      >
        {url && (
          <Image
            src={url}
            alt=""
            fill
            sizes="50vw"
            className="object-cover"
            unoptimized
          />
        )}
      </div>
      <span
        className="text-[12px] text-[color:var(--color-fg-muted)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {caption}
      </span>
    </div>
  );
}
