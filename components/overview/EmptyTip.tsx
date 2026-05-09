'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useStreak } from './useOverviewData';

/**
 * Empty tip — Streak 0~6일 + dismissed 아닐 때만 노출.
 *  - localStorage 'overviewTipDismissed' === 'true' 시 영구 숨김 (설정 페이지에서 reset 가능 — 추후).
 *  - dismiss 클릭 → localStorage 저장 + state로 즉시 unmount.
 *  - SSR/CSR mismatch 방지: useSyncExternalStore로 hydration 안전 처리.
 *    (React 19의 set-state-in-effect 규칙 회피)
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
  // localStorage 변경은 다른 탭에서만 'storage' 이벤트가 발생하지만,
  // 같은 탭 dismiss는 sessionDismissed state로 처리 (아래).
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function EmptyTip() {
  const streak = useStreak();
  const t = useTranslations('overview.tip');

  // 영구 dismiss (localStorage)
  const persistedDismissed = useSyncExternalStore(
    subscribe,
    getDismissedFromStorage,
    () => false, // SSR snapshot
  );
  // 같은 탭 즉시 dismiss (storage 이벤트 미발생 대비)
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
    <section className="flex flex-col gap-2 rounded-[18px] bg-[color:var(--color-surface-2)] px-4 py-3">
      <p className="text-[13px] font-semibold text-[color:var(--color-fg)]">
        {t('title')}
      </p>
      <ul className="flex flex-col gap-1 text-[12px] leading-relaxed text-[color:var(--color-fg-muted)]">
        <li>{t('item1')}</li>
        <li>{t('item2')}</li>
        <li>{t('item3')}</li>
      </ul>
      <button
        type="button"
        onClick={handleDismiss}
        className="mt-1 self-end text-[12px] font-medium text-[color:var(--color-accent-text)] hover:opacity-80"
      >
        {t('dismiss')}
      </button>
    </section>
  );
}
