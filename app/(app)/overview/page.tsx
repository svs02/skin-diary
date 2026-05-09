'use client';

import { Suspense } from 'react';
import { GreetingHeader } from '@/components/overview/GreetingHeader';
import { StreakHero } from '@/components/overview/StreakHero';
import { DotStrip21 } from '@/components/overview/DotStrip21';
import { TodayCard } from '@/components/overview/TodayCard';
import { RecentStrip } from '@/components/overview/RecentStrip';
import { CompareNudge } from '@/components/overview/CompareNudge';
import { MonthlyStats } from '@/components/overview/MonthlyStats';
import { EmptyTip } from '@/components/overview/EmptyTip';
import {
  StreakHeroSkeleton,
  DotStripSkeleton,
  TodayCardSkeleton,
  RecentStripSkeleton,
} from '@/components/overview/Skeletons';

/**
 * Overview tab — Skin Diary 홈 (CLAUDE.md §5.2 fixed flow의 진입점).
 *
 * 페이지 자체는 단순 컴포지션. 데이터는 각 섹션에서 SWR로 가져온다.
 * 인증 가드는 (app)/layout.tsx의 useRequireAuth가 담당하므로 여기선 별도 처리 X.
 *
 * Suspense fallback은 모든 섹션이 'use client'라 실제로 트리거되진 않지만,
 * 앞으로 RSC/streaming 도입 시 자연스럽게 동작하도록 골격을 미리 둔다.
 *
 * Streak 게이트 섹션 (CompareNudge / MonthlyStats / EmptyTip)은 Suspense fallback={null}로
 * 자체 가드가 통과 전까지는 자리도 차지하지 않는다.
 */
export default function OverviewPage() {
  return (
    <div className="-mx-5 flex flex-col gap-3 px-4 pb-24 pt-3">
      <GreetingHeader />
      <Suspense fallback={<StreakHeroSkeleton />}>
        <StreakHero />
      </Suspense>
      <Suspense fallback={<DotStripSkeleton />}>
        <DotStrip21 />
      </Suspense>
      <Suspense fallback={<TodayCardSkeleton />}>
        <TodayCard />
      </Suspense>
      <Suspense fallback={<RecentStripSkeleton />}>
        <RecentStrip />
      </Suspense>
      <Suspense fallback={null}>
        <CompareNudge />
      </Suspense>
      <Suspense fallback={null}>
        <MonthlyStats />
      </Suspense>
      <Suspense fallback={null}>
        <EmptyTip />
      </Suspense>
    </div>
  );
}
