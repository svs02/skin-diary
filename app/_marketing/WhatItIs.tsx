import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

const ANGLES = ['front', 'left', 'right'] as const;

/**
 * "What it is" — single section. Title + 3 plain text lines + 3 angle tiles.
 * Per spec §4-3: NOT a 2-card comparison.
 */
export async function WhatItIs() {
  const t = await getTranslations('marketing.what');
  const items = t.raw('items') as string[];

  return (
    <section className="bg-[#F5F5F7] px-5 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-[#1D1D1F] sm:text-[34px]">
          {t('title')}
        </h2>
        <ul className="mt-10 flex flex-col gap-4">
          {items.map((line, i) => (
            <li
              key={i}
              className="text-[17px] leading-relaxed text-[#1D1D1F] sm:text-[18px]"
            >
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-12 grid w-full grid-cols-3 gap-3 sm:gap-4">
          {ANGLES.map((angle) => (
            <div
              key={angle}
              className="relative aspect-square overflow-hidden rounded-2xl border border-black/[0.06] shadow-sm"
            >
              <Image
                src={`/image/${angle}.png`}
                alt=""
                fill
                sizes="(min-width: 1024px) 240px, (min-width: 640px) 30vw, 33vw"
                className="object-cover object-[center_10%]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
