'use client';

import { useTranslations } from 'next-intl';

/**
 * Week chips — streak<7일 때 노출되는 7일 챌린지 카드.
 *
 * Anchor: todayIdx = clamp(streak+1, 1, 7).
 *  - 1..todayIdx-1 = done (accent fill, white)
 *  - todayIdx     = today (1.5px ring + accent-dim, accent-text)
 *  - rest          = future (surface, hairline)
 *
 * day-of-week glyph는 캘린더 요일이 아닌 단순 표시 라벨 (월화수…).
 * day index는 챌린지 1..7 (캘린더 요일과 무관).
 */
type ChipState = 'done' | 'today' | 'future';

function stateFor(idx: number, todayIdx: number): ChipState {
  if (idx < todayIdx) return 'done';
  if (idx === todayIdx) return 'today';
  return 'future';
}

export function WeekChips({ streak }: { streak: number }) {
  const t = useTranslations('overview.weekChips');
  const weekdays = t.raw('weekdaysShort') as string[];

  const todayIdx = Math.min(Math.max(streak + 1, 1), 7);
  const done = Math.min(Math.max(streak, 0), 7);

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-[6px]">
        {Array.from({ length: 7 }).map((_, i) => {
          const idx = i + 1;
          const s = stateFor(idx, todayIdx);
          const dow = weekdays[i] ?? '';

          const baseClass =
            'flex flex-col items-center justify-center gap-[2px] rounded-[10px] transition-all duration-200';
          let stateClass = '';
          let stateStyle: React.CSSProperties = {
            aspectRatio: '1 / 1.18',
          };
          let textColor = '';

          if (s === 'done') {
            stateClass = 'bg-[color:var(--color-accent)]';
            textColor = 'text-white';
          } else if (s === 'today') {
            stateClass = 'bg-[color:var(--color-accent-dim)]';
            stateStyle = {
              ...stateStyle,
              boxShadow: 'inset 0 0 0 1.5px var(--color-accent)',
            };
            textColor = 'text-[color:var(--color-accent-text)]';
          } else {
            stateClass = 'bg-[color:var(--color-surface)]';
            stateStyle = {
              ...stateStyle,
              boxShadow: 'inset 0 0 0 1px var(--color-border)',
            };
            textColor = 'text-[color:var(--color-fg-subtle)]';
          }

          return (
            <div
              key={idx}
              className={`${baseClass} ${stateClass} ${textColor}`}
              style={stateStyle}
              aria-label={`Day ${idx} ${s}`}
            >
              <span
                className="text-[10px] font-semibold uppercase"
                style={{ letterSpacing: '0.04em', opacity: s === 'done' ? 0.95 : 1 }}
              >
                {dow}
              </span>
              <span
                className="text-[13px] font-semibold"
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  opacity: s === 'done' ? 0.95 : 1,
                }}
              >
                {idx}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[color:var(--color-fg)]">
          {t('title')}
        </span>
        <span
          className="text-[13px] text-[color:var(--color-fg-muted)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {t('fraction', { done })}
        </span>
      </div>
    </div>
  );
}
