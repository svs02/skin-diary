'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';

/**
 * Shape of the relevant subset of the `users/{uid}` Firestore document.
 *
 * We only expose the fields needed for consent gating here — the full User
 * type (with Timestamps etc.) lives in `types/index.ts` and is the right
 * shape for screens that actually render profile data.
 */
export interface UserDocConsent {
  termsVersion: string | null;
  privacyVersion: string | null;
  sensitivePhotoVersion: string | null;
  ageConfirmed: true | null;
}

interface AuthState {
  user: FirebaseUser | null;
  loading: boolean;
  /**
   * The user's Firestore profile doc. `null` means either:
   *   (a) no auth user, or
   *   (b) auth user exists but the Firestore doc hasn't synced yet, or
   *   (c) auth user exists and the doc literally doesn't exist (rare —
   *       Google sign-in race window before `ensureUserDoc` runs).
   * Consumers should treat `null` as "consent unknown" and wait.
   */
  userDoc: UserDocConsent | null;
  /**
   * `true` once the userDoc is loaded and all four consent dimensions are
   * populated. `false` means we know the user is in deferred state and
   * should be routed to `/signup/consent`. `null` means we don't know yet
   * (still loading the userDoc) — render nothing / show a spinner.
   */
  hasFullConsent: boolean | null;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  userDoc: null,
  hasFullConsent: null,
});

function computeFullConsent(doc: UserDocConsent | null): boolean | null {
  if (doc === null) return null;
  return (
    doc.termsVersion !== null &&
    doc.privacyVersion !== null &&
    doc.sensitivePhotoVersion !== null &&
    doc.ageConfirmed === true
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDoc, setUserDoc] = useState<UserDocConsent | null>(null);

  // Auth state stream — top level so we can chain a doc listener off uid.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
      // Clear userDoc when auth user changes (sign-out or account switch);
      // the doc-listener effect below will re-subscribe.
      if (!next) setUserDoc(null);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to users/{uid} as long as we have an auth user. Real-time so
  // the deferred→full consent transition (post-OAuth `/signup/consent`)
  // immediately propagates — the consent gate effect below depends on this
  // to unblock navigation without a manual reload.
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // Doc not yet created — keep userDoc null so consumers wait.
          setUserDoc(null);
          return;
        }
        const data = snap.data();
        setUserDoc({
          termsVersion: (data.termsVersion as string | null) ?? null,
          privacyVersion: (data.privacyVersion as string | null) ?? null,
          sensitivePhotoVersion:
            (data.sensitivePhotoVersion as string | null) ?? null,
          ageConfirmed:
            data.ageConfirmed === true ? true : null,
        });
      },
      // Permission errors here are non-fatal — they mean the user signed out
      // mid-listener or the rules transitioned. Just clear and let auth state
      // drive the next subscription.
      () => setUserDoc(null),
    );
    return () => unsubscribe();
  }, [user]);

  const value: AuthState = {
    user,
    loading,
    userDoc,
    hasFullConsent: computeFullConsent(userDoc),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
