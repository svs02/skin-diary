import type { SVGProps } from 'react';

/**
 * Skin Diary brand logo.
 *
 * Canonical geometry (viewBox 0 0 64 64):
 *   - Outline ring:  circle r=22 at (32,32), stroke-width 2.4
 *   - Filled half:   right semicircle, vertical split — never rotated
 *
 * Token mapping:
 *   - 'accent'  → light-surface brand blue  (#2C6ECB)
 *   - 'inverse' → dark-surface brand blue   (#4A8FE8)
 *   - 'mono'   → currentColor (parent text color)
 *
 * Lockup wordmark: "Skin Diary" #1F4E94 + "스킨 다이어리" opacity 0.7.
 *
 * Stroke-width is stepped (not interpolated) per size for optical balance
 * at small renderings.
 */

export type LogoVariant = 'symbol' | 'lockup';
export type LogoTone = 'accent' | 'mono' | 'inverse';

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'fill' | 'stroke'> {
  variant?: LogoVariant;
  size?: number;
  tone?: LogoTone;
}

const ACCENT = '#2C6ECB';
const INVERSE = '#4A8FE8';
const WORDMARK = '#1F4E94';

function strokeForSize(size: number): number {
  if (size <= 16) return 5.0;
  if (size <= 24) return 3.6;
  if (size <= 32) return 2.8;
  return 2.4;
}

function paintForTone(tone: LogoTone): { stroke: string; fill: string; word: string } {
  if (tone === 'mono') {
    return { stroke: 'currentColor', fill: 'currentColor', word: 'currentColor' };
  }
  if (tone === 'inverse') {
    return { stroke: INVERSE, fill: INVERSE, word: INVERSE };
  }
  return { stroke: ACCENT, fill: ACCENT, word: WORDMARK };
}

export function Logo({
  variant = 'symbol',
  size = 40,
  tone = 'accent',
  ...rest
}: LogoProps) {
  const sw = strokeForSize(size);
  const paint = paintForTone(tone);
  const commonProps = {
    role: 'img' as const,
    'aria-label': 'Skin Diary',
    focusable: false as const,
  };

  if (variant === 'lockup') {
    // Lockup uses fixed 240x64 viewBox; height scales to `size`, width preserves ratio.
    const height = size;
    const width = (size * 240) / 64;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 240 64"
        width={width}
        height={height}
        {...commonProps}
        {...rest}
      >
        <circle cx="32" cy="32" r="22" fill="none" stroke={paint.stroke} strokeWidth={sw} />
        <path d="M32 10 A 22 22 0 0 1 32 54 Z" fill={paint.fill} />
        <g
          fontFamily="Pretendard, 'Pretendard Variable', system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif"
          fill={paint.word}
        >
          <text x="76" y="33" fontSize="28" fontWeight={600} letterSpacing="-0.84">
            Skin Diary
          </text>
          <text
            x="76"
            y="49"
            fontSize="14"
            fontWeight={500}
            letterSpacing="0.28"
            fillOpacity={0.7}
          >
            스킨 다이어리
          </text>
        </g>
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      {...commonProps}
      {...rest}
    >
      <circle cx="32" cy="32" r="22" fill="none" stroke={paint.stroke} strokeWidth={sw} />
      <path d="M32 10 A 22 22 0 0 1 32 54 Z" fill={paint.fill} />
    </svg>
  );
}

export default Logo;
