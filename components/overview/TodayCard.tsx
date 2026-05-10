'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { todayKey } from '@/lib/utils/dateKey';

/**
 * 100% × 52px pill CTA — accent fill + white 텍스트 (CONTRAST: --color-accent-text 사용 금지).
 * Variant:
 *  - primary: accent bg
 *  - secondary: surface bg + hairline ring (오늘 record 완료 케이스)
 *
 * Subtitle 노출 책임은 부모 HeroBlock — 이 컴포넌트는 pill만.
 */
type TodayCtaProps = { variant?: 'primary' | 'secondary' };

export function TodayCard({ variant = 'primary' }: TodayCtaProps) {
  const t = useTranslations('overview.today');
  const isPrimary = variant === 'primary';
  const label = isPrimary ? t('ctaPrimary') : t('ctaSecondary');

  return (
    <Link
      href={`/record/${todayKey()}`}
      className={`flex h-[52px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold transition-[opacity,transform] duration-150 ease-[var(--ease-standard)] hover:opacity-[0.92] active:scale-[0.98] ${
        isPrimary
          ? 'bg-[color:var(--color-accent)] text-white'
          : 'bg-[color:var(--color-surface)] text-[color:var(--color-fg)]'
      }`}
      style={{
        letterSpacing: '-0.01em',
        ...(isPrimary
          ? {}
          : { boxShadow: 'inset 0 0 0 1px var(--color-border-strong)' }),
      }}
    >
      <span>{label}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}
