'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRecent60 } from './useOverviewData';
import { addDaysKey, todayKey } from '@/lib/utils/dateKey';

/**
 * 최근 21일 dot strip — streak >= 7 fallback 컴포넌트.
 * 점 직경 6px, 가로 gap 4px, 7개마다 8px gap.
 *
 * 채움 기준: 해당 dateKey의 record가 존재하면 채움.
 *  - 채움 = bg-accent / 비채움 = inset 1px hairline (border-strong)
 * 시계열: 좌측이 가장 오래된 21일 전, 우측이 오늘.
 */
const DAY_COUNT = 21;

export function DotStrip21() {
  const { data } = useRecent60();
  const t = useTranslations('overview.dot21');

  const dots = useMemo(() => {
    if (!data) return null;
    const recordSet = new Set(data.map((r) => r.date));
    const today = todayKey();
    const out: { date: string; filled: boolean }[] = [];
    for (let i = DAY_COUNT - 1; i >= 0; i--) {
      const d = addDaysKey(today, -i);
      out.push({ date: d, filled: recordSet.has(d) });
    }
    return out;
  }, [data]);

  if (!dots) return null;

  return (
    <section className="flex flex-col gap-2" aria-label={t('title')}>
      <p
        className="text-[10px] font-semibold uppercase text-[color:var(--color-fg-subtle)]"
        style={{ letterSpacing: '0.08em' }}
      >
        {t('title')}
      </p>
      <div className="flex h-[6px] items-center">
        {dots.map((d, i) => {
          const extraGap = i > 0 && i % 7 === 0;
          const ml = i === 0 ? '' : extraGap ? 'ml-2' : 'ml-1';
          return (
            <span
              key={d.date}
              aria-label={d.date}
              className={`block h-[6px] w-[6px] rounded-full ${ml}`}
              style={
                d.filled
                  ? { background: 'var(--color-accent)' }
                  : { boxShadow: 'inset 0 0 0 1px var(--color-border-strong)' }
              }
            />
          );
        })}
      </div>
    </section>
  );
}
