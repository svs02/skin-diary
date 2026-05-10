import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { CtaButtons } from './CtaButtons';

/**
 * Marketing hero. Headline + subhead + CTA, layered over a faded diary
 * photograph. The background image is decorative — `alt=""` and a white
 * gradient wash keep the text legible.
 */
export async function Hero() {
  const t = await getTranslations('marketing.hero');

  return (
    <section className="relative isolate overflow-hidden px-5 py-20 sm:px-6 lg:py-32">
      <Image
        src="/image/landingPageDiary.png"
        alt=""
        fill
        sizes="100vw"
        priority
        className="pointer-events-none absolute inset-0 -z-20 scale-105 object-cover opacity-55 blur-[3px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#FBFBFD]/65 via-[#FBFBFD]/35 to-[#FBFBFD]/80"
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <h1 className="text-[36px] font-semibold leading-[1.15] tracking-tight text-[#1D1D1F] sm:text-[44px] lg:text-[56px]">
          {t('headline')}
        </h1>
        <p className="max-w-xl text-[16px] leading-relaxed text-[#6E6E73] sm:text-[17px]">
          {t('subhead')}
        </p>
        <div>
          <CtaButtons size="lg" />
        </div>
      </div>
    </section>
  );
}
