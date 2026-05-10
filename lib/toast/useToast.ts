'use client';

import { useContext, useMemo } from 'react';
import { ToastContext, type ToastId } from './ToastProvider';

type ToastAction = { label: string; onClick: () => void };

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  const { push, dismiss } = ctx;
  return useMemo(
    () => ({
      info: (message: string, action?: ToastAction): ToastId =>
        push({ tone: 'info', message, action }),
      success: (message: string, action?: ToastAction): ToastId =>
        push({ tone: 'success', message, action }),
      alert: (message: string, action?: ToastAction): ToastId =>
        push({ tone: 'alert', message, action }),
      // Spec §4.3.c — 자동 dismiss 없음. 외부에서 dismiss(id) 호출 시까지 유지.
      // 호출 사이트(자동 재시도 큐)는 후속 PR. lib/storage/upload.ts 호출부에 TODO 표시.
      retryPending: (message: string, action?: ToastAction): ToastId =>
        push({ tone: 'retry-pending', message, action }),
      dismiss,
    }),
    [push, dismiss],
  );
}
