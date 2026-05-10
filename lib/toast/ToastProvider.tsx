'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'info' | 'success' | 'alert';

export type ToastInput = {
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
};

type ActiveToast = ToastInput & { id: number };

type ToastContextValue = {
  push: (input: ToastInput) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

// Spec §4.3.c: alert(action 있는 경우)는 사용자 선택 여유 5s, 그 외 4s.
const AUTO_DISMISS_INFO_MS = 4000;
const AUTO_DISMISS_ALERT_MS = 5000;
// Spec §4.3.a: single-stack + 250ms grace — 직전 토스트의 자연 dismiss 애니메이션 보장.
const GRACE_MS = 250;

function dismissDurationFor(input: ToastInput): number {
  return input.tone === 'alert' ? AUTO_DISMISS_ALERT_MS : AUTO_DISMISS_INFO_MS;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveToast | null>(null);
  const idRef = useRef(0);
  // 자동 dismiss 타이머
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 250ms grace 타이머 — push 충돌 시 직전 토스트 dismiss 후 다음 토스트 진입
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearGrace = useCallback(() => {
    if (graceRef.current) {
      clearTimeout(graceRef.current);
      graceRef.current = null;
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      clearTimer();
      clearGrace();
      const next: ActiveToast = { ...input, id: ++idRef.current };
      const ms = dismissDurationFor(input);
      const scheduleDismiss = () => {
        timerRef.current = setTimeout(() => {
          setActive((current) =>
            current && current.id === next.id ? null : current,
          );
          timerRef.current = null;
        }, ms);
      };

      // 현재 active가 없으면 즉시 표시. 있으면 250ms grace로 부드럽게 교체.
      if (active == null) {
        setActive(next);
        scheduleDismiss();
      } else {
        setActive(null);
        graceRef.current = setTimeout(() => {
          setActive(next);
          scheduleDismiss();
          graceRef.current = null;
        }, GRACE_MS);
      }
    },
    [active, clearTimer, clearGrace],
  );

  useEffect(() => {
    return () => {
      clearTimer();
      clearGrace();
    };
  }, [clearTimer, clearGrace]);

  const value = useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport active={active} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ active }: { active: ActiveToast | null }) {
  if (!active) return null;
  const role = active.tone === 'alert' ? 'alert' : 'status';
  const aria = active.tone === 'alert' ? 'assertive' : 'polite';
  return (
    <div
      role={role}
      aria-live={aria}
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4"
    >
      <div
        key={active.id}
        className="pointer-events-auto flex max-w-[min(92vw,360px)] items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-surface-2 px-4 py-3 text-[14px] text-fg shadow-[var(--shadow-raised)]"
      >
        <ToastIcon tone={active.tone} />
        <span className="flex-1 leading-snug">{active.message}</span>
        {active.action && (
          <button
            type="button"
            onClick={active.action.onClick}
            className="rounded-md text-[13px] font-medium text-[color:var(--color-accent-text)] hover:underline"
          >
            {active.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0 text-[color:var(--color-accent-text)]"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (tone === 'alert') {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0 text-[color:var(--color-camera-check-warn)]"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-fg-muted"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
