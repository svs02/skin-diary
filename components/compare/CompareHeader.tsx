'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';
import type { SheetMode } from './EditSheet';

interface Props {
  angle: Angle;
  fromKey: string;
  toKey: string;
  openSheet: (mode: Exclude<SheetMode, null>, originEl: HTMLElement | null) => void;
  activeMode: SheetMode;
  chipsDisabled?: boolean;
}

/**
 * 헤더(56dp sticky) + 칩 row.
 *  - 백버튼은 router.back() (44dp 터치 타겟).
 *  - 칩: angle / dateA / dateB. 클릭 시 sheet 오픈.
 *  - 활성(sheet 열림 중): bg accent-dim + accent-text.
 */
export function CompareHeader({
  angle,
  fromKey,
  toKey,
  openSheet,
  activeMode,
  chipsDisabled,
}: Props) {
  const router = useRouter();
  const t = useTranslations('compare');
  const tAngle = useTranslations('compare.angles');

  const isAngleActive = activeMode === 'angle';
  const isAActive = activeMode === 'dateA';
  const isBActive = activeMode === 'dateB';

  function shortDate(key: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key.slice(5) : key;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 56dp sticky header */}
      <header
        className="sticky top-0 z-20 -mx-5 flex h-14 items-center px-2"
        style={{ background: 'var(--color-bg)' }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t('back')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-2)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[16px] font-semibold text-[color:var(--color-fg)]">
          {t('title')}
        </h1>
      </header>

      {/* 칩 row */}
      <div className="flex flex-wrap gap-2">
        <Chip
          label={tAngle(angle)}
          active={isAngleActive}
          disabled={chipsDisabled}
          onClick={(el) => openSheet('angle', el)}
          ariaControls="compare-edit-sheet"
        />
        <Chip
          label={shortDate(fromKey)}
          active={isAActive}
          disabled={chipsDisabled}
          onClick={(el) => openSheet('dateA', el)}
          ariaControls="compare-edit-sheet"
          prefix="A"
        />
        <Chip
          label={shortDate(toKey)}
          active={isBActive}
          disabled={chipsDisabled}
          onClick={(el) => openSheet('dateB', el)}
          ariaControls="compare-edit-sheet"
          prefix="B"
        />
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  disabled,
  onClick,
  ariaControls,
  prefix,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: (el: HTMLElement | null) => void;
  ariaControls?: string;
  prefix?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={active}
      aria-controls={ariaControls}
      onClick={(e) => onClick(e.currentTarget)}
      className={`inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-[color:var(--color-accent-dim)] text-[color:var(--color-accent-text)]'
          : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-fg)]'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      {prefix && <span className="text-[11px] opacity-70">{prefix}</span>}
      <span>{label}</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
