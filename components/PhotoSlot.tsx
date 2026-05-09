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
  onPick,
  onRetry,
}: {
  angle: Angle;
  state: SlotState;
  imageUrl?: string;
  errorMessage?: string;
  onPick: (file: File) => void;
  onRetry?: () => void;
}) {
  const tAngles = useTranslations('record.angles');
  const tPhotos = useTranslations('record.photos');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const angleLabel = tAngles(angle);
  const ariaLabel =
    state === 'filled'
      ? `${angleLabel} — ${tPhotos('tapToAdd')}`
      : `${angleLabel} — ${tPhotos('tapToAdd')}`;

  function trigger() {
    if (state === 'uploading') return; // 동시 입력 방지
    inputRef.current?.click();
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
        className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[14px] text-[11px] font-medium transition-colors ${
          state === 'empty'
            ? 'border border-dashed border-[color:var(--color-border)] bg-surface/40 text-fg-subtle hover:bg-surface-2'
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

        {state === 'empty' && (
          <>
            <PlusIcon />
            <span className="mt-1">{tPhotos('tapToAdd')}</span>
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
            {onRetry && (
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
