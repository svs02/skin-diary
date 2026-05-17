/**
 * Legal document versions captured at sign-up time.
 *
 * These strings are written verbatim into the user's Firestore doc as
 * `termsVersion` / `privacyVersion` and are enforced as `YYYY-MM-DD` by the
 * Firestore security rules. They must stay in lock-step with the
 * `legal.{terms,privacy}.lastUpdated` strings in `messages/{ko,en}.json` —
 * bump both whenever the user-facing body text changes materially.
 */
export const LEGAL_TERMS_VERSION = '2026-05-09';
export const LEGAL_PRIVACY_VERSION = '2026-05-15';
export const LEGAL_SENSITIVE_PHOTO_VERSION = '2026-05-15';
