'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

type Dir = 'up' | 'down' | 'left' | 'right';

interface Props {
  onMove: (dx: number, dy: number) => void;
  clamped?: { up?: boolean; down?: boolean; left?: boolean; right?: boolean };
  disabled?: boolean;
}

const TICK_MS = 120;
const ACCEL_T1 = 250;
const ACCEL_T2 = 500;

function stepFor(elapsed: number): number {
  if (elapsed < ACCEL_T1) return 1;
  if (elapsed < ACCEL_T2) return 4;
  return 8;
}

function dirVector(dir: Dir, px: number): [number, number] {
  switch (dir) {
    case 'up':
      return [0, -px];
    case 'down':
      return [0, px];
    case 'left':
      return [-px, 0];
    case 'right':
      return [px, 0];
  }
}

export function MoveDPad({ onMove, clamped = {}, disabled = false }: Props) {
  const t = useTranslations('compare.adjust');
  const intervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = (dir: Dir) => {
    if (disabled) return;
    stop();
    startedAtRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const [dx, dy] = dirVector(dir, stepFor(elapsed));
      onMove(dx, dy);
    };
    tick();
    intervalRef.current = window.setInterval(tick, TICK_MS);
  };

  const button = (dir: Dir, label: string, gridArea: string, isClamped: boolean) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        start(dir);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      style={{ gridArea, opacity: isClamped ? 0.5 : 1 }}
      className="flex h-14 w-14 select-none items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] text-[18px] text-[color:var(--color-fg)] transition-colors hover:bg-[color:var(--color-surface-2)] active:bg-[color:var(--color-surface-2)] disabled:opacity-40"
    >
      {dir === 'up' && '↑'}
      {dir === 'down' && '↓'}
      {dir === 'left' && '←'}
      {dir === 'right' && '→'}
    </button>
  );

  return (
    <div
      className="mx-auto grid w-[168px] gap-1"
      style={{
        gridTemplateColumns: 'repeat(3, 56px)',
        gridTemplateRows: 'repeat(3, 56px)',
        gridTemplateAreas: '". up ." "left . right" ". down ."',
      }}
      role="group"
      aria-label={t('position')}
    >
      {button('up', t('up'), 'up', !!clamped.up)}
      {button('left', t('left'), 'left', !!clamped.left)}
      {button('right', t('right'), 'right', !!clamped.right)}
      {button('down', t('down'), 'down', !!clamped.down)}
    </div>
  );
}
