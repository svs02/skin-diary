'use client';

import { useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';
import { AngleSegment } from './AngleSegment';
import { MiniCalendar } from './MiniCalendar';

export type SheetMode = 'angle' | 'dateA' | 'dateB' | null;

interface PhotoFlags {
  front: boolean;
  left: boolean;
  right: boolean;
}

interface Props {
  mode: SheetMode;
  uid: string | null;
  fromKey: string;
  toKey: string;
  angle: Angle;
  fromPhotos: PhotoFlags;
  toPhotos: PhotoFlags;
  onClose: () => void;
  onAngleChange: (angle: Angle) => void;
  onDateChange: (which: 'from' | 'to', dateKey: string) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Bottom sheet — angle / dateA / dateB 모드 분기.
 *  - mode가 null이면 unmount.
 *  - role=dialog, aria-modal, 포커스 트랩, Esc 닫힘, 직전 포커스 반환.
 *  - backdrop 탭/✕ 닫힘. 진입 220ms ease-out (reduced-motion 즉시).
 *  - 적용은 자동 (값 변경 즉시 onClose).
 *  - 아래 스와이프 (>60dp) dismiss는 단순 pointer 추적으로 구현.
 */
export function EditSheet({
  mode,
  uid,
  fromKey,
  toKey,
  angle,
  fromPhotos,
  toPhotos,
  onClose,
  onAngleChange,
  onDateChange,
  returnFocusRef,
}: Props) {
  const t = useTranslations('compare.sheet');
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);

  // ---- 진입 시 첫 컨트롤로 포커스, 닫힐 때 returnFocus ----
  useEffect(() => {
    if (mode == null) return;
    const el = sheetRef.current;
    if (!el) return;
    const focusable = el.querySelector<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [mode]);

  // ---- Esc 닫힘 + 포커스 트랩 ----
  useEffect(() => {
    if (mode == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = sheetRef.current;
      if (!el) return;
      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => !n.hasAttribute('aria-disabled') || n.getAttribute('aria-disabled') !== 'true');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  // ---- 닫힐 때 직전 포커스 반환 ----
  useEffect(() => {
    if (mode != null) return;
    const el = returnFocusRef?.current;
    if (el) {
      try {
        el.focus();
      } catch {
        /* ignore */
      }
    }
  }, [mode, returnFocusRef]);

  if (mode == null) return null;

  // mode != null일 때만 mount되므로 SSR 시점엔 evaluate되지 않음 → hydration 안전.
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const title =
    mode === 'angle'
      ? t('angleTitle')
      : mode === 'dateA'
      ? t('dateTitleA')
      : t('dateTitleB');

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    dragStartYRef.current = e.clientY;
    dragOffsetRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartYRef.current == null) return;
    const dy = e.clientY - dragStartYRef.current;
    if (dy > 0) {
      dragOffsetRef.current = dy;
      const sheet = sheetRef.current;
      if (sheet) sheet.style.transform = `translateY(${dy}px)`;
    }
  }
  function onDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const dy = dragOffsetRef.current;
    dragStartYRef.current = null;
    dragOffsetRef.current = 0;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = '';
    if (dy > 60) {
      onClose();
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50"
      style={{ background: 'rgba(20,35,70,0.32)' }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2"
        style={{
          background: 'var(--color-surface)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '60vh',
          overflow: 'auto',
          transform: reduced ? 'translateY(0)' : undefined,
          animation: reduced ? undefined : 'compareSheetIn 220ms ease-out',
        }}
      >
        {/* grabber + drag area */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="flex cursor-grab justify-center pt-2"
          style={{ touchAction: 'none' }}
        >
          <span
            aria-hidden
            className="block h-1 w-9 rounded-full"
            style={{ background: 'var(--color-surface-3)' }}
          />
        </div>

        {/* header */}
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-[16px] font-semibold text-[color:var(--color-fg)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-2)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="pb-3">
          {mode === 'angle' && (
            <AngleSegment
              value={angle}
              onChange={(a) => {
                onAngleChange(a);
                onClose();
              }}
              fromPhotos={fromPhotos}
              toPhotos={toPhotos}
            />
          )}
          {mode === 'dateA' && (
            <MiniCalendar
              uid={uid}
              value={fromKey}
              otherValue={toKey}
              onSelect={(d) => {
                onDateChange('from', d);
                onClose();
              }}
            />
          )}
          {mode === 'dateB' && (
            <MiniCalendar
              uid={uid}
              value={toKey}
              otherValue={fromKey}
              onSelect={(d) => {
                onDateChange('to', d);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
