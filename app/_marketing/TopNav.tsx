'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LocaleToggle } from '@/components/LocaleToggle';

/**
 * Sticky marketing top nav. Wordmark + locale toggle + sign-in text link.
 * Pure marketing styling — no theme tokens.
 */
export function TopNav() {
  const t = useTranslations('marketing.nav');

  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#FBFBFD]/80 backdrop-blur supports-[backdrop-filter]:bg-[#FBFBFD]/70">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 sm:px-6">
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-tight text-[#1D1D1F]"
        >
          {t('logo')}
        </Link>
        <div className="flex items-center gap-3">
          <LocaleToggle />
          <Link
            href="/login"
            className="text-[13px] font-medium text-[#1D1D1F] hover:text-[#2C6ECB]"
          >
            {t('signIn')}
          </Link>
        </div>
      </div>
    </header>
  );
}
