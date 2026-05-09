'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { todayKey } from '@/lib/utils/dateKey';

const TABS = [
  { href: '/overview', key: 'overview' },
  { href: '/calendar', key: 'calendar' },
  { href: '/compare', key: 'compare' },
  { href: '/settings', key: 'settings' },
] as const;

function TabIcon({ tab, active }: { tab: (typeof TABS)[number]['key']; active: boolean }) {
  const stroke = active ? 'var(--color-accent)' : 'var(--color-fg-muted)';
  switch (tab) {
    case 'overview':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case 'calendar':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      );
    case 'compare':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="8" height="14" rx="1.5" />
          <rect x="13" y="5" width="8" height="14" rx="1.5" />
          <path d="M12 3v18" />
        </svg>
      );
    case 'settings':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
  }
}

export function BottomTabBar() {
  const pathname = usePathname();
  const t = useTranslations('tabs');

  // tick은 자정 경계에서 todayKey()가 바뀌었을 때 active 분기를 재계산하기 위한 re-render 트리거다.
  // 1분 폴링 + 탭 가시성 복귀 시 즉시 갱신.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 60_000);
    const onVisible = () => {
      if (!document.hidden) setTick((tick) => tick + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const recordToday = `/record/${todayKey()}`;
  const isOverviewActive = pathname === '/overview' || pathname === recordToday;
  const isCalendarActive =
    pathname === '/calendar' || (pathname.startsWith('/record/') && pathname !== recordToday);
  const isCompareActive = pathname === '/compare' || pathname.startsWith('/compare?');
  const isSettingsActive = pathname === '/settings';

  function isActive(key: (typeof TABS)[number]['key']): boolean {
    switch (key) {
      case 'overview':
        return isOverviewActive;
      case 'calendar':
        return isCalendarActive;
      case 'compare':
        return isCompareActive;
      case 'settings':
        return isSettingsActive;
    }
  }

  return (
    <nav
      className="sticky bottom-0 z-40 mt-auto border-t border-[color:var(--color-border)] bg-[color:var(--color-nav-bg)] backdrop-blur"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
        {TABS.map((tab) => {
          const active = isActive(tab.key);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-accent' : 'text-fg-muted'
                }`}
              >
                <TabIcon tab={tab.key} active={active} />
                <span>{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
