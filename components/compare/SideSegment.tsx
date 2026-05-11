'use client';

import { useTranslations } from 'next-intl';
import type { Side } from './transform';

interface Props {
  value: Side;
  onChange: (s: Side) => void;
  disabled?: { A?: boolean; B?: boolean };
}

export function SideSegment({ value, onChange, disabled = {} }: Props) {
  const t = useTranslations('compare.adjust');

  const seg = (s: Side, label: string, isDisabled: boolean) => {
    const active = value === s;
    return (
      <button
        key={s}
        type="button"
        role="tab"
        aria-selected={active}
        aria-disabled={isDisabled}
        disabled={isDisabled}
        onClick={() => !isDisabled && onChange(s)}
        className={[
          'h-9 flex-1 rounded-[var(--radius-full)] text-[13px] font-medium transition-colors',
          active
            ? 'bg-[color:var(--color-accent)] text-white shadow-[var(--shadow-sm)]'
            : 'text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)]',
          isDisabled ? 'opacity-50' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      role="tablist"
      aria-label={t('position')}
      className="mx-auto flex w-full max-w-[240px] gap-1 rounded-[var(--radius-full)] bg-[color:var(--color-surface-2)] p-1"
    >
      {seg('A', t('sideA'), !!disabled.A)}
      {seg('B', t('sideB'), !!disabled.B)}
    </div>
  );
}
