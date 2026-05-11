'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AdjustHeader } from './AdjustHeader';
import { SideSegment } from './SideSegment';
import { ZoomSlider } from './ZoomSlider';
import { MoveDPad } from './MoveDPad';
import { ResetThisSide } from './ResetThisSide';
import { IDENTITY, clampScale, type Side, type Transform } from './transform';

interface Props {
  open: boolean;
  side: Side;
  onSideChange: (s: Side) => void;
  transformA: Transform;
  transformB: Transform;
  onTransformChange: (side: Side, t: Transform) => void;
  hasA: boolean;
  hasB: boolean;
  onApply: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

export function AdjustModeShell({
  open,
  side,
  onSideChange,
  transformA,
  transformB,
  onTransformChange,
  hasA,
  hasB,
  onApply,
  onCancel,
  children,
}: Props) {
  const t = useTranslations('compare.adjust');
  const activeT = side === 'A' ? transformA : transformB;
  const activeHas = side === 'A' ? hasA : hasB;
  const liveRef = useRef<HTMLDivElement>(null);
  const liveTimerRef = useRef<number | null>(null);

  const title = useMemo(
    () => t('titleSide', { side: side === 'A' ? t('sideA') : t('sideB') }),
    [side, t],
  );

  const setScale = useCallback(
    (next: number) => {
      const s = clampScale(next);
      onTransformChange(side, { ...activeT, scale: s });
    },
    [activeT, onTransformChange, side],
  );

  const move = useCallback(
    (dx: number, dy: number) => {
      onTransformChange(side, {
        scale: activeT.scale,
        ox: activeT.ox + dx,
        oy: activeT.oy + dy,
      });
    },
    [activeT, onTransformChange, side],
  );

  const resetSide = useCallback(() => {
    onTransformChange(side, IDENTITY);
  }, [onTransformChange, side]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') onCancel();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onApply();
        return;
      }
      if (e.key === '1' && hasA) {
        e.preventDefault();
        onSideChange('A');
        return;
      }
      if (e.key === '2' && hasB) {
        e.preventDefault();
        onSideChange('B');
        return;
      }
      if (!activeHas) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(0, -step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(0, step);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move(-step, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        move(step, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hasA, hasB, activeHas, move, onApply, onCancel, onSideChange]);

  useEffect(() => {
    if (!open) return;
    if (!liveRef.current) return;
    if (liveTimerRef.current != null) return;
    const fire = () => {
      if (!liveRef.current) return;
      liveRef.current.textContent = t('liveLabel', {
        percent: Math.round(activeT.scale * 100),
        ox: Math.round(activeT.ox),
        oy: Math.round(activeT.oy),
      });
      liveTimerRef.current = null;
    };
    liveTimerRef.current = window.setTimeout(fire, 1000);
    return () => {
      if (liveTimerRef.current != null) {
        window.clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [open, activeT, t]);

  if (!open) return <>{children}</>;

  return (
    <div className="flex flex-col gap-2" data-adjust-mode="true">
      <AdjustHeader title={title} onCancel={onCancel} onApply={onApply} />
      <SideSegment
        value={side}
        onChange={onSideChange}
        disabled={{ A: !hasA, B: !hasB }}
      />
      {children}
      {activeHas ? (
        <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[color:var(--color-surface-2)] p-4 shadow-[var(--shadow-sm)]">
          <ZoomSlider scale={activeT.scale} onChange={setScale} />
          <MoveDPad onMove={move} />
          <ResetThisSide onReset={resetSide} />
          <div ref={liveRef} role="status" aria-live="polite" className="sr-only" />
        </div>
      ) : (
        <div
          className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-4 py-3 text-center text-[13px] text-[color:var(--color-fg-muted)]"
          role="note"
        >
          {t('missingPhoto', { angle: side })}
        </div>
      )}
    </div>
  );
}
