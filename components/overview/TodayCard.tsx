'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { todayKey } from '@/lib/utils/dateKey';
import { useStreak, useTodayRecord } from './useOverviewData';
import { TodayCardSkeleton } from './Skeletons';
import type { DailyRecord } from '@/types';

/**
 * 오늘 카드 — Overview 主 CTA.
 *
 * 분기:
 *  - data === undefined (로딩) → skeleton (Suspense fallback이 우선이지만 이중 안전)
 *  - data === null (미기록):
 *      Streak 0 → bodyEmptyFirstTime
 *      Streak >0 → bodyEmpty
 *  - data 존재:
 *      완료(사진 3장 + 라이프스타일 일부) → bodyDone (CTA secondary)
 *      그 외 부분 입력 → bodyPartial
 *
 * CTA 항상 활성화 (CLAUDE.md §5.4).
 */

function isDone(record: DailyRecord): boolean {
  const photoCount =
    (record.photos.front ? 1 : 0) +
    (record.photos.left ? 1 : 0) +
    (record.photos.right ? 1 : 0);
  const hasLifestyle =
    record.water > 0 ||
    !!record.food.trim() ||
    !!record.cosmetic.trim() ||
    record.exercise === true ||
    !!record.memo.trim();
  return photoCount >= 3 && hasLifestyle;
}

export function TodayCard() {
  const t = useTranslations('overview.today');
  const { data, isLoading } = useTodayRecord();
  const streak = useStreak();

  if (isLoading || data === undefined || streak === undefined) {
    return <TodayCardSkeleton />;
  }

  let body: string;
  let ctaSecondary = false;

  if (data === null) {
    body = streak === 0 ? t('bodyEmptyFirstTime') : t('bodyEmpty');
  } else if (isDone(data)) {
    body = t('bodyDone');
    ctaSecondary = true;
  } else {
    body = t('bodyPartial');
  }

  const cta = ctaSecondary ? t('ctaSecondary') : t('ctaPrimary');

  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-[color:var(--color-surface)] p-[18px_18px_16px] shadow-[var(--shadow-lg)]">
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-fg-subtle)]"
      >
        {t('labelOverline')}
      </p>
      <p className="text-[18px] font-medium leading-snug text-[color:var(--color-fg)]">
        {body}
      </p>
      <Link
        href={`/record/${todayKey()}`}
        className={`mt-1 flex h-[48px] items-center justify-center rounded-[14px] text-[15px] font-semibold transition-colors ${
          ctaSecondary
            ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-3)]'
            : 'bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)] hover:opacity-90'
        }`}
      >
        {cta}
      </Link>
      <p className="text-[12px] text-[color:var(--color-fg-muted)]">
        {t('ctaSubtitle')}
      </p>
    </section>
  );
}
