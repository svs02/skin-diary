'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  signOut,
  type AuthError,
  type User as FirebaseUser,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { useToast } from '@/lib/toast';

/**
 * 계정 삭제 다이얼로그 — 2단계 흐름.
 *
 *   Step 1 (confirm): "DELETE" 타이핑 + 경고 노출 → [계속]
 *   Step 2 (reauth):  Email/PW는 비밀번호 재입력, Google은 popup(폴백 redirect)
 *                     성공 시 ID Token 새로 발급 → POST /api/account/delete
 *
 * API 응답 분기:
 *   200       → signOut + /login 라우팅 + success toast
 *   401(REAUTH_REQUIRED) → step을 reauth로 되돌리고 에러 노출
 *   그 외      → alert toast + 모달 유지
 *
 * 디자인:
 *   - PhotoMenuSheet 패턴(backdrop + bottom sheet on mobile, centered card on md+) 차용.
 *   - "삭제" 액션이지만 다크 패턴 회피: 빨간 배경 금지, 토큰 그대로 사용.
 *     경고문 텍스트와 "DELETE" 타이핑 강제로 의도성 보장.
 */

type Step = 'confirm' | 'reauth';

interface Props {
  open: boolean;
  user: FirebaseUser;
  onClose: () => void;
}

const CONFIRM_PHRASE = 'DELETE';

function isAuthError(err: unknown): err is AuthError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function detectProvider(user: FirebaseUser): 'google' | 'password' | 'unknown' {
  for (const p of user.providerData) {
    if (p.providerId === 'google.com') return 'google';
    if (p.providerId === 'password') return 'password';
  }
  return 'unknown';
}

export function DeleteAccountDialog({ open, user, onClose }: Props) {
  const t = useTranslations('settings.data.delete');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const toast = useToast();

  const titleId = useId();
  const descId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const googleButtonRef = useRef<HTMLButtonElement>(null);

  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const [step, setStep] = useState<Step>('confirm');
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = detectProvider(user);

  const close = useCallback(() => {
    if (submitting) return; // 진행 중에는 dismiss 차단 (토큰 발급 후 API 호출 도중)
    onClose();
  }, [onClose, submitting]);

  // ---- mount/unmount + slide-in animation ----
  useEffect(() => {
    if (open) {
      setMounted(true);
      // open 시점에 상태 초기화 — 이전 시도의 입력/에러를 누적시키지 않는다.
      setStep('confirm');
      setConfirmText('');
      setPassword('');
      setError(null);
      const id = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(id);
    }
    setAnimateIn(false);
    const id = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(id);
  }, [open]);

  // ---- body scroll lock ----
  useEffect(() => {
    if (!mounted) return;
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // ---- focus initial input on each step ----
  useEffect(() => {
    if (!open) return;
    if (step === 'confirm') {
      firstInputRef.current?.focus();
    } else if (provider === 'password') {
      passwordRef.current?.focus();
    } else {
      googleButtonRef.current?.focus();
    }
  }, [open, step, provider]);

  // ---- Esc closes ----
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // ---- focus trap ----
  function onTabKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!mounted) return null;

  // ---- step 1: confirm 진행 ----
  function onContinue() {
    if (confirmText !== CONFIRM_PHRASE) return;
    setError(null);
    setStep('reauth');
  }

  // ---- step 2: reauth + API call ----
  async function callDeleteApi() {
    const current = auth.currentUser;
    if (!current) {
      throw new Error('No current user');
    }
    // 강제 새로고침 — auth_time이 5분 윈도우 안에 들어오도록.
    const token = await current.getIdToken(true);
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }),
    });
    return res;
  }

  async function finalizeSuccess() {
    try {
      await signOut(auth);
    } catch {
      /* ignore — 어차피 백엔드에서 user 삭제됨 */
    }
    toast.success(t('success'));
    router.replace('/login');
  }

  async function handleApiResponse(res: Response) {
    if (res.status === 200) {
      onClose();
      await finalizeSuccess();
      return;
    }
    if (res.status === 401) {
      // REAUTH_REQUIRED 또는 INVALID_TOKEN — 사용자에게 재인증 유도
      setStep('reauth');
      setError(t('reauthError'));
      return;
    }
    // 5xx 또는 기타
    toast.alert(t('error'));
  }

  async function handleEmailReauth(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!user.email) {
        setError(t('reauthError'));
        return;
      }
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      const res = await callDeleteApi();
      await handleApiResponse(res);
    } catch (err) {
      if (
        isAuthError(err) &&
        (err.code === 'auth/wrong-password' ||
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/user-mismatch')
      ) {
        setError(t('reauthError'));
      } else if (isAuthError(err) && err.code === 'auth/too-many-requests') {
        setError(t('reauthError'));
      } else {
        toast.alert(t('error'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleReauth() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      try {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      } catch (err) {
        if (isAuthError(err) && err.code === 'auth/popup-blocked') {
          // redirect 폴백 — 이 경우 콜백 후 페이지 reload되며 흐름 재진입 필요.
          // MVP에서는 사용자가 다시 시도하도록 안내.
          await reauthenticateWithRedirect(user, new GoogleAuthProvider());
          return;
        }
        if (isAuthError(err) && err.code === 'auth/popup-closed-by-user') {
          return; // 사용자가 닫음 — 조용히 종료
        }
        throw err;
      }
      const res = await callDeleteApi();
      await handleApiResponse(res);
    } catch (err) {
      if (
        isAuthError(err) &&
        (err.code === 'auth/user-mismatch' || err.code === 'auth/credential-already-in-use')
      ) {
        setError(t('reauthError'));
      } else {
        toast.alert(t('error'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50"
      onKeyDown={onTabKey}
    >
      <button
        type="button"
        aria-label={t('cancel')}
        onClick={close}
        disabled={submitting}
        className={`absolute inset-0 transition-opacity duration-200 ease-out ${
          animateIn ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'rgba(0,0,0,0.32)' }}
      />

      <div
        ref={sheetRef}
        className={[
          'absolute left-0 right-0 bottom-0 mx-auto bg-surface',
          'rounded-t-[var(--radius-lg)] shadow-[var(--shadow-raised)]',
          'md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          'md:w-[400px] md:max-w-[calc(100vw-32px)] md:rounded-[var(--radius-lg)]',
          'transition-transform duration-200 ease-out',
        ].join(' ')}
        style={{
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        }}
      >
        <div className="flex h-7 items-center justify-center md:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-fg-subtle/30" />
        </div>

        {step === 'confirm' ? (
          <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
            <h2 id={titleId} className="text-[16px] font-semibold text-fg">
              {t('confirmTitle')}
            </h2>
            <p id={descId} className="text-[13px] leading-relaxed text-fg-muted">
              {t('confirmDescription')}
            </p>
            <input
              ref={firstInputRef}
              type="text"
              autoComplete="off"
              inputMode="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t('typeToConfirm')}
              aria-label={t('typeToConfirm')}
              className="h-11 rounded-xl bg-surface-2 px-3 text-[14px] text-fg outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                className="h-11 rounded-full px-4 text-[14px] font-medium text-fg-muted hover:text-fg"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={onContinue}
                disabled={confirmText !== CONFIRM_PHRASE}
                className="h-11 rounded-full bg-accent px-5 text-[14px] font-semibold text-[color:var(--color-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {t('continue')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
            <h2 id={titleId} className="text-[16px] font-semibold text-fg">
              {t('reauthTitle')}
            </h2>
            {provider === 'password' && (
              <form onSubmit={handleEmailReauth} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-[12px] text-fg-muted">
                  {t('reauthPasswordLabel')}
                  <input
                    ref={passwordRef}
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl bg-surface-2 px-3 text-[14px] text-fg outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                  />
                </label>
                {error && (
                  <p className="text-[12px] text-[color:var(--color-camera-check-warn)]" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="h-11 rounded-full px-4 text-[14px] font-medium text-fg-muted hover:text-fg disabled:opacity-50"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || password.length === 0}
                    className="h-11 rounded-full bg-accent px-5 text-[14px] font-semibold text-[color:var(--color-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {submitting ? tCommon('saving') : t('continue')}
                  </button>
                </div>
              </form>
            )}
            {provider === 'google' && (
              <div className="flex flex-col gap-3">
                {error && (
                  <p className="text-[12px] text-[color:var(--color-camera-check-warn)]" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="h-11 rounded-full px-4 text-[14px] font-medium text-fg-muted hover:text-fg disabled:opacity-50"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    ref={googleButtonRef}
                    type="button"
                    onClick={handleGoogleReauth}
                    disabled={submitting}
                    className="h-11 rounded-full bg-accent px-5 text-[14px] font-semibold text-[color:var(--color-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? tCommon('saving') : t('reauthGoogle')}
                  </button>
                </div>
              </div>
            )}
            {provider === 'unknown' && (
              <p className="text-[13px] text-[color:var(--color-camera-check-warn)]" role="alert">
                {t('reauthError')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
