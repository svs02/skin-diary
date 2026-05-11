'use client';

import { useTranslations } from 'next-intl';

interface Props {
  title: string;
  onCancel: () => void;
  onApply: () => void;
}

export function AdjustHeader({ title, onCancel, onApply }: Props) {
  const t = useTranslations('compare.adjust');
  return (
    <div className="flex h-14 items-center justify-between gap-2 px-2">
      <button
        type="button"
        onClick={onCancel}
        aria-label={t('cancel')}
        className="flex h-10 min-w-[44px] items-center justify-center rounded-[var(--radius-md)] px-2 text-[14px] text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-2)]"
      >
        <span aria-hidden className="text-[20px] leading-none">←</span>
      </button>
      <span className="truncate text-[14px] font-medium text-[color:var(--color-fg)]" aria-live="polite">
        {title}
      </span>
      <button
        type="button"
        onClick={onApply}
        aria-label={t('apply')}
        className="h-10 rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-4 text-[13px] font-medium text-white hover:opacity-90"
      >
        {t('apply')}
      </button>
    </div>
  );
}
