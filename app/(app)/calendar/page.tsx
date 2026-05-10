'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listRecordKeysInRange } from '@/lib/firebase/dailyRecord';
import { isFuture, todayKey } from '@/lib/utils/dateKey';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type Cell = {
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  disabled: boolean; // 미래 날짜 (CLAUDE.md §5.5)
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toKey(year: number, month1: number, day: number) {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

/**
 * UTC 기준 6주 × 7일 캘린더 그리드. 일요일 시작.
 * dateKey는 문자열(YYYY-MM-DD) 비교가 사전순=시간순이라 UTC로 만들어도 안전.
 */
function buildMonthGrid(year: number, month1: number, today: string): Cell[] {
  const firstUtc = new Date(Date.UTC(year, month1 - 1, 1));
  const startWeekday = firstUtc.getUTCDay(); // 0=Sun
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
      disabled: isFuture(dateKey),
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

export default function CalendarPage() {
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations('calendar');
  const tWeek = useTranslations('calendar.weekdays');

  const today = useMemo(() => todayKey(), []);
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month1, setMonth1] = useState(() => Number(today.slice(5, 7)));
  const [recordKeys, setRecordKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const start = `${year}-${pad(month1)}-01`;
    const nextMonth = month1 === 12 ? 1 : month1 + 1;
    const nextYear = month1 === 12 ? year + 1 : year;
    const endExclusive = `${nextYear}-${pad(nextMonth)}-01`;
    listRecordKeysInRange(user.uid, start, endExclusive).then((items) => {
      if (!cancelled) setRecordKeys(new Set(items.map((i) => i.date)));
    });
    return () => {
      cancelled = true;
    };
  }, [user, year, month1]);

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
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">{t('title')}</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label={t('prevMonth')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2"
          >
            <ChevronIcon dir="left" />
          </button>
          <span className="min-w-[8.5rem] text-center text-[15px] font-medium">
            {monthLabel(year, month1, locale)}
          </span>
          <button
            type="button"
            onClick={goNext}
            aria-label={t('nextMonth')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        {WEEKDAY_KEYS.map((k) => (
          <div key={k}>{tWeek(k)}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <DayCell
            key={c.dateKey}
            cell={c}
            hasRecord={recordKeys.has(c.dateKey)}
            futureLabel={t('futureDisabled')}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  cell,
  hasRecord,
  futureLabel,
}: {
  cell: Cell;
  hasRecord: boolean;
  futureLabel: string;
}) {
  const dim = !cell.inMonth;
  const base =
    'relative flex aspect-square flex-col items-center justify-center rounded-[10px] text-[13px] font-medium';

  if (cell.disabled) {
    return (
      <div
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-fg-subtle ${dim ? 'opacity-40' : ''}`}
        title={futureLabel}
      >
        <span>{cell.day}</span>
        <span className="sr-only">{futureLabel}</span>
      </div>
    );
  }

  return (
    <Link
      href={`/record/${cell.dateKey}`}
      aria-current={cell.isToday ? 'date' : undefined}
      className={`${base} ${
        cell.isToday
          ? 'bg-accent text-[color:var(--color-accent-text)]'
          : 'text-fg hover:bg-surface-2'
      } ${dim ? 'opacity-40' : ''}`}
    >
      <span>{cell.day}</span>
      {hasRecord && !cell.isToday && (
        <span
          className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent"
          aria-hidden
        />
      )}
      {hasRecord && cell.isToday && (
        <span
          className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[color:var(--color-accent-text)]"
          aria-hidden
        />
      )}
    </Link>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
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
