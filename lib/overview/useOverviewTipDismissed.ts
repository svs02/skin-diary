'use client';

import { useSyncExternalStore } from 'react';

/**
 * Overview 'Empty Tip' dismissed 상태 공용 훅.
 *
 * - localStorage `'overviewTipDismissed'` === `'true'` 시 true.
 * - SSR/hydration 안전: server snapshot은 항상 `false` 반환 (기존 EmptyTip 동작 보존).
 * - `storage` 이벤트 구독으로 다른 탭에서의 변경 반영.
 *
 * NOTE: storage key는 변경 금지 — 기존 사용자의 dismiss 상태를 보존해야 함.
 */

export const OVERVIEW_TIP_DISMISSED_KEY = 'overviewTipDismissed';

function getDismissedFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(OVERVIEW_TIP_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function useOverviewTipDismissed(): boolean {
  return useSyncExternalStore(subscribe, getDismissedFromStorage, () => false);
}

export function setOverviewTipDismissed(): void {
  try {
    localStorage.setItem(OVERVIEW_TIP_DISMISSED_KEY, 'true');
  } catch {
    // ignore
  }
}
