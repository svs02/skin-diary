'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, type KeyboardEvent } from 'react';
import type { Angle } from '@/types';
import type { SheetMode } from './EditSheet';

export type ViewMode = 'slider' | 'sideBySide';

interface Props {
  angle: Angle;
  fromKey: string;
  toKey: string;
  openSheet: (mode: Exclude<SheetMode, null>, originEl: HTMLElement | null) => void;
  activeMode: SheetMode;
  chipsDisabled?: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const VIEW_MODES: ViewMode[] = ['slider', 'sideBySide'];
const CELL_W = 88;

export function CompareHeader({
  angle,
  fromKey,
  toKey,
  openSheet,
  activeMode,
  chipsDisabled,
  viewMode,
  onViewModeChange,
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
    <div className="flex flex-col gap-2">
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

      {/* sub-row: ViewModeToggle (우측 정렬) */}
      <div className="flex h-10 items-center justify-end">
        <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
      </div>

      {/* 칩 row */}
      <div className="flex items-stretch gap-2">
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
          stretch
        />
        <Chip
          label={shortDate(toKey)}
          active={isBActive}
          disabled={chipsDisabled}
          onClick={(el) => openSheet('dateB', el)}
          ariaControls="compare-edit-sheet"
          prefix="B"
          stretch
        />
      </div>
    </div>
  );
}

function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const t = useTranslations('compare.viewMode');
  const sliderRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLButtonElement>(null);
  const refs: Record<ViewMode, React.RefObject<HTMLButtonElement | null>> = {
    slider: sliderRef,
    sideBySide: sideRef,
  };
  const idx = VIEW_MODES.indexOf(viewMode);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = VIEW_MODES[(idx + 1) % VIEW_MODES.length];
    onChange(next);
    refs[next].current?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={t('toggle')}
      onKeyDown={onKeyDown}
      className="relative inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-0.5"
    >
      <span
        aria-hidden
        className="compare-vm-thumb absolute left-0.5 top-0.5 h-7 rounded-[10px] bg-[color:var(--color-bg)]"
        style={{
          width: `${CELL_W}px`,
          transform: `translateX(${idx * CELL_W}px)`,
          transition:
            'transform 220ms var(--ease-emphasis), background-color 220ms var(--ease-emphasis)',
        }}
      />
      <Tab
        ref={sliderRef}
        selected={viewMode === 'slider'}
        label={t('slider')}
        onSelect={() => onChange('slider')}
      />
      <Tab
        ref={sideRef}
        selected={viewMode === 'sideBySide'}
        label={t('sideBySide')}
        onSelect={() => onChange('sideBySide')}
      />
    </div>
  );
}

function Tab({
  ref,
  selected,
  label,
  onSelect,
}: {
  ref: React.RefObject<HTMLButtonElement | null>;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={`relative z-10 inline-flex h-7 items-center justify-center text-[13px] font-medium transition-colors ${
        selected
          ? 'text-[color:var(--color-fg)]'
          : 'text-[color:var(--color-fg-muted)]'
      }`}
      style={{
        width: `${CELL_W}px`,
        transitionDuration: '220ms',
        transitionTimingFunction: 'var(--ease-emphasis)',
      }}
    >
      {label}
    </button>
  );
}

function Chip({
  label,
  active,
  disabled,
  onClick,
  ariaControls,
  prefix,
  stretch,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: (el: HTMLElement | null) => void;
  ariaControls?: string;
  prefix?: string;
  stretch?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={active}
      aria-controls={ariaControls}
      onClick={(e) => onClick(e.currentTarget)}
      className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium transition-colors ${
        stretch ? 'flex-1 min-w-0 justify-between gap-2' : 'flex-none gap-1'
      } ${
        active
          ? 'bg-[color:var(--color-accent-dim)] text-[color:var(--color-accent-text)]'
          : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-fg)]'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span className={`flex min-w-0 items-center gap-1 ${stretch ? 'truncate' : ''}`}>
        {prefix && <span className="text-[11px] opacity-70">{prefix}</span>}
        <span className={stretch ? 'truncate' : ''}>{label}</span>
      </span>
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
        className="flex-none"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
