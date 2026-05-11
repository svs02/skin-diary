'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';
import { SplitHandle } from './SplitHandle';
import { AdjustModeShell } from './AdjustModeShell';
import { IDENTITY, clampOffset, clampScale, type Side, type Transform } from './transform';

/**
 * 1:1 정사각 컨테이너 + 두 이미지 겹침 + clip-path 좌우 분할 + 슬라이더 핸들.
 *  - from: 좌측 노출 영역. clipPath: inset(0 ${100-r}% 0 0)
 *  - to:   우측 노출 영역. clipPath: inset(0 0 0 ${r}%)
 *  - pointer 이벤트는 컨테이너에서 setPointerCapture로 잡아 ratio 계산.
 *  - 50% 자석(±2%), 더블탭 50% 리셋, 5/95 클램프.
 *  - 첫 진입 데모 (sessionStorage 'compare:hintShown')는 reduced-motion 시 생략.
 *  - aria live region (1초 throttle)으로 비율 안내.
 *
 * 추가 (양쪽 사진 독립 pan/zoom):
 *  - 각 clip-wrapper 안에 transform-wrapper 한 겹. Image는 그 안.
 *  - 자동 감지 매트릭스:
 *      1손가락 빠른 드래그       → split ratio
 *      2손가락 핀치              → 중심점이 속한 측의 zoom
 *      2손가락 드래그 (핀치 없음) → 동일 측의 pan
 *      1손가락 long-press (500ms) 후 드래그 → 시작 측의 pan
 *      wheel                     → hover 측의 zoom
 *      Shift+drag / 마우스 휠클릭 drag → hover 측의 pan
 *      더블탭                    → 해당 측 리셋
 *  - scale 0.5~3, offset 클램프 |o| ≤ (s-1)*halfSize. s<1이면 o=0.
 *  - URL/angle 바뀔 때마다 양쪽 transform 자동 리셋.
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

const SCALE_STEP_WHEEL = 0.0015; // wheel deltaY → scale 배수

const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_TOLERANCE_PX = 24;

const ONBOARD_KEY = 'sd:onboard:compare-pan';
const ONBOARD_LIMIT = 3;

interface PointerState {
  id: number;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  startedAt: number;
  side: Side;
}

type GestureMode =
  | 'idle'
  | 'pan-touch' // 1손가락 또는 2손가락 pan
  | 'pinch' // 2손가락 핀치 zoom
  | 'pan-mouse'; // 마우스 드래그 pan

function clampRatio(n: number) {
  return Math.max(MIN, Math.min(MAX, n));
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sideFromX(clientX: number, rect: DOMRect, ratio: number): Side {
  const splitPx = rect.left + (rect.width * ratio) / 100;
  return clientX < splitPx ? 'A' : 'B';
}

export function CompareView({ fromUrl, toUrl, fromDate, toDate, angle, splitHidden }: Props) {
  const t = useTranslations('compare');
  const tAngle = useTranslations('compare.angles');
  const containerRef = useRef<HTMLDivElement>(null);

  const [ratio, setRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);

  const [tFrom, setTFrom] = useState<Transform>(IDENTITY);
  const [tTo, setTTo] = useState<Transform>(IDENTITY);

  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const [activeRingStrong, setActiveRingStrong] = useState(false);
  const activeFadeTimerRef = useRef<number | null>(null);

  const [touchAction, setTouchAction] = useState<'pan-y' | 'none'>('pan-y');
  const [panModeActive, setPanModeActive] = useState(false); // pan/pinch 모드 → SplitHandle 숨김
  const [demoForceVisible, setDemoForceVisible] = useState(false);
  const [showOnboardHint, setShowOnboardHint] = useState(false);

  // ---- Adjust Mode ----
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustSide, setAdjustSide] = useState<Side>('A');
  const [entrySnapshot, setEntrySnapshot] = useState<{ A: Transform; B: Transform } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const adjustOpenRef = useRef(false);
  useEffect(() => {
    adjustOpenRef.current = adjustOpen;
  }, [adjustOpen]);

  // gesture state refs
  const modeRef = useRef<GestureMode>('idle');
  const pointersRef = useRef<Map<number, PointerState>>(new Map());
  const lastTapRef = useRef<{ at: number; x: number; y: number; side: Side } | null>(null);

  // pinch state
  const pinchStartDistRef = useRef(0);
  const pinchStartScaleRef = useRef(1);
  const pinchSideRef = useRef<Side>('A');
  const pinchStartCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartTransformRef = useRef<Transform>(IDENTITY);

  // pan state
  const panSideRef = useRef<Side>('A');
  const panStartTransformRef = useRef<Transform>(IDENTITY);
  const panAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // ---- 첫 진입 split 데모 ----
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
    // 데모 시퀀스 시작 표시 — mount 시 1회만 호출, cascade 없음.
    timers.push(window.setTimeout(() => setDemoForceVisible(true), 0));
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
        setDemoForceVisible(false);
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

  // ---- 양쪽 transform 자동 리셋: URL/angle 변경 시. setTimeout 0 으로 effect body 분리. ----
  useEffect(() => {
    const id = window.setTimeout(() => {
      setTFrom(IDENTITY);
      setTTo(IDENTITY);
      setActiveSide(null);
      // Adjust Mode 활성 중 angle/URL 변경 → 자동 취소 (entrySnapshot은 이미 무의미)
      if (adjustOpenRef.current) {
        setAdjustOpen(false);
        setEntrySnapshot(null);
        setToastMsg('toastCanceled');
        window.setTimeout(() => setToastMsg(null), 1800);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [fromUrl, toUrl, angle]);

  // ---- onboarding hint (첫 3회 진입) ----
  // strict-mode 더블 invoke 가드 — localStorage 카운터가 1회 진입에 +2 증가하지 않도록.
  const onboardCheckedRef = useRef(false);
  useEffect(() => {
    if (splitHidden) return;
    if (typeof window === 'undefined') return;
    if (onboardCheckedRef.current) return;
    onboardCheckedRef.current = true;
    let shouldShow = false;
    try {
      const raw = window.localStorage.getItem(ONBOARD_KEY);
      const cnt = raw ? parseInt(raw, 10) || 0 : 0;
      if (cnt < ONBOARD_LIMIT) {
        shouldShow = true;
        window.localStorage.setItem(ONBOARD_KEY, String(cnt + 1));
      }
    } catch {
      /* ignore */
    }
    if (!shouldShow) return;
    const id = window.setTimeout(() => setShowOnboardHint(true), 0);
    return () => window.clearTimeout(id);
  }, [splitHidden]);

  // ---- helpers ----
  const halfSize = useCallback((): number => {
    const el = containerRef.current;
    if (!el) return 0;
    return el.getBoundingClientRect().width / 2;
  }, []);

  const setTransform = useCallback(
    (side: Side, next: Transform) => {
      const half = halfSize();
      const clamped = clampOffset({ ...next, scale: clampScale(next.scale) }, half);
      if (side === 'A') setTFrom(clamped);
      else setTTo(clamped);
    },
    [halfSize],
  );

  const markActive = useCallback((side: Side) => {
    setActiveSide(side);
    setActiveRingStrong(true);
    if (activeFadeTimerRef.current != null) {
      window.clearTimeout(activeFadeTimerRef.current);
    }
    activeFadeTimerRef.current = window.setTimeout(() => {
      setActiveRingStrong(false);
      activeFadeTimerRef.current = null;
    }, 600);
  }, []);

  const currentSideFromX = useCallback(
    (clientX: number): Side => {
      const el = containerRef.current;
      if (!el) return 'A';
      const rect = el.getBoundingClientRect();
      return sideFromX(clientX, rect, ratio);
    },
    [ratio],
  );

  const resetTransform = useCallback((side: Side | 'both') => {
    if (side === 'A' || side === 'both') setTFrom(IDENTITY);
    if (side === 'B' || side === 'both') setTTo(IDENTITY);
  }, []);

  // ---- Adjust Mode handlers ----
  const openAdjust = useCallback(() => {
    setEntrySnapshot({ A: tFrom, B: tTo });
    const defaultSide: Side =
      adjustSide === 'A' && fromUrl
        ? 'A'
        : adjustSide === 'B' && toUrl
          ? 'B'
          : fromUrl
            ? 'A'
            : 'B';
    setAdjustSide(defaultSide);
    setAdjustOpen(true);
  }, [tFrom, tTo, adjustSide, fromUrl, toUrl]);

  const applyAdjust = useCallback(() => {
    setAdjustOpen(false);
    setEntrySnapshot(null);
  }, []);

  const cancelAdjust = useCallback(
    (withToast: boolean) => {
      if (entrySnapshot) {
        setTFrom(entrySnapshot.A);
        setTTo(entrySnapshot.B);
      }
      setAdjustOpen(false);
      setEntrySnapshot(null);
      if (withToast) {
        setToastMsg('toastCanceled');
        window.setTimeout(() => setToastMsg(null), 1800);
      }
    },
    [entrySnapshot],
  );

  // ---- wheel (desktop): hover 측 zoom ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (adjustOpenRef.current) return;
      if (splitHidden) return;
      e.preventDefault();
      const side = currentSideFromX(e.clientX);
      const cur = side === 'A' ? tFrom : tTo;
      const factor = Math.exp(-e.deltaY * SCALE_STEP_WHEEL);
      const nextScale = clampScale(cur.scale * factor);
      // zoom around hover point (relative to center)
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const px = e.clientX - cx;
      const py = e.clientY - cy;
      // 픽셀 좌표가 같은 이미지 지점에 머물도록 offset 보정
      const k = nextScale / cur.scale;
      const next: Transform = {
        scale: nextScale,
        ox: px - (px - cur.ox) * k,
        oy: py - (py - cur.oy) * k,
      };
      setTransform(side, next);
      markActive(side);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [tFrom, tTo, splitHidden, currentSideFromX, setTransform, markActive]);

  // ---- keyboard: '0' → 양쪽 리셋 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (adjustOpenRef.current) return;
      if (e.key !== '0') return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      resetTransform('both');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetTransform]);

  // ---- pointer handlers ----
  const startPanFromPointer = (side: Side, p: PointerState) => {
    panSideRef.current = side;
    panStartTransformRef.current = side === 'A' ? tFrom : tTo;
    panAnchorRef.current = { x: p.curX, y: p.curY };
    modeRef.current = 'pan-touch';
    setPanModeActive(true);
    setTouchAction('none');
    markActive(side);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (adjustOpen) return;
    // SplitHandle 노브의 hit은 그쪽이 stopPropagation 하므로 여기까지 안 옴.
    if (splitHidden && pointersRef.current.size === 0) {
      // splitHidden일 때는 split 드래그는 의미 없지만 pan/pinch는 여전히 허용
    }
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const now = performance.now();
    const side = currentSideFromX(e.clientX);
    const ps: PointerState = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      startedAt: now,
      side,
    };
    pointersRef.current.set(e.pointerId, ps);

    // 두번째 포인터 진입 → pinch 시작 (drag-vs-pinch는 move 단계에서 결정)
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const a = pts[0];
      const b = pts[1];
      const dx = a.curX - b.curX;
      const dy = a.curY - b.curY;
      const dist = Math.hypot(dx, dy);
      const cx = (a.curX + b.curX) / 2;
      const cy = (a.curY + b.curY) / 2;
      const pinchSide = currentSideFromX(cx);
      pinchSideRef.current = pinchSide;
      pinchStartDistRef.current = dist;
      pinchStartCenterRef.current = { x: cx, y: cy };
      pinchStartTransformRef.current = pinchSide === 'A' ? tFrom : tTo;
      pinchStartScaleRef.current = pinchStartTransformRef.current.scale;
      // 두 손가락 시작 시점에는 pan으로 가정하고 시작 (pinch 거리 변화 발견되면 전환)
      panSideRef.current = pinchSide;
      panStartTransformRef.current = pinchStartTransformRef.current;
      panAnchorRef.current = { x: cx, y: cy };
      modeRef.current = 'pan-touch';
      setPanModeActive(true);
      setTouchAction('none');
      markActive(pinchSide);
      return;
    }

    // 첫 번째 포인터 — 마우스: 좌클릭 드래그도 즉시 pan (split은 SplitHandle 노브 전용)
    if (e.pointerType === 'mouse') {
      panSideRef.current = side;
      panStartTransformRef.current = side === 'A' ? tFrom : tTo;
      panAnchorRef.current = { x: e.clientX, y: e.clientY };
      modeRef.current = 'pan-mouse';
      setPanModeActive(true);
      setTouchAction('none');
      markActive(side);
      e.preventDefault();
      return;
    }

    // touch / pen 첫 손가락
    // 더블탭 감지
    if (lastTapRef.current) {
      const lt = lastTapRef.current;
      const dt = now - lt.at;
      const dx = e.clientX - lt.x;
      const dy = e.clientY - lt.y;
      if (
        dt <= DOUBLE_TAP_MS &&
        Math.hypot(dx, dy) <= DOUBLE_TAP_TOLERANCE_PX &&
        side === lt.side
      ) {
        resetTransform(side);
        markActive(side);
        lastTapRef.current = null;
        modeRef.current = 'idle';
        return;
      }
    }
    lastTapRef.current = { at: now, x: e.clientX, y: e.clientY, side };

    // 한 손가락 드래그는 항상 즉시 pan (split 조작은 SplitHandle 노브 전용).
    // 줌 배율과 무관하게 작동하므로 long-press 게이트 불필요.
    startPanFromPointer(side, ps);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (adjustOpen) return;
    const ps = pointersRef.current.get(e.pointerId);
    if (!ps) return;
    ps.curX = e.clientX;
    ps.curY = e.clientY;

    const count = pointersRef.current.size;

    // 2개 포인터 → pinch / 2-finger pan
    if (count === 2) {
      const pts = Array.from(pointersRef.current.values());
      const a = pts[0];
      const b = pts[1];
      const dx = a.curX - b.curX;
      const dy = a.curY - b.curY;
      const dist = Math.hypot(dx, dy);
      const cx = (a.curX + b.curX) / 2;
      const cy = (a.curY + b.curY) / 2;
      const startDist = pinchStartDistRef.current;
      const distDelta = Math.abs(dist - startDist);

      if (modeRef.current !== 'pinch' && distDelta > 8) {
        // pinch 전환
        modeRef.current = 'pinch';
        const side = pinchSideRef.current;
        markActive(side);
      }

      if (modeRef.current === 'pinch') {
        const side = pinchSideRef.current;
        const factor = dist / Math.max(1, startDist);
        const startT = pinchStartTransformRef.current;
        const nextScale = clampScale(startT.scale * factor);
        // pinch 중심점 기준으로 transform-origin 보정
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const px0 = pinchStartCenterRef.current.x - centerX;
        const py0 = pinchStartCenterRef.current.y - centerY;
        const px = cx - centerX;
        const py = cy - centerY;
        const k = nextScale / startT.scale;
        const next: Transform = {
          scale: nextScale,
          ox: px - (px0 - startT.ox) * k,
          oy: py - (py0 - startT.oy) * k,
        };
        setTransform(side, next);
        return;
      }

      // 2-finger pan (pinch 임계 미달 동안)
      if (modeRef.current === 'pan-touch') {
        const side = panSideRef.current;
        const startT = panStartTransformRef.current;
        const dxp = cx - panAnchorRef.current.x;
        const dyp = cy - panAnchorRef.current.y;
        setTransform(side, {
          scale: startT.scale,
          ox: startT.ox + dxp,
          oy: startT.oy + dyp,
        });
      }
      return;
    }

    // 1개 포인터
    if (modeRef.current === 'pan-touch' || modeRef.current === 'pan-mouse') {
      const side = panSideRef.current;
      const startT = panStartTransformRef.current;
      const dxp = ps.curX - panAnchorRef.current.x;
      const dyp = ps.curY - panAnchorRef.current.y;
      setTransform(side, {
        scale: startT.scale,
        ox: startT.ox + dxp,
        oy: startT.oy + dyp,
      });
    }
  };

  const finalizePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pointersRef.current.delete(e.pointerId);

    const remaining = pointersRef.current.size;

    if (remaining === 0) {
      modeRef.current = 'idle';
      setPanModeActive(false);
      setTouchAction('pan-y');
      return;
    }

    if (remaining === 1) {
      // 한쪽 손가락만 남음 → pinch/2-finger pan 종료, 나머지 포인터는 그대로 두고 idle 복귀
      // (사용자가 일부러 한 손가락만 떼고 계속 pan 하려는 케이스는 보통 드물고,
      //  그대로 single-pointer pan으로 자연 전환되도록 anchor 재설정)
      const last = Array.from(pointersRef.current.values())[0];
      if (modeRef.current === 'pinch' || modeRef.current === 'pan-touch') {
        // single pointer pan으로 전환 (long-press 없이 바로 이어감 — 이미 pan-mode 였으므로 자연)
        panSideRef.current = currentSideFromX(last.curX);
        const side = panSideRef.current;
        panStartTransformRef.current = side === 'A' ? tFrom : tTo;
        panAnchorRef.current = { x: last.curX, y: last.curY };
        modeRef.current = 'pan-touch';
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    finalizePointer(e);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    finalizePointer(e);
  };

  const fromAlt = t('image.alt', { date: fromDate, angle: tAngle(angle) });
  const toAlt = t('image.alt', { date: toDate, angle: tAngle(angle) });

  const ringStyle = (side: Side): React.CSSProperties => {
    if (activeSide !== side) return {};
    return {
      boxShadow: `inset 0 0 0 2px var(--color-accent)`,
      opacity: activeRingStrong ? 1 : 0.4,
      transition: 'opacity 300ms ease-out',
    };
  };

  const imageContainer = (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-[color:var(--color-surface)] shadow-[var(--shadow-sm)]"
      style={{ touchAction, userSelect: 'none' }}
    >
        {/* From 레이어 (좌측) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath:
              adjustOpen || splitHidden
                ? 'inset(0 50% 0 0)'
                : `inset(0 ${100 - ratio}% 0 0)`,
            opacity: adjustOpen && adjustSide !== 'A' ? 0.3 : 1,
            transition: isDragging
              ? 'none'
              : 'clip-path 120ms ease-out, opacity 180ms ease-out',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${tFrom.ox}px, ${tFrom.oy}px) scale(${tFrom.scale})`,
              transformOrigin: '50% 50%',
              willChange: 'transform',
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
          {/* active ring */}
          <div className="pointer-events-none absolute inset-0" style={ringStyle('A')} aria-hidden />
        </div>

        {/* To 레이어 (우측) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath:
              adjustOpen || splitHidden
                ? 'inset(0 0 0 50%)'
                : `inset(0 0 0 ${ratio}%)`,
            opacity: adjustOpen && adjustSide !== 'B' ? 0.3 : 1,
            transition: isDragging
              ? 'none'
              : 'clip-path 120ms ease-out, opacity 180ms ease-out',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${tTo.ox}px, ${tTo.oy}px) scale(${tTo.scale})`,
              transformOrigin: '50% 50%',
              willChange: 'transform',
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
          <div className="pointer-events-none absolute inset-0" style={ringStyle('B')} aria-hidden />
        </div>

        {/* 라벨 pill */}
        <SideLabel position="left" date={fromDate} side="A" />
        <SideLabel position="right" date={toDate} side="B" />

      {/* 분할선 */}
      <SplitHandle
        ratio={ratio}
        onRatioChange={(n) => setRatio(clampRatio(n))}
        onResetMaybe={() => setRatio(50)}
        hidden={splitHidden || panModeActive || adjustOpen}
        forceVisible={demoForceVisible}
        containerRef={containerRef}
        onDragStart={() => {
          draggingRef.current = true;
          setIsDragging(true);
        }}
        onDragEnd={() => {
          draggingRef.current = false;
          setIsDragging(false);
          setRatio((cur) => (Math.abs(cur - 50) <= 2 ? 50 : cur));
        }}
      />
    </div>
  );

  const canOpenAdjust = !splitHidden && (!!fromUrl || !!toUrl);

  return (
    <div className="flex flex-col gap-2">
      {!adjustOpen && showOnboardHint && !splitHidden && (
        <p
          className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-3 py-2 text-center text-[12px] text-[color:var(--color-fg-muted)]"
          role="note"
        >
          {t('adjust.hint')}
        </p>
      )}

      <AdjustModeShell
        open={adjustOpen}
        side={adjustSide}
        onSideChange={setAdjustSide}
        transformA={tFrom}
        transformB={tTo}
        onTransformChange={setTransform}
        hasA={!!fromUrl}
        hasB={!!toUrl}
        onApply={applyAdjust}
        onCancel={() => cancelAdjust(false)}
      >
        {imageContainer}
      </AdjustModeShell>

      {/* 리셋 컨트롤 바 + 조정 진입 */}
      {!adjustOpen && !splitHidden && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => resetTransform('A')}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1.5 text-[12px] text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-2)]"
            aria-label={t('adjust.resetLeft')}
          >
            A
          </button>
          <button
            type="button"
            onClick={() => resetTransform('both')}
            className="rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            aria-label={t('adjust.resetBoth')}
            title={t('adjust.resetShortcut')}
          >
            {t('adjust.resetBoth')}
          </button>
          <button
            type="button"
            onClick={() => resetTransform('B')}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1.5 text-[12px] text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-2)]"
            aria-label={t('adjust.resetRight')}
          >
            B
          </button>
          <button
            type="button"
            onClick={openAdjust}
            disabled={!canOpenAdjust}
            aria-label={t('adjust.enter')}
            className="ml-1 flex items-center gap-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
          >
            <span aria-hidden>✥</span>
            <span>{t('adjust.enter')}</span>
          </button>
        </div>
      )}

      {/* aria live region (분할 비율) */}
      <div ref={liveRef} role="status" aria-live="polite" className="sr-only" />

      {!adjustOpen && splitHidden && (
        <p
          className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-4 py-3 text-center text-[13px] text-[color:var(--color-fg-muted)]"
        >
          {t('empty.sameDate')}
        </p>
      )}

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] bg-[color:var(--color-fg)] px-4 py-2 text-[13px] text-[color:var(--color-surface)] shadow-[var(--shadow-sm)]"
        >
          {t(`adjust.${toastMsg}`)}
        </div>
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
