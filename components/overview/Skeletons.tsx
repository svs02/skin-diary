'use client';

/**
 * Overview 스켈레톤 — HeroBlock fallback용 단일 스켈레톤만 유지.
 * 새 레이아웃: bg-bg + 16/16/56 padding + 16px gap.
 *  - eyebrow 라인
 *  - 1:1 photo placeholder
 *  - 56px 숫자 placeholder
 *  - week chip row placeholder
 *  - 52px pill placeholder
 */

const PULSE = 'animate-pulse bg-[color:var(--color-surface-2)]';

export function StreakHeroSkeleton() {
  return (
    <section
      aria-hidden
      className="flex flex-col gap-5 bg-[color:var(--color-bg)] px-4 pb-14 pt-4"
    >
      <div className={`h-[14px] w-2/3 rounded ${PULSE}`} />
      <div className={`aspect-square w-full rounded-[16px] ${PULSE}`} />
      <div className={`h-[56px] w-[120px] rounded-md ${PULSE}`} />
      <div className="grid grid-cols-7 gap-[6px]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={`rounded-[10px] ${PULSE}`}
            style={{ aspectRatio: '1 / 1.18' }}
          />
        ))}
      </div>
      <div className={`h-[52px] w-full rounded-full ${PULSE}`} />
    </section>
  );
}
