'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';

const ANGLES: Angle[] = ['front', 'left', 'right'];
const SWIPE_DISMISS_PX = 80;

export type AddPhotoSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCamera: () => void;
  onGallery: () => void;
  angle: Angle;
  onAngleChange: (angle: Angle) => void;
};

export function AddPhotoSheet({
  open,
  onOpenChange,
  onCamera,
  onGallery,
  angle,
  onAngleChange,
}: AddPhotoSheetProps) {
  const tSheet = useTranslations('record.photos.sheet');
  const tAngles = useTranslations('record.angles');

  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Mount + enter animation
  useEffect(() => {
    if (open) {
      // open=true: 즉시 mount → 다음 프레임에 진입 애니메이션 트리거.
      // close 애니메이션 220ms 보존을 위해 derived state로 풀 수 없으므로
      // effect 안의 setState를 좁게 허용한다 (PhotoMenuSheet과 동일 패턴).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sheet open 시 DOM 부착(mount) 동기화. close 애니메이션 보존을 위해 derived state 불가.
      setMounted(true);
      const id = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(id);
    }
    setAnimateIn(false);
    const id = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(id);
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (!mounted) return;
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Esc to close + initial focus
  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Camera availability detection
  useEffect(() => {
    if (!open) return;
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    let cancelled = false;
    md.enumerateDevices()
      .then((devices) => {
        if (cancelled) return;
        const hasCamera = devices.some((d) => d.kind === 'videoinput');
        setCameraUnavailable(!hasCamera);
      })
      .catch(() => {
        // permission/feature unavailable — keep default copy
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function onTabKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
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

  function onHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      return; // desktop lightbox: no swipe
    }
    dragStartRef.current = e.clientY;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartRef.current == null) return;
    const delta = e.clientY - dragStartRef.current;
    setDrag(Math.max(0, delta));
  }

  function onHandlePointerUp() {
    if (dragStartRef.current == null) return;
    const finalDrag = drag;
    dragStartRef.current = null;
    setDrag(0);
    if (finalDrag >= SWIPE_DISMISS_PX) {
      close();
    }
  }

  if (!mounted) return null;

  const cameraSubtitle = cameraUnavailable
    ? tSheet('cta.cameraUnavailable')
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-photo-sheet-title"
      className="fixed inset-0 z-50"
      onKeyDown={onTabKey}
    >
      <button
        type="button"
        aria-label={tSheet('cancel')}
        onClick={close}
        className={`absolute inset-0 transition-opacity duration-200 ease-out ${
          animateIn ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'rgba(0,0,0,0.32)' }}
      />

      <div
        ref={sheetRef}
        className={[
          'absolute left-0 right-0 bottom-0 mx-auto bg-surface',
          'rounded-t-[16px] shadow-[var(--shadow-raised)]',
          'md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          'md:w-[480px] md:max-w-[calc(100vw-32px)] md:rounded-[20px]',
          'transition-transform duration-200 ease-out',
        ].join(' ')}
        style={{
          transform: animateIn
            ? `translateY(${drag}px)`
            : 'translateY(100%)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        }}
      >
        {/* Mobile drag handle */}
        <div
          className="flex h-7 cursor-grab touch-none items-center justify-center md:hidden"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          aria-hidden
        >
          <span className="h-1 w-10 rounded-full bg-fg-subtle/30" />
        </div>

        {/* Desktop close button */}
        <button
          ref={closeRef}
          type="button"
          aria-label={tSheet('cancel')}
          onClick={close}
          className="absolute right-3 top-3 hidden h-11 w-11 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 md:flex"
        >
          <CloseIcon />
        </button>

        <div className="flex flex-col gap-4 px-5 pb-5 pt-2 md:px-6 md:pb-6 md:pt-6">
          <header className="flex flex-col gap-1 md:pr-10">
            <h2 id="add-photo-sheet-title" className="text-[20px] font-semibold leading-snug">
              {tSheet('title')}
            </h2>
            <p className="text-[14px] text-fg-muted">{tSheet('subtitle')}</p>
          </header>

          <div
            className="flex gap-2"
            role="radiogroup"
            aria-label={tSheet('angle.helper')}
          >
            {ANGLES.map((a) => {
              const active = a === angle;
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onAngleChange(a)}
                  className={[
                    'flex-1 rounded-full px-3 py-1.5 text-center text-[12px] font-semibold transition-colors',
                    active
                      ? 'bg-accent text-[color:var(--color-surface)]'
                      : 'bg-accent-dim text-[color:var(--color-accent-text)] hover:bg-accent/20',
                  ].join(' ')}
                >
                  {tAngles(a)}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {/* Mobile: camera Primary on top. Desktop: gallery left, camera right (Spec §1.3 mirror). */}
            <button
              ref={primaryRef}
              type="button"
              onClick={() => {
                onCamera();
                close();
              }}
              className="order-1 flex h-[52px] items-center justify-center gap-2 rounded-[12px] bg-accent text-[15px] font-semibold text-[color:var(--color-surface)] md:order-2"
            >
              <CameraIcon />
              <span>{tSheet('cta.camera')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onGallery();
                close();
              }}
              className="order-2 flex h-[52px] items-center justify-center gap-2 rounded-[12px] bg-surface-2 text-[15px] font-medium text-fg md:order-1"
            >
              <ImageIcon />
              <span>{tSheet('cta.gallery')}</span>
            </button>
          </div>

          {cameraSubtitle && (
            <p
              role="status"
              className="text-[12px] text-[color:var(--color-camera-check-warn)]"
            >
              {cameraSubtitle}
            </p>
          )}

          <p className="text-center text-[12px] text-fg-muted">
            {tSheet('angle.helper')}
          </p>
        </div>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5l-2 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5l-2-2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
