'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'skin-diary:theme';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyThemeAttribute(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

/**
 * Theme hook.
 *
 * SSR/CSR flash is prevented by an inline script in `app/layout.tsx` that
 * runs before hydration and writes the correct `data-theme` attribute on
 * <html>. This hook only handles user actions and live OS theme changes.
 */
export function useTheme() {
  // Lazy initializers read localStorage / matchMedia on the client only.
  // Consumers are 'use client' components, so SSR mismatch isn't an issue:
  // the inline boot script in app/layout.tsx already set the correct
  // data-theme attribute before hydration.
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const stored = readStoredTheme();
    return stored === 'system' ? getSystemTheme() : stored;
  });

  // Subscribe to OS theme changes (only matters when theme === 'system').
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = (event: MediaQueryListEvent) => {
      if (theme !== 'system') return;
      setResolvedTheme(event.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handle);
    return () => {
      mql.removeEventListener('change', handle);
    };
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolvedTheme(next === 'system' ? getSystemTheme() : next);
    applyThemeAttribute(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // localStorage may be disabled (private mode); ignore.
      }
    }
  }, []);

  return { theme, setTheme, resolvedTheme };
}
