'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';
import { SplitHandle } from './SplitHandle';

/**
 * 1:1 정사각 컨테이너 + 두 이미지 겹침 + clip-path 좌우 분할 + 슬라이더 핸들.
 *  - from: 좌측 노출 영역. clipPath: inset(0 ${100-r}% 0 0)
 *  - to:   우측 노출 영역. clipPath: inset(0 0 0 ${r}%)
 *  - pointer 이벤트는 컨테이너에서 setPointerCapture로 잡아 ratio 계산.
 *  - 50% 자석(±2%), 더블탭 50% 리셋, 5/95 클램프.
 *  - 첫 진입 데모 (sessionStorage 'compare:hintShown')는 reduced-motion 시 생략.
 *  - aria live region (1초 throttle)으로 비율 안내.
 */

interface Props {
  fromUrl: string | null | undefined;
  toUrl: string | null | undefined;
  fromDate: string;
  toDate: string;
  angle: Angle;
  splitHidden: boolean; // from===to 등 분할선 숨김 모드
}

const MIN = 5;
const MAX = 95;

function clamp(n: number) {
  return Math.max(MIN, Math.min(MAX, n));
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CompareView({ fromUrl, toUrl, fromDate, toDate, angle, splitHidden }: Props) {
  const t = useTranslations('compare');
  const tAngle = useTranslations('compare.angles');
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [ratio, setRatio] = useState(50);

  // ---- live region throttle ----
  const liveRef = useRef<HTMLDivElement>(null);
  const liveTimerRef = useRef<number | null>(null);
  const livePendingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!liveRef.current) return;
    livePendingRef.current = ratio;
    if (liveTimerRef.current != null) return;
    const fire = () => {
      if (liveRef.current && livePendingRef.current != null) {
        const r = Math.round(livePendingRef.current);
        liveRef.current.textContent = t('live.ratio', { a: r, b: 100 - r });
      }
      liveTimerRef.current = null;
    };
    liveTimerRef.current = window.setTimeout(fire, 1000);
    return () => {
      if (liveTimerRef.current != null) {
        window.clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [ratio, t]);

  // ---- 첫 진입 데모 ----
  useEffect(() => {
    if (splitHidden) return;
    if (prefersReducedMotion()) return;
    if (typeof window === 'undefined') return;
    try {
      if (window.sessionStorage.getItem('compare:hintShown')) return;
    } catch {
      return;
    }
    const timers: number[] = [];
    const seq: Array<[number, number]> = [
      [800, 58],
      [1400, 42],
      [2000, 50],
    ];
    seq.forEach(([delay, value]) => {
      timers.push(window.setTimeout(() => setRatio(value), delay));
    });
    timers.push(
      window.setTimeout(() => {
        try {
          window.sessionStorage.setItem('compare:hintShown', '1');
        } catch {
          /* ignore */
        }
      }, 2100),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [splitHidden]);

  // ---- pointer 이벤트 ----
  function ratioFromClientX(clientX: number): number {
    const el = containerRef.current;
    if (!el) return ratio;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return ratio;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return clamp(pct);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (splitHidden) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setIsDragging(true);
    setRatio(ratioFromClientX(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    setRatio(ratioFromClientX(e.clientX));
  }

  function onPointerUpOrCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // 50% 자석
    setRatio((cur) => (Math.abs(cur - 50) <= 2 ? 50 : cur));
  }

  const fromAlt = t('image.alt', { date: fromDate, angle: tAngle(angle) });
  const toAlt = t('image.alt', { date: toDate, angle: tAngle(angle) });

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUpOrCancel}
        onPointerCancel={onPointerUpOrCancel}
        className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-[color:var(--color-surface)] shadow-[var(--shadow-sm)]"
        style={{ touchAction: 'pan-y', userSelect: 'none' }}
      >
        {/* From 레이어 (좌측) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: splitHidden ? 'inset(0 50% 0 0)' : `inset(0 ${100 - ratio}% 0 0)`,
            transition: isDragging ? 'none' : 'clip-path 120ms ease-out',
          }}
        >
          {fromUrl ? (
            <Image
              src={fromUrl}
              alt={fromAlt}
              fill
              className="object-cover"
              unoptimized
              sizes="(max-width: 480px) 100vw, 480px"
              draggable={false}
            />
          ) : (
            <PhotoPlaceholder side="A" />
          )}
        </div>

        {/* To 레이어 (우측) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: splitHidden ? 'inset(0 0 0 50%)' : `inset(0 0 0 ${ratio}%)`,
            transition: isDragging ? 'none' : 'clip-path 120ms ease-out',
          }}
        >
          {toUrl ? (
            <Image
              src={toUrl}
              alt={toAlt}
              fill
              className="object-cover"
              unoptimized
              sizes="(max-width: 480px) 100vw, 480px"
              draggable={false}
            />
          ) : (
            <PhotoPlaceholder side="B" />
          )}
        </div>

        {/* 라벨 pill */}
        <SideLabel position="left" date={fromDate} side="A" />
        <SideLabel position="right" date={toDate} side="B" />

        {/* 분할선 */}
        <SplitHandle
          ratio={ratio}
          onRatioChange={(n) => setRatio(clamp(n))}
          onResetMaybe={() => setRatio(50)}
          hidden={splitHidden}
          containerRef={containerRef}
          onDragStart={() => {
            draggingRef.current = true;
            setIsDragging(true);
          }}
          onDragEnd={() => {
            draggingRef.current = false;
            setIsDragging(false);
            // 50% 자석
            setRatio((cur) => (Math.abs(cur - 50) <= 2 ? 50 : cur));
          }}
        />
      </div>

      {/* aria live region */}
      <div ref={liveRef} role="status" aria-live="polite" className="sr-only" />

      {splitHidden && (
        <p
          className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-4 py-3 text-center text-[13px] text-[color:var(--color-fg-muted)]"
        >
          {t('empty.sameDate')}
        </p>
      )}
    </div>
  );
}

function SideLabel({
  position,
  date,
  side,
}: {
  position: 'left' | 'right';
  date: string;
  side: 'A' | 'B';
}) {
  return (
    <span
      className="absolute top-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-white"
      style={{
        background: 'rgba(0,0,0,0.55)',
        [position]: '8px',
      } as React.CSSProperties}
    >
      <span className="font-semibold">{side}</span>
      <span className="opacity-80">·</span>
      <span>{date.slice(5)}</span>
    </span>
  );
}

export function PhotoPlaceholder({ side }: { side: 'A' | 'B' }) {
  const t = useTranslations('compare');
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[color:var(--color-surface-2)] text-[color:var(--color-fg-muted)]">
      <span className="text-[12px]">{t('missingPhoto', { side })}</span>
    </div>
  );
}
