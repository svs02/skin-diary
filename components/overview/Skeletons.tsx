'use client';

/**
 * Overview 섹션별 스켈레톤. CLS=0 목표:
 *  - 실제 카드와 동일한 outer height/padding을 유지.
 *  - 내부는 surface-2 + animate-pulse.
 */

const PULSE = 'animate-pulse bg-[color:var(--color-surface-2)]';

export function StreakHeroSkeleton() {
  return (
    <section
      aria-hidden
      className="flex flex-col items-center gap-2 rounded-[22px] bg-[color:var(--color-surface)] px-5 py-7 shadow-[var(--shadow-sm)]"
    >
      <div className={`h-[44px] w-32 rounded-md ${PULSE}`} />
      <div className={`h-[14px] w-24 rounded-md ${PULSE}`} />
    </section>
  );
}

export function DotStripSkeleton() {
  return (
    <section aria-hidden className="flex flex-col gap-2 px-1">
      <div className={`h-[10px] w-20 rounded ${PULSE}`} />
      <div className="flex h-[6px] items-center gap-1">
        {Array.from({ length: 21 }).map((_, i) => (
          <span
            key={i}
            className={`h-[6px] w-[6px] rounded-full ${PULSE} ${
              i > 0 && i % 7 === 0 ? 'ml-1' : ''
            }`}
          />
        ))}
      </div>
    </section>
  );
}

export function TodayCardSkeleton() {
  return (
    <section
      aria-hidden
      className="flex flex-col gap-3 rounded-[22px] bg-[color:var(--color-surface)] p-[18px_18px_16px] shadow-[var(--shadow-lg)]"
    >
      <div className={`h-[10px] w-12 rounded ${PULSE}`} />
      <div className={`h-[18px] w-3/4 rounded-md ${PULSE}`} />
      <div className={`mt-1 h-[44px] w-full rounded-[14px] ${PULSE}`} />
      <div className={`h-[12px] w-1/2 rounded ${PULSE}`} />
    </section>
  );
}

export function RecentStripSkeleton() {
  return (
    <section aria-hidden className="flex flex-col gap-2">
      <div className={`h-[14px] w-24 rounded ${PULSE}`} />
      <div className="flex gap-2 overflow-x-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`h-[64px] w-[64px] shrink-0 rounded-[12px] ${PULSE}`} />
        ))}
      </div>
    </section>
  );
}
