'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';
import { PhotoPlaceholder } from './CompareView';

interface Props {
  fromUrl: string | null | undefined;
  toUrl: string | null | undefined;
  fromDate: string;
  toDate: string;
  angle: Angle;
}

export function SideBySideView({ fromUrl, toUrl, fromDate, toDate, angle }: Props) {
  const t = useTranslations('compare');
  const tAngle = useTranslations('compare.angles');
  const sameDate = fromDate === toDate;

  const fromAlt = t('image.alt', { date: fromDate, angle: tAngle(angle) });
  const toAlt = t('image.alt', { date: toDate, angle: tAngle(angle) });
  const sideA = t('labels.sideA');
  const sideB = t('labels.sideB');

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Cell url={fromUrl} alt={fromAlt} sideLabel={sideA} side="A" date={fromDate} />
        <Cell url={toUrl} alt={toAlt} sideLabel={sideB} side="B" date={toDate} />
      </div>

      {sameDate && (
        <p className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-4 py-3 text-center text-[13px] text-[color:var(--color-fg-muted)]">
          {t('empty.sameDate')}
        </p>
      )}
    </div>
  );
}

function Cell({
  url,
  alt,
  sideLabel,
  side,
  date,
}: {
  url: string | null | undefined;
  alt: string;
  sideLabel: string;
  side: 'A' | 'B';
  date: string;
}) {
  return (
    <figure
      role="img"
      aria-label={`${sideLabel} · ${alt}`}
      className="relative m-0 aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-[color:var(--color-surface)] shadow-[var(--shadow-sm)]"
    >
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          className="object-cover"
          unoptimized
          sizes="(min-width: 640px) 50vw, 100vw"
          draggable={false}
        />
      ) : (
        <PhotoPlaceholder side={side} />
      )}

      <span
        className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-white"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <span className="font-semibold">{sideLabel}</span>
        <span className="opacity-80">·</span>
        <span>{date.slice(5)}</span>
      </span>
    </figure>
  );
}
