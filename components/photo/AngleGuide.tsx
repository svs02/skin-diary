'use client';

import { useEffect, useRef, useState } from 'react';
import type { Angle } from '@/types';

/**
 * AngleGuide 정렬 상태 (Spec §2.3).
 *  - idle: 초기/검증 전 — 토큰 `--color-camera-guide-idle`
 *  - ok:   가이드 안에 얼굴이 들어옴 — 토큰 `--color-camera-check-ok`
 *  - warn: 정렬 실패 — 토큰 `--color-camera-check-warn` + 미세 진동 1회 (0.4s)
 *
 * 진동은 `state` 가 'warn' 으로 바뀔 때마다 한 번만 트리거되도록 내부 key를 회전시킨다.
 * prefers-reduced-motion 사용자에서는 globals.css 미디어쿼리에서 animation을 disable.
 */
export type AngleGuideState = 'idle' | 'ok' | 'warn';

const STROKE_BY_STATE: Record<AngleGuideState, string> = {
  idle: 'var(--color-camera-guide-idle)',
  ok: 'var(--color-camera-check-ok)',
  warn: 'var(--color-camera-check-warn)',
};

/**
 * 카메라 라이브 프리뷰 위에 얼굴 정렬 가이드를 그린다.
 * Spec §2.3 — viewBox 200×200, stroke 2, fill none.
 *  - front: 중앙 정렬 타원
 *  - left: 우측 50% 클립된 타원 + 중앙 우측 코끝 dashed line
 *  - right: 좌측 50% 클립된 타원 + 중앙 좌측 코끝 dashed line
 *
 * 정렬 검증 알고리즘은 후속 PR — 현재 호출부는 'idle' 만 넘겨 시각 회귀 없음.
 */
export function AngleGuide({
  angle,
  state = 'idle',
}: {
  angle: Angle;
  state?: AngleGuideState;
}) {
  // warn 으로 전환될 때마다 진동 1회 재트리거. ok/idle 전환 시 진동 없음.
  const [shakeKey, setShakeKey] = useState(0);
  const prevStateRef = useRef<AngleGuideState>(state);
  useEffect(() => {
    if (state === 'warn' && prevStateRef.current !== 'warn') {
      setShakeKey((k) => k + 1);
    }
    prevStateRef.current = state;
  }, [state]);

  const stroke = STROKE_BY_STATE[state];

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <div
        key={state === 'warn' ? `warn-${shakeKey}` : 'static'}
        className={
          state === 'warn'
            ? 'angle-guide-shake aspect-square w-[80%] max-w-[480px]'
            : 'aspect-square w-[80%] max-w-[480px]'
        }
        style={{ filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.35))' }}
      >
        <svg
          viewBox="0 0 200 200"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
        >
          {angle === 'front' && (
            <ellipse
              cx="100"
              cy="100"
              rx="78"
              ry="88"
              fill="none"
              stroke={stroke}
              strokeWidth="2"
            />
          )}

          {angle === 'left' && (
            <>
              <defs>
                <clipPath id="captureGuideLeftClip">
                  <rect x="0" y="0" width="100" height="200" />
                </clipPath>
              </defs>
              <ellipse
                cx="100"
                cy="100"
                rx="78"
                ry="88"
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                clipPath="url(#captureGuideLeftClip)"
              />
              <line
                x1="115"
                y1="60"
                x2="115"
                y2="140"
                stroke="var(--color-camera-guide-line)"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </>
          )}

          {angle === 'right' && (
            <>
              <defs>
                <clipPath id="captureGuideRightClip">
                  <rect x="100" y="0" width="100" height="200" />
                </clipPath>
              </defs>
              <ellipse
                cx="100"
                cy="100"
                rx="78"
                ry="88"
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                clipPath="url(#captureGuideRightClip)"
              />
              <line
                x1="85"
                y1="60"
                x2="85"
                y2="140"
                stroke="var(--color-camera-guide-line)"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
