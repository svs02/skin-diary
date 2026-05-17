'use client';

import { useStreak } from './useOverviewData';
import { MonthlyStats } from './MonthlyStats';
import { EmptyTip } from './EmptyTip';
import { useOverviewTipDismissed } from '@/lib/overview/useOverviewTipDismissed';

/**
 * META 인라인 블록 — bg-surface-2, py-6 px-4.
 *  - streak >= 30           : <MonthlyStats />
 *  - streak < 7 && !dismissed: <EmptyTip />
 *  - 그 외                  : 블록 자체 unmount (빈 회색 섹션 방지)
 *
 * dismissed 판정은 EmptyTip과 동일한 공용 훅 사용 — 자식이 null을 반환해
 * 빈 surface만 남는 버그를 방지한다.
 */
export function MetaInlineBlock() {
  const streak = useStreak();
  const tipDismissed = useOverviewTipDismissed();

  if (streak === undefined) return null;
  const showStats = streak >= 30;
  const showTip = streak < 7 && !tipDismissed;

  if (!showStats && !showTip) return null;

  return (
    <section className="bg-[color:var(--color-surface-2)] px-4 py-6">
      {showStats && <MonthlyStats />}
      {showTip && <EmptyTip />}
    </section>
  );
}
