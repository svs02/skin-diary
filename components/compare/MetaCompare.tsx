'use client';

import { useTranslations } from 'next-intl';
import type { DailyRecord } from '@/types';

/**
 * 두 날짜의 라이프스타일 메타를 5행 비교표로 노출.
 *  - 한쪽 record가 null이면 그 컬럼 전체를 noRecord 메시지로.
 *  - 빈 문자열/0 등은 emptyValue ("—")로 폴백.
 *  - water는 waterUnit 포맷, exercise는 yes/no 라벨.
 */

interface Props {
  fromRecord: DailyRecord | null | undefined;
  toRecord: DailyRecord | null | undefined;
  fromDate: string;
  toDate: string;
}

type Row = {
  key: 'water' | 'food' | 'cosmetic' | 'exercise' | 'memo';
};

const ROWS: Row[] = [
  { key: 'water' },
  { key: 'food' },
  { key: 'cosmetic' },
  { key: 'exercise' },
  { key: 'memo' },
];

export function MetaCompare({ fromRecord, toRecord, fromDate, toDate }: Props) {
  const t = useTranslations('compare.meta');

  function valueFor(record: DailyRecord | null | undefined, key: Row['key']): string {
    if (!record) return '__noRecord__';
    switch (key) {
      case 'water':
        return record.water > 0 ? t('waterUnit', { n: record.water }) : '__empty__';
      case 'food':
        return record.food.trim() ? record.food : '__empty__';
      case 'cosmetic':
        return record.cosmetic.trim() ? record.cosmetic : '__empty__';
      case 'exercise':
        return record.exercise ? t('exerciseYes') : t('exerciseNo');
      case 'memo':
        return record.memo.trim() ? record.memo : '__empty__';
    }
  }

  return (
    <section
      className="rounded-[var(--radius-md)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-sm)]"
      aria-label={t('toggleOpen')}
    >
      <div className="grid grid-cols-[88px_1fr_1fr] gap-x-3 gap-y-3 text-[13px]">
        {/* 헤더 */}
        <div />
        <ColHeader date={fromDate} side="A" />
        <ColHeader date={toDate} side="B" />

        {ROWS.map((row) => (
          <Row
            key={row.key}
            label={t(row.key)}
            valueA={valueFor(fromRecord, row.key)}
            valueB={valueFor(toRecord, row.key)}
          />
        ))}
      </div>
    </section>
  );
}

function ColHeader({ date, side }: { date: string; side: 'A' | 'B' }) {
  return (
    <div className="flex items-baseline gap-1 text-[11px] font-semibold text-[color:var(--color-fg-muted)]">
      <span>{side}</span>
      <span className="text-[color:var(--color-fg-subtle)]">{date.slice(5)}</span>
    </div>
  );
}

function Row({
  label,
  valueA,
  valueB,
}: {
  label: string;
  valueA: string;
  valueB: string;
}) {
  return (
    <>
      <div className="text-[12px] font-medium text-[color:var(--color-fg-muted)]">{label}</div>
      <ValueCell value={valueA} />
      <ValueCell value={valueB} />
    </>
  );
}

function ValueCell({ value }: { value: string }) {
  const t = useTranslations('compare.meta');
  if (value === '__noRecord__') {
    return <span className="text-[12px] text-[color:var(--color-fg-subtle)]">{t('noRecord')}</span>;
  }
  if (value === '__empty__') {
    return <span className="text-[color:var(--color-fg-subtle)]">{t('emptyValue')}</span>;
  }
  return <span className="break-words text-[color:var(--color-fg)]">{value}</span>;
}
