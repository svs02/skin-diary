'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { addDaysKey, isFuture, todayKey } from '@/lib/utils/dateKey';
import { useToast } from '@/lib/toast';

/**
 * Week chips — streak<7일 때 노출되는 7일 챌린지 카드.
 *
 * Anchor: todayIdx = clamp(streak+1, 1, 7).
 *  - 1..todayIdx-1 = done (accent fill, white)
 *  - todayIdx     = today (1.5px ring + accent-dim, accent-text)
 *  - rest          = future (surface, hairline)
 *
 * 캘린더 호환: 칩 번호와 요일 라벨은 실제 dateKey에서 파생.
 * done/today 칩은 /record/{date} 링크, future 칩은 toast (CLAUDE.md §5.5).
 */
type ChipState = 'done' | 'today' | 'future';

function stateFor(idx: number, todayIdx: number): ChipState {
  if (idx < todayIdx) return 'done';
  if (idx === todayIdx) return 'today';
  return 'future';
}

export function WeekChips({ streak }: { streak: number }) {
  const t = useTranslations('overview.weekChips');
  const tFuture = useTranslations('record.calendar.future');
  const toast = useToast();
  const weekdays = t.raw('weekdaysShort') as string[]; // Sun-first (0=Sun..6=Sat)

  const futureToastMessage = tFuture('toast');
  const futureAriaLabel = tFuture('disabled');
  const handleFutureTap = useCallback(() => {
    toast.info(futureToastMessage);
  }, [toast, futureToastMessage]);

  const todayIdx = Math.min(Math.max(streak + 1, 1), 7);
  const done = Math.min(Math.max(streak, 0), 7);

  const chips = useMemo(() => {
    const today = todayKey();
    const firstKey = addDaysKey(today, -(todayIdx - 1));
    return Array.from({ length: 7 }).map((_, i) => {
      const dateKey = addDaysKey(firstKey, i);
      const day = Number(dateKey.slice(8, 10));
      const [y, m, d] = dateKey.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return {
        dateKey,
        day,
        dow,
        state: stateFor(i + 1, todayIdx),
        future: isFuture(dateKey),
      };
    });
  }, [todayIdx]);

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-[6px]">
        {chips.map((chip) => {
          const s = chip.state;
          const dow = weekdays[chip.dow] ?? '';

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

          const inner = (
            <>
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
                {chip.day}
              </span>
            </>
          );

          const className = `${baseClass} ${stateClass} ${textColor}`;
          const ariaLabel = `${chip.dateKey} ${s}`;

          if (chip.future) {
            return (
              <button
                key={chip.dateKey}
                type="button"
                onClick={handleFutureTap}
                aria-disabled="true"
                aria-label={futureAriaLabel}
                className={`${className} cursor-not-allowed`}
                style={stateStyle}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={chip.dateKey}
              href={`/record/${chip.dateKey}`}
              aria-label={ariaLabel}
              aria-current={s === 'today' ? 'date' : undefined}
              className={className}
              style={stateStyle}
            >
              {inner}
            </Link>
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
