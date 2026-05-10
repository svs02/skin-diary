'use client';

import { useTranslations } from 'next-intl';
import { useStreak } from './useOverviewData';

/**
 * Streak hero text:
 *  - streak >= 1: 56px 숫자 + 24px 단위 같은 줄 (`연속 기록 중` 캡션 없음)
 *  - streak === 0: 32px display 헤드라인 `오늘부터 시작해요`
 *  - streak undefined: null (Suspense fallback이 처리)
 *
 * 카드 박스/패딩 없음 — 부모 HeroBlock가 surface 제공.
 */
export function StreakHero() {
  const t = useTranslations('overview.streak');
  const streak = useStreak();

  if (streak === undefined) return null;

  if (streak === 0) {
    return (
      <h2
        className="font-bold text-[color:var(--color-fg)]"
        style={{
          fontSize: 'var(--text-streak-empty)',
          lineHeight: 'var(--text-streak-empty--line-height)',
          letterSpacing: 'var(--text-streak-empty--letter-spacing)',
        }}
      >
        {t('emptyHeadline')}
      </h2>
    );
  }

  return (
    <h2
      className="font-bold text-[color:var(--color-fg)]"
      style={{
        fontSize: 'var(--text-streak-hero)',
        lineHeight: 'var(--text-streak-hero--line-height)',
        letterSpacing: 'var(--text-streak-hero--letter-spacing)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {t('unitDays', { n: streak })}
      <span className="ml-1 text-[24px] font-semibold text-[color:var(--color-fg-muted)]">
        {t('unitLabel')}
      </span>
    </h2>
  );
}
