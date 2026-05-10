'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Eyebrow 한 줄 — 인사 · 날짜 · 요일을 3px subtle round dot으로 분리.
 *
 * 시간대 분기:
 *  - 04:00 ~ 09:59 → morning
 *  - 10:00 ~ 16:59 → day
 *  - 17:00 ~ 21:59 → evening
 *  - 22:00 ~ 03:59 → night
 *
 * 날짜·요일은 사용자 디바이스 로컬 시간 기준 (캘린더 todayKey와 분리). 인사말은 체감 시간이 자연.
 */
function getGreetingKey(hour: number): 'morning' | 'day' | 'evening' | 'night' {
  if (hour >= 4 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function formatDate(now: Date, locale: string): string {
  if (locale === 'ko') {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now);
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
}

function formatWeekday(now: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    weekday: 'long',
  }).format(now);
}

export function GreetingHeader() {
  const t = useTranslations('overview.greeting');
  const locale = useLocale();
  const isClient = useIsClient();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isClient) return;
    const id = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(id);
  }, [isClient]);

  const now = isClient ? new Date() : null;
  void tick;

  const greetingKey = now ? getGreetingKey(now.getHours()) : 'day';
  const dateStr = now ? formatDate(now, locale) : '';
  const weekdayStr = now ? formatWeekday(now, locale) : '';

  return (
    <header
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-tight text-[color:var(--color-fg-muted)]"
      style={{ letterSpacing: '-0.01em' }}
    >
      <span>{t(greetingKey)}</span>
      <span
        aria-hidden
        className="inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--color-fg-subtle)]"
      />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dateStr || ' '}</span>
      <span
        aria-hidden
        className="inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--color-fg-subtle)]"
      />
      <span>{weekdayStr || ' '}</span>
    </header>
  );
}
