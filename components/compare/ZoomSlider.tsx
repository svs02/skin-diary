'use client';

import { useTranslations } from 'next-intl';
import { SCALE_MIN, SCALE_MAX, clampScale } from './transform';

const MAGNET_LOW = 0.95;
const MAGNET_HIGH = 1.05;

interface Props {
  scale: number;
  onChange: (s: number) => void;
  disabled?: boolean;
}

function applyMagnet(s: number): number {
  if (s >= MAGNET_LOW && s <= MAGNET_HIGH) return 1;
  return s;
}

export function ZoomSlider({ scale, onChange, disabled = false }: Props) {
  const t = useTranslations('compare.adjust');
  const percent = Math.round(scale * 100);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const next = applyMagnet(clampScale(raw));
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 0.5 : 0.1;
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    const next = applyMagnet(clampScale(scale + dir * step));
    onChange(next);
  };

  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-[12px] font-medium text-[color:var(--color-fg-muted)]">
        {t('zoom')}
      </span>
      <input
        type="range"
        min={SCALE_MIN}
        max={SCALE_MAX}
        step={0.01}
        value={scale}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-valuemin={SCALE_MIN}
        aria-valuemax={SCALE_MAX}
        aria-valuenow={scale}
        aria-valuetext={`${t('zoom')} ${percent}%`}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[color:var(--color-surface-2)] accent-[color:var(--color-accent)] disabled:opacity-50"
      />
      <span className="w-12 text-right text-[12px] font-medium tabular-nums text-[color:var(--color-fg)]">
        {percent}%
      </span>
    </div>
  );
}
