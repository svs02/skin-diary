'use client';

import { useStreak } from './useOverviewData';
import { MonthlyStats } from './MonthlyStats';
import { EmptyTip } from './EmptyTip';

/**
 * META 인라인 블록 — bg-surface-2, py-6 px-4.
 *  - streak >= 30: <MonthlyStats />
 *  - streak < 7  : <EmptyTip />
 *  - 그 외       : 블록 자체 unmount
 *
 * 두 자식은 자가 가시성 가드도 함께 갖고 있어 중첩 안전.
 */
export function MetaInlineBlock() {
  const streak = useStreak();

  if (streak === undefined) return null;
  const showStats = streak >= 30;
  const showTip = streak < 7;

  if (!showStats && !showTip) return null;

  return (
    <section className="bg-[color:var(--color-surface-2)] px-4 py-6">
      {showStats && <MonthlyStats />}
      {showTip && <EmptyTip />}
    </section>
  );
}
