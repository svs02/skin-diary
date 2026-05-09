'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/**
 * 시간대 분기:
 *  - 04:00 ~ 09:59 → morning
 *  - 10:00 ~ 16:59 → day
 *  - 17:00 ~ 21:59 → evening
 *  - 22:00 ~ 03:59 → night
 *
 * 캡션: 사용자 디바이스 로컬 시간 기준 "YYYY년 N월 · 요일" (한국어 locale 시) /
 *      "Month YYYY · Weekday" (영어 locale 시).
 *  - todayKey()는 앱 TZ(America/Vancouver) 기준이지만, 인사말은 사용자 체감 시간이
 *    더 자연스러우므로 디바이스 로컬 시간을 사용한다 (CLAUDE.md §5.2 흐름과 무관).
 */
function getGreetingKey(hour: number): 'morning' | 'day' | 'evening' | 'night' {
  if (hour >= 4 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * SSR-safe "is hydrated" hook — useSyncExternalStore 패턴.
 * 서버에선 false, 클라이언트 mount 후 true로 전환되며 hydration mismatch 없음.
 * (React 19의 set-state-in-effect 규칙도 회피)
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function GreetingHeader() {
  const t = useTranslations('overview.greeting');
  const locale = useLocale();
  const isClient = useIsClient();
  const [tick, setTick] = useState(0);

  // 1분마다 tick — 시간대 경계 변경 대응. setState는 effect 본문이 아닌
  // setInterval 콜백 내에서만 호출되므로 set-state-in-effect 규칙 안전.
  useEffect(() => {
    if (!isClient) return;
    const id = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(id);
  }, [isClient]);

  const now = isClient ? new Date() : null;
  // tick 변경 시 컴포넌트가 재실행되며 new Date()도 재평가됨.
  // (eslint-no-unused-vars 회피용 노출)
  void tick;
  const greetingKey = now ? getGreetingKey(now.getHours()) : 'day';
  const caption = now
    ? new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
        year: 'numeric',
        month: 'long',
        weekday: 'long',
      })
        .format(now)
        // ICU 결과를 가독성 좋게 정리 (한국어: "2026년 5월 금요일" → "2026년 5월 · 금요일")
        .replace(/(\d{4}년 \d{1,2}월)\s+/, '$1 · ')
        .replace(/^(\w+ \d{4})\s+/, '$1 · ') // en: "May 2026 Friday" → "May 2026 · Friday"
    : ' '; // non-breaking space로 높이 유지

  return (
    <header className="flex flex-col gap-1 pt-1">
      <h1 className="text-[20px] font-semibold leading-tight text-[color:var(--color-fg)]">
        {t(greetingKey)}
      </h1>
      <p className="text-[12px] text-[color:var(--color-fg-muted)]">{caption}</p>
    </header>
  );
}
