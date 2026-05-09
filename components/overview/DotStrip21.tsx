'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRecent60 } from './useOverviewData';
import { DotStripSkeleton } from './Skeletons';
import { addDaysKey, todayKey } from '@/lib/utils/dateKey';

/**
 * 최근 21일 dot strip — 점 직경 6px, 가로 gap 4px, 7개마다 8px gap.
 *
 * 채움 기준: 해당 dateKey의 record가 존재(= recent60에 포함)하면 채움.
 *  - photos 메타와 무관하게 "기록 있는 날" 기준 (Streak 정의와 일관).
 *  - 채움 = bg-accent / 비채움 = border-color-text-tertiary.
 *
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

  if (!dots) return <DotStripSkeleton />;

  return (
    <section className="flex flex-col gap-2 px-1" aria-label={t('title')}>
      <p
        className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-fg-subtle)]"
        style={{ letterSpacing: '0.08em' }}
      >
        {t('title')}
      </p>
      <div className="flex h-[6px] items-center">
        {dots.map((d, i) => {
          // 7개마다 추가 간격: i가 7, 14인 위치(8번째, 15번째)에서 ml-2 (8px)
          // 그 외엔 ml-1 (4px). 첫 dot은 margin 없음.
          const extraGap = i > 0 && i % 7 === 0;
          const ml = i === 0 ? '' : extraGap ? 'ml-2' : 'ml-1';
          return (
            <span
              key={d.date}
              aria-label={d.date}
              className={`block h-[6px] w-[6px] rounded-full ${ml} ${
                d.filled
                  ? 'bg-[color:var(--color-accent)]'
                  : 'border border-[color:var(--color-text-tertiary)]'
              }`}
            />
          );
        })}
      </div>
    </section>
  );
}
