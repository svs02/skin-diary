'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { applyDeferredConsent } from '@/lib/auth/ensureUserDoc';
import {
  LEGAL_PRIVACY_VERSION,
  LEGAL_SENSITIVE_PHOTO_VERSION,
  LEGAL_TERMS_VERSION,
} from '@/lib/legal/versions';
import { LocaleToggle } from '@/components/LocaleToggle';
import { useToast } from '@/lib/toast';

/**
 * Post-OAuth consent gate.
 *
 * Reached by users whose Auth account was created before our consent UI ran
 * (today: Google sign-in). Their userDoc exists in "deferred" state (all four
 * consent fields are null). We force them through this page before any
 * in-app navigation.
 *
 * Three terminal actions:
 *   1. Agree   → `applyDeferredConsent()` → `/today`
 *   2. Cancel  → `POST /api/account/abandon-signup` → `signOut()` → `/login`
 *   3. Unload  → fire-and-forget `POST /api/account/abandon-signup` with
 *                `keepalive: true` so the request outlives the page. Covers
 *                tab close / browser back / refresh per CLAUDE.md §10.4.
 *
 * The unload path uses a cached ID token (synchronously read in the
 * `pagehide` handler) and an `abandonOnUnloadRef` guard so an in-flight
 * Agree submission is never racing the unload abandon.
 */
export default function SignupConsentPage() {
  const t = useTranslations('signup.consent');
  const tLogin = useTranslations('auth.login');
  const router = useRouter();
  const toast = useToast();
  const { user, loading: authLoading, hasFullConsent } = useAuth();

  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentSensitivePhoto, setConsentSensitivePhoto] = useState(false);
  const [consentAge, setConsentAge] = useState(false);
  const allConsented =
    consentTerms && consentPrivacy && consentSensitivePhoto && consentAge;

  const [submitting, setSubmitting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  // Cached ID token for the pagehide handler. Read synchronously on unload —
  // an `await user.getIdToken()` there would lose the chance to fire before
  // the page is gone. Consent sessions are short (<<1h token TTL) so a single
  // mount-time fetch is enough.
  const tokenRef = useRef<string | null>(null);
  // True while the user is in the "pending consent" state and an unload should
  // wipe their account. Flipped to false the moment they commit to Agree or
  // explicitly Cancel — re-enabled on failure of those paths.
  const abandonOnUnloadRef = useRef(true);

  const toggleAllConsent = (next: boolean) => {
    setConsentTerms(next);
    setConsentPrivacy(next);
    setConsentSensitivePhoto(next);
    setConsentAge(next);
  };

  // Bounce unauthenticated or already-consented users out of the gate.
  //   - no auth user → /login (they shouldn't be here)
  //   - hasFullConsent === true → /today (they're done; don't show this page)
  //   - hasFullConsent === null → wait (userDoc still loading)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (hasFullConsent === true) {
      // The user has already consented (e.g., they returned to this page after
      // completing signup elsewhere). Disable the unload abandon so navigation
      // away to /today doesn't wipe a fully-consented account.
      abandonOnUnloadRef.current = false;
      router.replace('/today');
    }
  }, [user, authLoading, hasFullConsent, router]);

  // Cache the current ID token. `getIdToken(false)` returns the cached value
  // when fresh, so this is usually a synchronous resolve.
  useEffect(() => {
    if (!user) {
      tokenRef.current = null;
      return;
    }
    let cancelled = false;
    user
      .getIdToken(false)
      .then((t) => {
        if (!cancelled) tokenRef.current = t;
      })
      .catch(() => {
        /* token refresh failure: unload abandon will silently skip */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Fire-and-forget abandon when the user navigates away without an explicit
  // decision. `fetch` with `keepalive: true` is the modern replacement for
  // sendBeacon when custom headers (Authorization) are required; both Chrome,
  // Firefox, and Safari let the request outlive the document.
  useEffect(() => {
    if (!user) return;
    const onPageHide = (e: PageTransitionEvent) => {
      // `persisted=true` means the page is entering the back-forward cache
      // (Safari/iOS) — the user hasn't truly left, they may scrub back any
      // moment. Wiping the account here would be a false-abandon.
      if (e.persisted) return;
      if (!abandonOnUnloadRef.current) return;
      const token = tokenRef.current;
      if (!token) return;
      try {
        void fetch('/api/account/abandon-signup', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* unload-context errors are unrecoverable; swallow */
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [user]);

  const handleSubmit = async () => {
    if (!user || submitting) return;
    if (!allConsented) return;
    setSubmitting(true);
    // From this moment the user is committing to consent — a tab close mid-
    // request must not also fire an abandon that races our Firestore write.
    abandonOnUnloadRef.current = false;
    try {
      await applyDeferredConsent({
        uid: user.uid,
        consent: {
          termsVersion: LEGAL_TERMS_VERSION,
          privacyVersion: LEGAL_PRIVACY_VERSION,
          sensitivePhotoVersion: LEGAL_SENSITIVE_PHOTO_VERSION,
          ageConfirmed: true,
        },
      });
      // The userDoc snapshot in AuthProvider will flip hasFullConsent → true
      // on the next tick; the effect above then redirects. We still push
      // explicitly so the success path isn't dependent on listener timing.
      router.replace('/today');
    } catch {
      // Submission failed — restore the unload abandon so the user can still
      // exit cleanly without leaving a pending account behind.
      abandonOnUnloadRef.current = true;
      toast.alert(tLogin('errorGeneric'));
      setSubmitting(false);
    }
  };

  const handleAbandon = async () => {
    if (!user || abandoning) return;
    // Native confirm — keeps this MVP screen small and avoids pulling in a
    // dialog component. Replace with a polished modal later if needed.
    const ok =
      typeof window !== 'undefined' ? window.confirm(t('abandonConfirm')) : true;
    if (!ok) return;
    setAbandoning(true);
    abandonOnUnloadRef.current = false;
    try {
      const token = await user.getIdToken(true);
      const res = await fetch('/api/account/abandon-signup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`abandon failed: ${res.status}`);
      try {
        await signOut(auth);
      } catch {
        /* user is already deleted server-side; client signOut is best-effort */
      }
      router.replace('/login');
    } catch {
      abandonOnUnloadRef.current = true;
      toast.alert(t('abandonError'));
      setAbandoning(false);
    }
  };

  // Don't paint any consent UI before we know the user state — prevents a
  // flash of the gate for users who are about to be redirected.
  if (authLoading || !user || hasFullConsent === true) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-bg">
        <span className="text-fg-muted text-sm">…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-end px-5 pt-4">
        <LocaleToggle />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-12">
        <div className="mb-8 flex flex-col gap-2">
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t('title')}
          </h1>
          <p className="text-[14px] text-fg-muted">{t('subtitle')}</p>
        </div>

        <fieldset className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 text-[13px] text-fg">
          <ConsentCheckbox
            checked={allConsented}
            onChange={toggleAllConsent}
            label={tLogin('consent.agreeAll')}
            emphasized
          />
          <div className="h-px bg-[color:var(--color-border)]" />
          <ConsentCheckbox
            checked={consentTerms}
            onChange={setConsentTerms}
            label={tLogin.rich('consent.terms', {
              link: (chunks: ReactNode) => (
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-[color:var(--color-accent)]"
                >
                  {chunks}
                </Link>
              ),
            })}
          />
          <ConsentCheckbox
            checked={consentPrivacy}
            onChange={setConsentPrivacy}
            label={tLogin.rich('consent.privacy', {
              link: (chunks: ReactNode) => (
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-[color:var(--color-accent)]"
                >
                  {chunks}
                </Link>
              ),
            })}
          />
          <ConsentCheckbox
            checked={consentSensitivePhoto}
            onChange={setConsentSensitivePhoto}
            label={tLogin.rich('consent.sensitivePhoto', {
              link: (chunks: ReactNode) => (
                <Link
                  href="/legal/sensitive-photo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-[color:var(--color-accent)]"
                >
                  {chunks}
                </Link>
              ),
            })}
          />
          <ConsentCheckbox
            checked={consentAge}
            onChange={setConsentAge}
            label={tLogin('consent.age14')}
          />
        </fieldset>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allConsented || submitting || abandoning}
          className="mt-5 h-12 rounded-full bg-accent text-[14px] font-semibold text-[color:var(--color-accent-text)] transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t('loading') : t('submit')}
        </button>

        <button
          type="button"
          onClick={handleAbandon}
          disabled={submitting || abandoning}
          className="mt-3 h-11 text-[13px] text-fg-muted underline underline-offset-2 hover:text-fg disabled:opacity-50"
        >
          {abandoning ? t('loading') : t('abandon')}
        </button>
      </main>
    </div>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  label,
  emphasized = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 select-none ${
        emphasized ? 'font-semibold' : 'text-fg-muted'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-[color:var(--color-accent)]"
      />
      <span className="leading-snug">{label}</span>
    </label>
  );
}
