'use client';

import { useContext, useMemo } from 'react';
import { ToastContext } from './ToastProvider';

type ToastAction = { label: string; onClick: () => void };

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  const { push } = ctx;
  return useMemo(
    () => ({
      info: (message: string, action?: ToastAction) =>
        push({ tone: 'info', message, action }),
      success: (message: string, action?: ToastAction) =>
        push({ tone: 'success', message, action }),
      alert: (message: string, action?: ToastAction) =>
        push({ tone: 'alert', message, action }),
    }),
    [push],
  );
}
