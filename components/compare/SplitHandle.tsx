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

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

// prefers-reduced-motion 을 외부 store 로 노출 — useEffect 안에서 setState 호출을 피한다.
function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener?.('change', callback);
  return () => mq.removeEventListener?.('change', callback);
}
function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function getReducedMotionServerSnapshot(): boolean {
  return false;
}

interface Props {
  ratio: number; // 5..95
  onRatioChange: (next: number) => void;
  onResetMaybe: () => void; // double click → 50% reset
  hidden?: boolean;
  /** 강제 표시 (데모 hint 등 — 자동 페이드 보류). */
  forceVisible?: boolean;
  /** 부모 컨테이너 ref (clientX → ratio 변환 기준). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 드래그 시작/종료 통지 (clip-path transition 비활성용). */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const MIN = 5;
const MAX = 95;
// 첫 진입은 사용자가 슬라이더 존재를 인지할 시간 부여, 이후 정지 시 1.2s 후 페이드.
const INITIAL_VISIBLE_MS = 3000;
const IDLE_VISIBLE_MS = 1200;
// 시연/회의 환경에서도 위치 인지 유지 — 완전 0이 아닌 floor 유지.
const FADE_FLOOR_OPACITY = 0.15;

export function SplitHandle({
  ratio,
  onRatioChange,
  onResetMaybe,
  hidden,
  forceVisible,
  containerRef,
  onDragStart,
  onDragEnd,
}: Props) {
  const t = useTranslations('compare');
  const draggingRef = useRef(false);
  const [visible, setVisible] = useState(true);
  const [hasFocus, setHasFocus] = useState(false);
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFocusRef = useRef(false);

  // hasFocus 동기화 (render 중 ref 수정 금지).
  useEffect(() => {
    hasFocusRef.current = hasFocus;
  }, [hasFocus]);

  const bumpActivity = useCallback((initial = false) => {
    setVisible(true);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (hasFocusRef.current) return; // focus 동안은 항상 visible
    idleTimerRef.current = setTimeout(
      () => setVisible(false),
      initial ? INITIAL_VISIBLE_MS : IDLE_VISIBLE_MS,
    );
  }, []);

  // 초기 마운트 시 3초 grace 후 페이드. setState 직접 호출 회피를 위해 timer 만 설정.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!hasFocusRef.current) setVisible(false);
    }, INITIAL_VISIBLE_MS);
    return () => {
      clearTimeout(t);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

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
    bumpActivity();
    onDragStart?.();
    onRatioChange(ratioFromClientX(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    bumpActivity();
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
    bumpActivity();
    onDragEnd?.();
  }

  function onPointerEnter() {
    bumpActivity();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    bumpActivity();
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

  function onFocus() {
    setHasFocus(true);
    setVisible(true);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function onBlur() {
    setHasFocus(false);
    bumpActivity();
  }

  if (hidden) return null;

  const effectiveOpacity = forceVisible || visible ? 1 : FADE_FLOOR_OPACITY;

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
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
      onBlur={onBlur}
      className="pointer-events-auto absolute inset-y-0 z-20 flex items-center justify-center outline-none"
      style={{
        left: `calc(${ratio}% - 28px)`,
        width: 56, // 44dp 이상 hitbox
        cursor: 'ew-resize',
        touchAction: 'none',
        opacity: effectiveOpacity,
        transition: reduceMotion ? 'none' : 'opacity 240ms ease-out',
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
