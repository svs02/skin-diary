'use client';

import { useTranslations } from 'next-intl';
import { GreetingHeader } from './GreetingHeader';
import { HeroPhoto } from './HeroPhoto';
import { StreakHero } from './StreakHero';
import { WeekChips } from './WeekChips';
import { DotStrip21 } from './DotStrip21';
import { TodayCard } from './TodayCard';
import { useStreak, useTodayRecord } from './useOverviewData';
import type { DailyRecord } from '@/types';

/**
 * HERO 블록 — Eyebrow → Photo → Streak → Week motivator → CTA pill (+ 선택적 subtext).
 *
 * Surface: bg-bg, padding 16/16/56.
 * Week motivator 분기: streak<7 → WeekChips, streak>=7 → DotStrip21.
 * CTA variant: 오늘 record가 isDone()이면 secondary, 그 외 primary.
 * Subtitle: streak<7 또는 record 비어있을 때만.
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

export function HeroBlock() {
  const tToday = useTranslations('overview.today');
  const streak = useStreak();
  const { data: today } = useTodayRecord();

  const streakKnown = streak !== undefined;
  const showSubtitle = streakKnown && (streak < 7 || today === null);
  const ctaVariant: 'primary' | 'secondary' =
    today && isDone(today) ? 'secondary' : 'primary';

  return (
    <section
      className="flex flex-col gap-5 bg-[color:var(--color-bg)] px-4 pb-14 pt-4"
      aria-label="hero"
    >
      <GreetingHeader />
      <HeroPhoto />
      <StreakHero />
      {streakKnown ? (
        streak < 7 ? (
          <WeekChips streak={streak} />
        ) : (
          <DotStrip21 />
        )
      ) : null}
      <div className="flex flex-col gap-2">
        <TodayCard variant={ctaVariant} />
        {showSubtitle && (
          <p className="text-center text-[13px] text-[color:var(--color-fg-muted)]">
            {tToday('ctaSubtitle')}
          </p>
        )}
      </div>
    </section>
  );
}
