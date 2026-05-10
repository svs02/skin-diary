import { getTranslations } from 'next-intl/server';
import { CompareView } from '@/components/compare/CompareView';

/**
 * 3-step section. Mobile stacked, desktop lg:grid-cols-3. Step 3 hosts the
 * real interactive Compare slider so visitors can feel the actual feature.
 */
export async function HowItWorks() {
  const t = await getTranslations('marketing.how');

  const steps = [
    { n: 1, label: t('step1.label'), body: t('step1.body') },
    { n: 2, label: t('step2.label'), body: t('step2.body') },
    { n: 3, label: t('step3.label'), body: t('step3.body') },
  ];

  return (
    <section className="px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-center text-[28px] font-semibold leading-tight tracking-tight text-[#1D1D1F] sm:text-[34px]">
          {t('title')}
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {steps.map((s) => (
            <div
              key={s.n}
              className="flex flex-col gap-4 rounded-2xl border border-black/[0.08] bg-white p-6"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F0FB] text-[13px] font-semibold text-[#1F4E94]">
                {s.n}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-[18px] font-semibold text-[#1D1D1F]">
                  {s.label}
                </h3>
                <p className="text-[14px] leading-relaxed text-[#6E6E73]">
                  {s.body}
                </p>
              </div>
              {s.n === 3 && (
                <div className="mx-auto w-full max-w-[320px]">
                  <CompareView
                    fromUrl="/image/before.png"
                    toUrl="/image/after.png"
                    fromDate="2026-04-01"
                    toDate="2026-04-30"
                    angle="front"
                    splitHidden={false}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
