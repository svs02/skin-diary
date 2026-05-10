'use client';

/**
 * 분할선 + 핸들 노브.
 *  - 시각: 컨테이너 위에 absolute. 좌측에 (100-r)%만큼 비우고 그 자리에 세로선/노브.
 *  - 인터랙션: 노브에서 시작한 드래그는 노브 자신이 setPointerCapture로 잡고
 *    부모 컨테이너 rect 기준으로 ratio를 계산해 콜백한다. (iOS Safari: 자식에서
 *    시작된 pointer를 부모에서 capture하면 pointermove가 누락되는 회귀를 회피)
 *  - 컨테이너 빈 영역 탭/드래그는 부모(CompareView) 핸들러가 그대로 처리.
 *  - 키보드 / ARIA는 여기서 부담.
 */

import { useRef } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  ratio: number; // 5..95
  onRatioChange: (next: number) => void;
  onResetMaybe: () => void; // double click → 50% reset
  hidden?: boolean;
  /** 부모 컨테이너 ref (clientX → ratio 변환 기준). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 드래그 시작/종료 통지 (clip-path transition 비활성용). */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const MIN = 5;
const MAX = 95;

export function SplitHandle({
  ratio,
  onRatioChange,
  onResetMaybe,
  hidden,
  containerRef,
  onDragStart,
  onDragEnd,
}: Props) {
  const t = useTranslations('compare');
  const draggingRef = useRef(false);

  function clamp(n: number) {
    return Math.max(MIN, Math.min(MAX, n));
  }

  function ratioFromClientX(clientX: number): number {
    const el = containerRef.current;
    if (!el) return ratio;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return ratio;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return clamp(pct);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // 노브에서 시작한 드래그를 노브 자신이 캡처. 부모 onPointerDown 으로의 버블링을 차단해
    // 부모가 동일 pointerId를 다시 캡처하려는 경합을 방지한다.
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draggingRef.current = true;
    onDragStart?.();
    onRatioChange(ratioFromClientX(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    onRatioChange(ratioFromClientX(e.clientX));
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onDragEnd?.();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        onRatioChange(clamp(ratio - (e.shiftKey ? 10 : 1)));
        return;
      case 'ArrowRight':
        e.preventDefault();
        onRatioChange(clamp(ratio + (e.shiftKey ? 10 : 1)));
        return;
      case 'Home':
        e.preventDefault();
        onRatioChange(MIN);
        return;
      case 'End':
        e.preventDefault();
        onRatioChange(MAX);
        return;
      case ' ':
      case 'Enter':
        e.preventDefault();
        onRatioChange(50);
        return;
      default:
        return;
    }
  }

  if (hidden) return null;

  return (
    <div
      role="slider"
      aria-label={t('handle.aria')}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={Math.round(ratio)}
      aria-orientation="vertical"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDoubleClick={onResetMaybe}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className="pointer-events-auto absolute inset-y-0 z-20 flex items-center justify-center outline-none"
      style={{
        left: `calc(${ratio}% - 28px)`,
        width: 56, // 44dp 이상 hitbox
        cursor: 'ew-resize',
        touchAction: 'none',
      }}
    >
      {/* 분할선: 흰선 + 어두운 외곽선 (대비). hit-test는 부모 래퍼로 강제. */}
      <span
        aria-hidden
        className="absolute inset-y-0"
        style={{
          width: 2,
          background: 'rgba(255,255,255,0.85)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
          pointerEvents: 'none',
          touchAction: 'none',
        }}
      />
      {/* 노브 */}
      <span
        aria-hidden
        className="relative flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none"
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-sm)',
          pointerEvents: 'none',
          touchAction: 'none',
        }}
      >
        <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden style={{ pointerEvents: 'none' }}>
          <path
            d="M5 3v10M9 3v10"
            stroke="var(--color-fg-muted)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </div>
  );
}
