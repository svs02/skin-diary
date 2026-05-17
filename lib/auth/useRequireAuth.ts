'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

/**
 * Auth gate used by the in-app shell (`app/(app)/layout.tsx`).
 *
 * Two redirects:
 *   1. No auth user → `/login`
 *   2. Auth user but consent not fully populated → `/signup/consent`
 *
 * The consent check uses the real-time userDoc subscription in AuthProvider,
 * so once the user completes the `/signup/consent` flow the gate releases
 * without a manual reload.
 *
 * Returns `loading: true` until both auth state AND (if signed in) the
 * userDoc snapshot have resolved — preventing a flash of authenticated UI
 * while consent state is still unknown.
 */
export function useRequireAuth() {
  const { user, loading, userDoc, hasFullConsent } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Auth user exists; wait for userDoc to load before judging consent.
    if (userDoc === null) return;
    if (hasFullConsent === false) {
      router.replace('/signup/consent');
    }
  }, [loading, user, userDoc, hasFullConsent, router]);

  // Treat "auth user known, doc not yet loaded" as still-loading so callers
  // don't render in-app UI before consent state is settled.
  const effectiveLoading =
    loading || (user !== null && userDoc === null);

  return { user, loading: effectiveLoading };
}
