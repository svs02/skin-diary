import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleToggle } from '@/components/LocaleToggle';
import { CtaButtons } from './CtaButtons';

/**
 * Final CTA block + footer. Single-maker tone: one-line makerNote, no team
 * signature. Hex inlined.
 */
export async function CtaFooter() {
  const tCta = await getTranslations('marketing.cta');
  const tFooter = await getTranslations('marketing.footer');

  return (
    <footer className="border-t border-black/[0.06] bg-[#FBFBFD]">
      <section className="px-5 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
          <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-[#1D1D1F] sm:text-[34px]">
            {tCta('title')}
          </h2>
          <CtaButtons size="lg" />
        </div>
      </section>

      <div className="border-t border-black/[0.06] px-5 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-[12px] text-[#6E6E73] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-[#1D1D1F]">{tFooter('makerNote')}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{tFooter('copyright')}</span>
            <Link href="/privacy" className="hover:text-[#1D1D1F]">
              {tFooter('privacy')}
            </Link>
            <Link href="/terms" className="hover:text-[#1D1D1F]">
              {tFooter('terms')}
            </Link>
            <LocaleToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
