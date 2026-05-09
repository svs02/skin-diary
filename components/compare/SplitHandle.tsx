'use client';

/**
 * 분할선 + 핸들 노브.
 *  - 시각: 컨테이너 위에 absolute. 좌측에 (100-r)%만큼 비우고 그 자리에 세로선/노브.
 *  - 인터랙션: pointer events는 부모(CompareView)에서 잡아서 ratio를 계산한다 (이 컴포넌트는 표현 + 키보드).
 *  - 키보드 / ARIA는 여기서 부담.
 */

import { useTranslations } from 'next-intl';

interface Props {
  ratio: number; // 5..95
  onRatioChange: (next: number) => void;
  onResetMaybe: () => void; // double click → 50% reset
  hidden?: boolean;
}

const MIN = 5;
const MAX = 95;

export function SplitHandle({ ratio, onRatioChange, onResetMaybe, hidden }: Props) {
  const t = useTranslations('compare');

  function clamp(n: number) {
    return Math.max(MIN, Math.min(MAX, n));
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
      className="pointer-events-auto absolute inset-y-0 z-20 flex items-center justify-center outline-none"
      style={{
        left: `calc(${ratio}% - 28px)`,
        width: 56, // 44dp 이상 hitbox
        cursor: 'ew-resize',
        touchAction: 'none',
      }}
    >
      {/* 분할선: 흰선 + 어두운 외곽선 (대비) */}
      <span
        aria-hidden
        className="absolute inset-y-0"
        style={{
          width: 2,
          background: 'rgba(255,255,255,0.85)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
        }}
      />
      {/* 노브 */}
      <span
        aria-hidden
        className="relative flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none"
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden>
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
