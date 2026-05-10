'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';

export type SlotState = 'empty' | 'uploading' | 'filled' | 'error';

export function PhotoSlot({
  angle,
  state,
  imageUrl,
  errorMessage,
  showRetry = true,
  onPick,
  onRetry,
  onEmptyClick,
  onMenuOpen,
}: {
  angle: Angle;
  state: SlotState;
  imageUrl?: string;
  errorMessage?: string;
  showRetry?: boolean;
  onPick: (file: File) => void;
  onRetry?: () => void;
  onEmptyClick: () => void;
  /**
   * Spec §3.3 — filled 상태 우상단 ⋯ 버튼 클릭 시 부모에게 메뉴 열기를 위임.
   * filled 상태가 아니면 호출되지 않는다 (버튼 자체가 렌더되지 않음).
   */
  onMenuOpen?: () => void;
}) {
  const tAngles = useTranslations('record.angles');
  const tPhotos = useTranslations('record.photos');
  const tMenu = useTranslations('record.photos.menu');
  // empty 상태에서만 file picker fallback이 필요. filled 상태에선 hidden input을 두지 않는다 (Spec §3.3).
  const inputRef = useRef<HTMLInputElement | null>(null);

  const angleLabel = tAngles(angle);
  const emptyLabel = tPhotos('emptySlot', { angle: angleLabel });
  const ariaLabel =
    state === 'empty'
      ? `${angleLabel} — ${emptyLabel}`
      : state === 'filled'
        ? `${angleLabel} — ${tMenu('openAria')}`
        : `${angleLabel} — ${tPhotos('tapToAdd')}`;

  function trigger() {
    if (state === 'uploading') return; // 동시 입력 방지
    if (state === 'empty') {
      onEmptyClick();
      return;
    }
    // Spec §3.3: filled 상태에서 슬롯 자체 tap은 noop.
    // 교체/삭제는 ⋯ 메뉴 경유. error 상태도 동일 (재시도는 별도 버튼).
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 고를 수 있도록 즉시 리셋
    e.target.value = '';
    if (file) onPick(file);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (state === 'uploading') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // filled 상태에서 키보드로 활성화 시 메뉴 열기 — 마우스와 동일 흐름
      if (state === 'filled') {
        onMenuOpen?.();
        return;
      }
      trigger();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="button"
        tabIndex={state === 'uploading' ? -1 : 0}
        aria-label={ariaLabel}
        aria-busy={state === 'uploading' || undefined}
        onClick={trigger}
        onKeyDown={handleKeyDown}
        className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[14px] text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] ${
          state === 'empty'
            ? 'border border-dashed border-[color:var(--color-border-strong)] bg-surface-2 text-[color:var(--color-accent-text)] hover:border-[color:var(--color-accent-dim)]'
            : state === 'error'
              ? 'border border-[color:var(--color-danger,#ef4444)] bg-surface text-fg'
              : 'bg-surface'
        }`}
      >
        {state === 'filled' && imageUrl && (
          // 동적 Firebase Storage URL — next/image 미사용 (next.config remotePatterns 회피)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={angleLabel}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {state === 'filled' && onMenuOpen && (
          <button
            type="button"
            aria-label={`${angleLabel} — ${tMenu('openAria')}`}
            onClick={(e) => {
              e.stopPropagation();
              onMenuOpen();
            }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface text-fg-muted shadow-[var(--shadow-raised)] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
          >
            <DotsIcon />
          </button>
        )}

        {state === 'empty' && (
          <>
            <PlusIcon />
            <span className="mt-1">{emptyLabel}</span>
          </>
        )}

        {state === 'uploading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80">
            <Spinner />
            <span className="mt-2 text-fg-muted">{tPhotos('uploading')}</span>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-1 px-2 text-center">
            <span className="text-[11px] text-[color:var(--color-danger,#ef4444)]">
              {errorMessage}
            </span>
            {onRetry && showRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="rounded-full bg-accent-dim px-2 py-0.5 text-[10px] font-semibold text-[color:var(--color-accent-text)]"
              >
                {tPhotos('retry')}
              </button>
            )}
          </div>
        )}

        {/* empty 상태에서만 hidden input 유지. filled 상태에서는 슬롯 자체로 파일 picker를 트리거하지 않는다 (Spec §3.3). */}
        {state === 'empty' && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleChange}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
        )}
      </div>
      <span className="text-center text-[11px] font-medium text-fg-subtle">
        {angleLabel}
      </span>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="animate-spin text-fg-muted"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" strokeLinecap="round" />
    </svg>
  );
}
