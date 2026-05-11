'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';

/**
 * Spec §3.5 — 채워진 슬롯의 ⋯ 메뉴.
 * 모바일/데스크톱 동일 bottom sheet (MVP 일관성 — popover 분리는 후속).
 * 항목 순서 고정: 다시 촬영 / 갤러리에서 교체 / (구분선) / 삭제.
 * 삭제는 빨간색 사용 금지 (Spec §3.7 — 다크 패턴 회피).
 */
export type PhotoMenuSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  angle: Angle;
  onRetake: () => void;
  onReplace: () => void;
  onDelete: () => void;
};

export function PhotoMenuSheet({
  open,
  onOpenChange,
  angle,
  onRetake,
  onReplace,
  onDelete,
}: PhotoMenuSheetProps) {
  const tMenu = useTranslations('record.photos.menu');
  const tAngles = useTranslations('record.angles');

  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (open) {
      // open=true: 즉시 mount → 다음 프레임에 진입 애니메이션 트리거.
      // mount는 sheet의 DOM 부착 자체라 props→DOM 동기화이며, animate는 RAF 비동기.
      // derived state로는 close 애니메이션 220ms 동안 mount=true 유지가 어려워 effect를 유지한다.
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
    firstItemRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

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

  if (!mounted) return null;

  const handleAction = (cb: () => void) => () => {
    close();
    // 시트 dismiss 후 콜백을 호출해 토스트/라우팅이 시트와 충돌하지 않게 한다.
    setTimeout(cb, 0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-menu-sheet-title"
      className="fixed inset-0 z-50"
      onKeyDown={onTabKey}
    >
      <button
        type="button"
        aria-label={tMenu('cancel')}
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
          'rounded-t-[var(--radius-lg)] shadow-[var(--shadow-raised)]',
          'md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          'md:w-[360px] md:max-w-[calc(100vw-32px)] md:rounded-[var(--radius-lg)]',
          'transition-transform duration-200 ease-out',
        ].join(' ')}
        style={{
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        }}
      >
        {/* Mobile drag handle (visual only) */}
        <div
          className="flex h-7 items-center justify-center md:hidden"
          aria-hidden
        >
          <span className="h-1 w-10 rounded-full bg-fg-subtle/30" />
        </div>

        <h2 id="photo-menu-sheet-title" className="sr-only">
          {tAngles(angle)} — {tMenu('openAria')}
        </h2>

        <div className="flex flex-col px-2 pb-2 pt-1">
          <button
            ref={firstItemRef}
            type="button"
            onClick={handleAction(onRetake)}
            className="flex h-12 items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-medium text-fg hover:bg-surface-2"
          >
            <RetakeIcon />
            <span>{tMenu('retake')}</span>
          </button>
          <button
            type="button"
            onClick={handleAction(onReplace)}
            className="flex h-12 items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-medium text-fg hover:bg-surface-2"
          >
            <ImageIcon />
            <span>{tMenu('replace')}</span>
          </button>
          <div
            role="separator"
            className="mx-3 my-1 h-px bg-[color:var(--color-border)]"
            aria-hidden
          />
          <button
            type="button"
            onClick={handleAction(onDelete)}
            className="flex h-12 items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-medium text-fg hover:bg-surface-2"
          >
            <TrashIcon />
            <span>{tMenu('delete')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function RetakeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-fg-muted"
    >
      <path d="M14.5 4h-5l-2 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5l-2-2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-fg-muted"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-fg-muted"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
