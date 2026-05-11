'use client';

import { useTranslations } from 'next-intl';

interface Props {
  onReset: () => void;
  disabled?: boolean;
}

export function ResetThisSide({ onReset, disabled = false }: Props) {
  const t = useTranslations('compare.adjust');
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={disabled}
      aria-label={t('resetThisSide')}
      className="mx-auto flex items-center justify-center gap-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2 text-[13px] font-medium text-[color:var(--color-fg-muted)] transition-colors hover:bg-[color:var(--color-surface)] disabled:opacity-50"
    >
      <span aria-hidden>↺</span>
      <span>{t('resetThisSide')}</span>
    </button>
  );
}
