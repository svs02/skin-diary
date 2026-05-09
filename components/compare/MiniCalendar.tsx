'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useLocale, useTranslations } from 'next-intl';
import { listRecordKeysInRange, type RecordRangeItem } from '@/lib/firebase/dailyRecord';
import { isFuture, todayKey } from '@/lib/utils/dateKey';

/**
 * Sheet 안에서 쓰는 미니 캘린더.
 *  - 보이는 월 단위로 listRecordKeysInRange를 SWR로 호출.
 *  - 사진이 한 장이라도 있는 날만 활성. 미래 비활성. 다른 칩이 잡은 날짜는 외곽 ring.
 *  - 셀 탭 → onSelect (호출부에서 sheet auto-dismiss).
 *
 * 단순화 (기획서 §사용자 확정 결정사항 §데이터 흐름 대비):
 *  - useRecent60 재사용 대신 매번 보이는 월 범위 리스트를 SWR 키로 페치한다 (월 이동시 정확).
 *  - 60일 윈도우 안의 월에서는 SWR이 같은 데이터를 곧바로 캐시에서 돌려줘 추가 비용은 미미.
 */

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type Cell = {
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toKey(year: number, month1: number, day: number) {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

function buildMonthGrid(year: number, month1: number, today: string): Cell[] {
  const firstUtc = new Date(Date.UTC(year, month1 - 1, 1));
  const startWeekday = firstUtc.getUTCDay();
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month1 - 1, 1 - startWeekday + i));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const dateKey = toKey(y, m, day);
    cells.push({
      dateKey,
      day,
      inMonth: m === month1 && y === year,
      isToday: dateKey === today,
      isFuture: isFuture(dateKey),
    });
  }
  return cells;
}

function monthLabel(year: number, month1: number, locale: string) {
  const d = new Date(Date.UTC(year, month1 - 1, 1));
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
}

interface Props {
  uid: string | null;
  value: string; // 현재 칩이 잡은 dateKey
  otherValue: string; // 다른 칩이 잡은 dateKey (ring 표시용)
  onSelect: (dateKey: string) => void;
}

function rangeFetcher([, uid, start, end]: readonly [
  string,
  string,
  string,
  string,
]): Promise<RecordRangeItem[]> {
  return listRecordKeysInRange(uid, start, end);
}

export function MiniCalendar({ uid, value, otherValue, onSelect }: Props) {
  const locale = useLocale();
  const tCal = useTranslations('calendar');
  const tWeek = useTranslations('calendar.weekdays');
  const tCompare = useTranslations('compare');
  const today = useMemo(() => todayKey(), []);

  // 초기 월: 현재 value가 유효한 dateKey면 그 월, 아니면 오늘.
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  const [year, setYear] = useState(() => Number(initial.slice(0, 4)));
  const [month1, setMonth1] = useState(() => Number(initial.slice(5, 7)));

  // value prop 변경 시 월 동기화 (다른 칩 영향으로 sheet 재오픈 등).
  // React 권장: render 중 prev 비교 + setState (effect 대신).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setYear(Number(value.slice(0, 4)));
      setMonth1(Number(value.slice(5, 7)));
    }
  }

  const monthStart = `${year}-${pad(month1)}-01`;
  const nextMonth1 = month1 === 12 ? 1 : month1 + 1;
  const nextYear = month1 === 12 ? year + 1 : year;
  const monthEnd = `${nextYear}-${pad(nextMonth1)}-01`;

  const swrKey: readonly [string, string, string, string] | null = uid
    ? (['compare/calendarRange', uid, monthStart, monthEnd] as const)
    : null;
  const { data } = useSWR<RecordRangeItem[]>(
    swrKey,
    (key) => rangeFetcher(key as readonly [string, string, string, string]),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const photoSet = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((item) => {
      if (item.photos.front || item.photos.left || item.photos.right) {
        s.add(item.date);
      }
    });
    return s;
  }, [data]);

  const cells = useMemo(() => buildMonthGrid(year, month1, today), [year, month1, today]);

  function goPrev() {
    if (month1 === 1) {
      setYear(year - 1);
      setMonth1(12);
    } else {
      setMonth1(month1 - 1);
    }
  }
  function goNext() {
    if (month1 === 12) {
      setYear(year + 1);
      setMonth1(1);
    } else {
      setMonth1(month1 + 1);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={goPrev}
          aria-label={tCal('prevMonth')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-2)]"
        >
          <Chevron dir="left" />
        </button>
        <span className="text-[14px] font-medium text-[color:var(--color-fg)]">
          {monthLabel(year, month1, locale)}
        </span>
        <button
          type="button"
          onClick={goNext}
          aria-label={tCal('nextMonth')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-2)]"
        >
          <Chevron dir="right" />
        </button>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-fg-subtle)]">
        {WEEKDAY_KEYS.map((k) => (
          <div key={k}>{tWeek(k)}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const hasPhoto = photoSet.has(cell.dateKey);
          const enabled = hasPhoto && !cell.isFuture;
          const selected = cell.dateKey === value;
          const ringOther = cell.dateKey === otherValue && !selected;

          if (cell.isFuture) {
            return (
              <div
                key={cell.dateKey}
                aria-disabled="true"
                tabIndex={-1}
                className="relative flex aspect-square items-center justify-center rounded-[8px] text-[12px] text-[color:var(--color-fg-subtle)]/50"
                title={tCal('futureDisabled')}
              >
                <span className={cell.inMonth ? 'opacity-60' : 'opacity-30'}>{cell.day}</span>
                <span className="sr-only">{tCal('futureDisabled')}</span>
              </div>
            );
          }

          if (!enabled) {
            return (
              <div
                key={cell.dateKey}
                aria-disabled="true"
                tabIndex={-1}
                className="relative flex aspect-square items-center justify-center rounded-[8px] text-[12px] text-[color:var(--color-fg-subtle)]"
              >
                <span className={cell.inMonth ? '' : 'opacity-40'}>{cell.day}</span>
                <span className="sr-only">{tCompare('empty.noPhoto')}</span>
              </div>
            );
          }

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelect(cell.dateKey)}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-pressed={selected}
              className={`relative flex aspect-square items-center justify-center rounded-[8px] text-[12px] font-medium transition-colors ${
                selected
                  ? 'bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)]'
                  : 'text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-2)]'
              } ${cell.inMonth ? '' : 'opacity-40'}`}
              style={
                ringOther
                  ? { boxShadow: 'inset 0 0 0 1.5px var(--color-accent)' }
                  : undefined
              }
            >
              <span>{cell.day}</span>
              {hasPhoto && !selected && (
                <span
                  aria-hidden
                  className="absolute bottom-1 h-1 w-1 rounded-full"
                  style={{ background: 'var(--color-accent)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ transform: dir === 'right' ? 'rotate(180deg)' : undefined }}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
