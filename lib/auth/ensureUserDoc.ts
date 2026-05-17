import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Provider } from '@/types';

/**
 * Consent payload captured at sign-up time.
 *
 * - `termsVersion` / `privacyVersion` / `sensitivePhotoVersion`: opaque version
 *   strings (e.g. "2026-05-09"). Stored verbatim so future legal updates can
 *   detect which users still need to re-consent.
 * - `sensitivePhotoVersion`: sensitive personal data (facial photo) consent.
 *   Distinct from generic Privacy Policy under KR PIPA — photos are biometric-
 *   adjacent and require an explicit opt-in.
 * - `ageConfirmed`: must always be the literal `true`. We model this with the
 *   `true` literal type so callers cannot pass `false` by accident.
 * - Agreement timestamps are intentionally NOT part of this object — the server
 *   stamps them via `serverTimestamp()` to prevent a hostile client from
 *   back-dating consent.
 */
export interface ConsentInput {
  termsVersion: string;
  privacyVersion: string;
  sensitivePhotoVersion: string;
  ageConfirmed: true;
}

interface EnsureUserDocInput {
  uid: string;
  email: string | null;
  provider: Provider;
  consent?: ConsentInput;
}

export async function ensureUserDoc({
  uid,
  email,
  provider,
  consent,
}: EnsureUserDocInput): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  // Existing users keep whatever consent state they already have. Consent
  // updates (e.g. re-agreeing to a new ToS version) go through a separate
  // dedicated flow, not through ensureUserDoc.
  if (snap.exists()) return;

  // Build consent fields. When `consent` is omitted (e.g. Google first sign-in
  // that bypasses the dedicated consent screen), we explicitly write `null` so
  // the doc shape stays uniform and downstream queries don't have to guard
  // `undefined`. The frontend is responsible for surfacing a follow-up consent
  // prompt for these users.
  const consentFields = consent
    ? {
        termsVersion: consent.termsVersion,
        privacyVersion: consent.privacyVersion,
        sensitivePhotoVersion: consent.sensitivePhotoVersion,
        ageConfirmed: consent.ageConfirmed,
        termsAgreedAt: serverTimestamp(),
        privacyAgreedAt: serverTimestamp(),
        sensitivePhotoAgreedAt: serverTimestamp(),
      }
    : {
        termsVersion: null,
        privacyVersion: null,
        sensitivePhotoVersion: null,
        ageConfirmed: null,
        termsAgreedAt: null,
        privacyAgreedAt: null,
        sensitivePhotoAgreedAt: null,
      };

  await setDoc(ref, {
    uid,
    email: email ?? '',
    provider,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...consentFields,
  });
}

/**
 * Promote a deferred-consent user doc to full-consent.
 *
 * Use only after the user has been through the dedicated post-OAuth consent
 * gate (`/signup/consent`). The Firestore Rules permit the deferred→full
 * transition exactly once — once any consent field is non-null, the entire
 * group becomes immutable.
 *
 * `agreedAt` fields are stamped with `serverTimestamp()` so a hostile client
 * cannot back-date consent. Versions are passed in as opaque strings (we don't
 * defend against a client lying about which version it agreed to here — the
 * rules pin the YYYY-MM-DD shape, and any abuse is auditable).
 */
export async function applyDeferredConsent({
  uid,
  consent,
}: {
  uid: string;
  consent: ConsentInput;
}): Promise<void> {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    termsVersion: consent.termsVersion,
    privacyVersion: consent.privacyVersion,
    sensitivePhotoVersion: consent.sensitivePhotoVersion,
    ageConfirmed: consent.ageConfirmed,
    termsAgreedAt: serverTimestamp(),
    privacyAgreedAt: serverTimestamp(),
    sensitivePhotoAgreedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
