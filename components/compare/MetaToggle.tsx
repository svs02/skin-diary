'use client';

import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

/**
 * "그날 메모 보기 ▾" 토글. 펼침 시 children(메타 카드) 노출.
 *  - max-height transition 180ms (reduced-motion 시 즉시 — CSS @media로 처리).
 *  - aria-expanded / aria-controls.
 */

function subscribeReducedMotion(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener?.('change', cb);
  return () => mql.removeEventListener?.('change', cb);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

interface Props {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function MetaToggle({ children, open, onOpenChange }: Props) {
  const t = useTranslations('compare.meta');
  const panelId = useId();
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  function handleToggle() {
    if (!open && innerRef.current) {
      setContentHeight(innerRef.current.scrollHeight);
    }
    onOpenChange(!open);
  }

  // reduced-motion은 useSyncExternalStore로 SSR/hydration 안전하게 구독.
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-11 items-center justify-between rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-4 text-left text-[14px] font-medium text-[color:var(--color-fg)]"
      >
        <span>{open ? t('toggleClose') : t('toggleOpen')}</span>
        <Chevron open={open} />
      </button>
      <div
        id={panelId}
        aria-hidden={!open}
        style={{
          maxHeight: reduced ? (open ? 'none' : 0) : open ? (contentHeight ?? 800) : 0,
          overflow: 'hidden',
          transition: reduced ? 'none' : 'max-height 180ms ease-out',
        }}
      >
        <div ref={innerRef} className="pt-2">
          {children}
        </div>
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 180ms ease-out',
      }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
