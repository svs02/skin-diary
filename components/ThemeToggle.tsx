'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, type Theme } from '@/hooks/useTheme';

// Used as a mounted-on-client signal that doesn't trigger the
// react-hooks/set-state-in-effect lint and gives a stable SSR snapshot.
const subscribeNoop = () => () => {};
const useIsMounted = () =>
  useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

type IconProps = { className?: string };

function SunIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.93 19.07 1.41-1.41" />
      <path d="m17.66 6.34 1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function MonitorIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const t = useTranslations('settings.theme');
  const { theme, setTheme } = useTheme();

  // The inline boot script in app/layout.tsx already applied the correct
  // data-theme to <html>, but the React tree is rendered on the server with
  // theme='system' as a default. Defer rendering the active state until after
  // mount to avoid hydration mismatches on aria-pressed.
  const mounted = useIsMounted();

  const options: { code: Theme; label: string; Icon: (p: IconProps) => React.ReactElement }[] = [
    { code: 'light', label: t('light'), Icon: SunIcon },
    { code: 'dark', label: t('dark'), Icon: MoonIcon },
    { code: 'system', label: t('system'), Icon: MonitorIcon },
  ];

  return (
    <div
      className={`inline-flex items-center rounded-full bg-surface-2 p-0.5 text-[12px] font-medium ${className}`}
      role="group"
      aria-label={t('title')}
    >
      {options.map(({ code, label, Icon }) => {
        const active = mounted && theme === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setTheme(code)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${
              active
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
