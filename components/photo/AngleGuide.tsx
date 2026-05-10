'use client';

import type { Angle } from '@/types';

/**
 * 카메라 라이브 프리뷰 위에 얼굴 정렬 가이드를 그린다.
 * Spec §2.3 — viewBox 200×200, stroke 2, fill none.
 *  - front: 중앙 정렬 타원
 *  - left: 우측 50% 클립된 타원 + 중앙 우측 코끝 dashed line
 *  - right: 좌측 50% 클립된 타원 + 중앙 좌측 코끝 dashed line
 */
export function AngleGuide({ angle }: { angle: Angle }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <div
        className="aspect-square w-[80%] max-w-[480px]"
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
              stroke="var(--color-camera-guide-oval)"
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
                stroke="var(--color-camera-guide-oval)"
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
                stroke="var(--color-camera-guide-oval)"
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
