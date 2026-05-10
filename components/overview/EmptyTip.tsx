'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useStreak } from './useOverviewData';

/**
 * Empty tip — Streak 0~6일 + dismissed 아닐 때만 노출.
 * 카드 박스 없음(부모 MetaInlineBlock가 surface 제공).
 *  - localStorage 'overviewTipDismissed' === 'true' 시 영구 숨김.
 *  - dismiss는 24×24 × 아이콘 버튼 (텍스트 링크 폐기).
 */

const STORAGE_KEY = 'overviewTipDismissed';

function getDismissedFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function TipBullet() {
  return (
    <span
      aria-hidden
      className="mt-[7px] inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--color-fg-subtle)]"
    />
  );
}

export function EmptyTip() {
  const streak = useStreak();
  const t = useTranslations('overview.tip');

  const persistedDismissed = useSyncExternalStore(
    subscribe,
    getDismissedFromStorage,
    () => false,
  );
  const [sessionDismissed, setSessionDismissed] = useState(false);

  if (persistedDismissed || sessionDismissed) return null;
  if (streak === undefined) return null;
  if (streak >= 7) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setSessionDismissed(true);
  }

  return (
    <div className="flex items-start gap-3.5">
      <div className="flex-1">
        <h4
          className="mb-2 text-[15px] font-semibold text-[color:var(--color-fg)]"
          style={{ letterSpacing: '-0.01em' }}
        >
          {t('title')}
        </h4>
        <ul className="flex flex-col gap-[6px]">
          {(['item1', 'item2', 'item3'] as const).map((key) => (
            <li
              key={key}
              className="flex items-start gap-2 text-[13px] leading-relaxed text-[color:var(--color-fg-muted)]"
            >
              <TipBullet />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('dismiss')}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[color:var(--color-fg-subtle)] transition-colors duration-150 hover:bg-[color:var(--color-surface-3)]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M3 3 L11 11 M11 3 L3 11" />
        </svg>
      </button>
    </div>
  );
}
