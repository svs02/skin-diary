'use client';

import { useTranslations } from 'next-intl';
import { useStreak } from './useOverviewData';
import { StreakHeroSkeleton } from './Skeletons';

/**
 * Streak Hero — Overview 최상단 정량 보조.
 *  - 큰 숫자는 text-display-md (40px, weight 700) 토큰 사용. 일반 헤딩에 사용 금지.
 *  - 0일 = emptyCaption / 1일 이상 = loadedCaption.
 */
export function StreakHero() {
  const t = useTranslations('overview.streak');
  const streak = useStreak();

  if (streak === undefined) return <StreakHeroSkeleton />;

  return (
    <section
      className="flex flex-col items-center gap-1 rounded-[22px] bg-[color:var(--color-surface)] px-5 py-7 shadow-[var(--shadow-sm)]"
      aria-label="streak"
    >
      <p
        className="text-display-md font-bold tracking-tight text-[color:var(--color-fg)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {t('unitDays', { n: streak })}
      </p>
      <p className="text-[13px] text-[color:var(--color-fg-muted)]">
        {streak === 0 ? t('emptyCaption') : t('loadedCaption')}
      </p>
    </section>
  );
}
