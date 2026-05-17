'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type AuthError,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ensureUserDoc, type ConsentInput } from '@/lib/auth/ensureUserDoc';
import {
  LEGAL_PRIVACY_VERSION,
  LEGAL_SENSITIVE_PHOTO_VERSION,
  LEGAL_TERMS_VERSION,
} from '@/lib/legal/versions';
import { LocaleToggle } from '@/components/LocaleToggle';
import type { Provider } from '@/types';

type Mode = 'signIn' | 'signUp';

function isAuthError(err: unknown): err is AuthError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const { user, loading: authLoading, hasFullConsent } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Consent state — only relevant in `signUp` mode. We track each box
  // individually so the "agree to all" master toggle can flip them in lockstep
  // without losing the per-item state on partial selection.
  //
  // The four boxes correspond 1:1 to the four consent dimensions persisted on
  // the user doc (see types/index.ts):
  //   - consentTerms          → termsVersion
  //   - consentPrivacy        → privacyVersion
  //   - consentSensitivePhoto → sensitivePhotoVersion
  //   - consentAge            → ageConfirmed
  // The sensitive-photo opt-in is KR PIPA-mandated (biometric-adjacent data),
  // so it lives as a separate checkbox even though the user-facing copy looks
  // similar to the privacy policy box.
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentSensitivePhoto, setConsentSensitivePhoto] = useState(false);
  const [consentAge, setConsentAge] = useState(false);
  const allConsented =
    consentTerms && consentPrivacy && consentSensitivePhoto && consentAge;

  const toggleAllConsent = (next: boolean) => {
    setConsentTerms(next);
    setConsentPrivacy(next);
    setConsentSensitivePhoto(next);
    setConsentAge(next);
  };

  // Auto-bounce a session that lands on /login. We branch on consent state:
  //   - hasFullConsent === true  → in-app (`/today`)
  //   - hasFullConsent === false → consent gate (`/signup/consent`)
  //   - hasFullConsent === null  → wait (userDoc still loading / not yet
  //     created); the listener will fire again once the snapshot resolves.
  useEffect(() => {
    if (authLoading || !user) return;
    if (hasFullConsent === true) router.replace('/today');
    else if (hasFullConsent === false) router.replace('/signup/consent');
  }, [user, authLoading, hasFullConsent, router]);

  const onSuccess = async (provider: Provider, consent?: ConsentInput) => {
    const current = auth.currentUser;
    if (!current) return;
    await ensureUserDoc({
      uid: current.uid,
      email: current.email,
      provider,
      consent,
    });
    // Routing is intentionally handled by the auth-state useEffect above,
    // not here. That effect reads the real-time userDoc snapshot, so it
    // correctly branches between /today (full consent) and /signup/consent
    // (deferred — e.g. Google first sign-in). Doing the redirect inline
    // here would race the userDoc subscription.
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      await onSuccess('google');
    } catch (err) {
      if (isAuthError(err) && err.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return;
        } catch {
          setError(t('errorGeneric'));
        }
      } else if (isAuthError(err) && err.code === 'auth/popup-closed-by-user') {
        // 사용자가 닫음 → 무시
      } else {
        setError(t('errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Defensive guard: the submit button is also disabled when not all consent
    // checkboxes are ticked, but a user could submit via Enter on an input.
    if (mode === 'signUp' && !allConsented) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmailAndPassword(auth, email, password);
        await onSuccess('password');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        await onSuccess('password', {
          termsVersion: LEGAL_TERMS_VERSION,
          privacyVersion: LEGAL_PRIVACY_VERSION,
          sensitivePhotoVersion: LEGAL_SENSITIVE_PHOTO_VERSION,
          ageConfirmed: true,
        });
      }
    } catch (err) {
      if (isAuthError(err)) {
        switch (err.code) {
          case 'auth/invalid-credential':
          case 'auth/wrong-password':
          case 'auth/user-not-found':
            setError(t('errorInvalidCredentials'));
            break;
          case 'auth/email-already-in-use':
            setError(t('errorEmailInUse'));
            break;
          default:
            setError(t('errorGeneric'));
        }
      } else {
        setError(t('errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-end px-5 pt-4">
        <LocaleToggle />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-12">
        <div className="mb-10 flex flex-col gap-2">
          <h1
            className="text-[28px] font-bold leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t('title')}
          </h1>
          <p className="text-[14px] text-fg-muted">{t('subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--color-border)] bg-surface text-[14px] font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          <GoogleIcon />
          {t('googleButton')}
        </button>

        <div className="my-6 flex items-center gap-3 text-[12px] text-fg-subtle">
          <span className="h-px flex-1 bg-[color:var(--color-border)]" />
          {t('or')}
          <span className="h-px flex-1 bg-[color:var(--color-border)]" />
        </div>

        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] text-fg-muted">
            {t('emailLabel')}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl bg-surface-2 px-3 text-[14px] text-fg outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] text-fg-muted">
            {t('passwordLabel')}
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl bg-surface-2 px-3 text-[14px] text-fg outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            />
          </label>

          {error && (
            <p className="text-[12px] text-[#D04A4A]" role="alert">
              {error}
            </p>
          )}

          {mode === 'signUp' && (
            <fieldset className="mt-1 flex flex-col gap-2 rounded-xl bg-surface-2 p-3 text-[13px] text-fg">
              <ConsentCheckbox
                checked={allConsented}
                onChange={toggleAllConsent}
                label={t('consent.agreeAll')}
                emphasized
              />
              <div className="h-px bg-[color:var(--color-border)]" />
              <ConsentCheckbox
                checked={consentTerms}
                onChange={setConsentTerms}
                label={t.rich('consent.terms', {
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
                label={t.rich('consent.privacy', {
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
                label={t.rich('consent.sensitivePhoto', {
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
                label={t('consent.age14')}
              />
            </fieldset>
          )}

          <button
            type="submit"
            disabled={submitting || (mode === 'signUp' && !allConsented)}
            className="mt-2 h-12 rounded-full bg-accent text-[14px] font-semibold text-[color:var(--color-accent-text)] transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {mode === 'signIn' ? t('signInButton') : t('signUpButton')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
            setError(null);
            // Reset consent on mode toggle: stale checks from a previous
            // sign-up attempt shouldn't carry forward (could mislead the user
            // into thinking they've already agreed).
            toggleAllConsent(false);
          }}
          className="mt-5 text-center text-[12px] text-fg-muted hover:text-fg"
        >
          {mode === 'signIn' ? t('toggleToSignUp') : t('toggleToSignIn')}
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.55c2.08-1.92 3.29-4.74 3.29-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.76c-.99.66-2.25 1.06-3.73 1.06-2.87 0-5.3-1.94-6.17-4.55H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.83 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.65-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.46 2.13 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.65 2.84C6.7 7.32 9.13 5.38 12 5.38Z"
      />
    </svg>
  );
}
