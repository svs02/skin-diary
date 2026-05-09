'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { setLocale, type AppLocale } from '@/lib/i18n/setLocale';

const OPTIONS: { code: AppLocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ko', label: '한' },
];

export function LocaleToggle({ className = '' }: { className?: string }) {
  const current = useLocale() as AppLocale;
  const [isPending, startTransition] = useTransition();

  const handleSelect = (code: AppLocale) => {
    if (code === current || isPending) return;
    startTransition(() => {
      void setLocale(code);
    });
  };

  return (
    <div
      className={`inline-flex items-center rounded-full bg-surface-2 p-0.5 text-[12px] font-medium ${className}`}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map(({ code, label }) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => handleSelect(code)}
            disabled={isPending}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 transition-colors ${
              active
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
