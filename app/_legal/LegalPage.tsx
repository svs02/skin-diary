import { getTranslations } from 'next-intl/server';

type LegalNamespace =
  | 'legal.privacy'
  | 'legal.terms'
  | 'legal.sensitivePhoto';

type Section = { title: string; body: string };

export async function LegalPage({ ns }: { ns: LegalNamespace }) {
  const t = await getTranslations(ns);
  const summaryItems = t.raw('summary.items') as string[];
  const sections = t.raw('sections') as Section[];

  return (
    <main
      data-marketing
      className="min-h-dvh bg-[#FBFBFD] text-[#1D1D1F]"
    >
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-20">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight sm:text-[34px]">
          {t('title')}
        </h1>
        <p className="mt-2 text-[13px] text-[#6E6E73]">
          {t('lastUpdated')}
        </p>

        <section
          aria-label={t('summary.title')}
          className="mt-10 rounded-2xl border border-black/[0.08] bg-[#E8F0FB] p-7 sm:p-8"
        >
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#1F4E94]">
            {t('summary.title')}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {summaryItems.map((line, i) => (
              <li
                key={i}
                className="text-[15px] leading-relaxed text-[#1D1D1F]"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>

        <article className="mt-8 rounded-2xl border border-black/[0.08] bg-white p-7 sm:p-10">
          {sections.map((section, i) => (
            <section key={i} className="first:mt-0 mt-10">
              <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[#1D1D1F]">
                {section.title}
              </h2>
              {section.body.split('\n\n').map((para, j) => (
                <p
                  key={j}
                  className="mt-3 whitespace-pre-line text-[16px] leading-[1.7] text-[#1D1D1F] sm:text-[17px]"
                >
                  {para}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
