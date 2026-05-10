import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/**
 * Two-column section: "Why (different from album)" + "Privacy (only you)".
 * Mobile stacked, desktop lg:grid-cols-2 (50/50). Privacy card uses the
 * accent-dim hex (#E8F0FB) for emphasis.
 */
export async function WhyAndPrivacy() {
  const tWhy = await getTranslations('marketing.why');
  const tPrivacy = await getTranslations('marketing.privacy');
  const whyItems = tWhy.raw('items') as string[];
  const privacyItems = tPrivacy.raw('items') as string[];

  return (
    <section className="bg-[#F5F5F7] px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="flex flex-col gap-5 rounded-2xl border border-black/[0.08] bg-white p-7 sm:p-8">
          <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-[#1D1D1F] sm:text-[28px]">
            {tWhy('title')}
          </h2>
          <ul className="flex flex-col gap-3">
            {whyItems.map((line, i) => (
              <li
                key={i}
                className="text-[15px] leading-relaxed text-[#1D1D1F]"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border border-black/[0.08] bg-[#E8F0FB] p-7 sm:p-8">
          <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-[#1D1D1F] sm:text-[28px]">
            {tPrivacy('title')}
          </h2>
          <ul className="flex flex-col gap-3">
            {privacyItems.map((line, i) => (
              <li
                key={i}
                className="text-[15px] leading-relaxed text-[#1D1D1F]"
              >
                {line}
              </li>
            ))}
          </ul>
          <Link
            href="/privacy"
            className="mt-1 inline-flex w-fit text-[13px] font-medium text-[#1F4E94] underline-offset-4 hover:underline"
          >
            {tPrivacy('moreLink')}
          </Link>
        </div>
      </div>
    </section>
  );
}
