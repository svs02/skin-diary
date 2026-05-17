import type { User } from '@/types';

/**
 * Consent-state predicates for the User profile document.
 *
 * The user doc has four consent dimensions (see `types/index.ts`):
 *   1. termsVersion          (ToS)
 *   2. privacyVersion        (Privacy Policy)
 *   3. sensitivePhotoVersion (Sensitive personal data — facial photos)
 *   4. ageConfirmed          (Age confirmation)
 *
 * Any field that is `null` means the user has NOT consented to that dimension
 * yet — either a legacy user, or a Google first-sign-in that bypassed the
 * dedicated consent screen. The app surfaces a follow-up gate to fill these
 * in; until then, sensitive operations (e.g. photo upload, signed-URL read)
 * must be blocked.
 *
 * These helpers are the single source of truth for "is this user fully
 * consented?" — both UI gates and server gates should call them so behaviour
 * stays in lock-step.
 */
export function hasFullUserConsent(user: User | null | undefined): boolean {
  return (
    user != null &&
    user.termsVersion !== null &&
    user.privacyVersion !== null &&
    user.sensitivePhotoVersion !== null &&
    user.ageConfirmed === true
  );
}
