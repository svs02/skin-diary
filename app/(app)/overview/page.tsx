'use client';

import { Suspense } from 'react';
import { HeroBlock } from '@/components/overview/HeroBlock';
import { RecentGalleryBlock } from '@/components/overview/RecentGalleryBlock';
import { CompareBlock } from '@/components/overview/CompareBlock';
import { MetaInlineBlock } from '@/components/overview/MetaInlineBlock';
import { StreakHeroSkeleton } from '@/components/overview/Skeletons';

/**
 * Overview tab — Skin Diary 홈 (CLAUDE.md §5.2 fixed flow의 진입점).
 *
 * 4개 블록 수직 스택. 각 블록이 자기 surface + padding을 갖고, 색면 교차로 경계 형성.
 * (app)/layout.tsx의 외부 padding(px-5 pb-6 pt-6)을 음수 마진으로 상쇄해 edge-to-edge 흐름.
 *
 * 인증 가드는 (app)/layout.tsx의 useRequireAuth가 담당하므로 여기선 별도 처리 X.
 */
export default function OverviewPage() {
  return (
    <div className="-mx-5 -mb-6 -mt-6 flex flex-col">
      <Suspense fallback={<StreakHeroSkeleton />}>
        <HeroBlock />
      </Suspense>
      <Suspense fallback={null}>
        <RecentGalleryBlock />
      </Suspense>
      <Suspense fallback={null}>
        <CompareBlock />
      </Suspense>
      <Suspense fallback={null}>
        <MetaInlineBlock />
      </Suspense>
    </div>
  );
}
