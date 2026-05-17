export type Provider = 'google' | 'password';

export type Angle = 'front' | 'left' | 'right';

export interface User {
  uid: string;
  email: string;
  provider: Provider;
  createdAt: Date;
  updatedAt: Date;
  // Consent fields — populated at sign-up. `null` for legacy users or for
  // sign-in flows that bypass the consent screen (e.g. Google first-time
  // sign-in); the app surfaces a follow-up prompt to fill these in.
  //
  // Four consent dimensions:
  //   - termsVersion / termsAgreedAt          — Terms of Service
  //   - privacyVersion / privacyAgreedAt      — Privacy Policy
  //   - sensitivePhotoVersion /
  //     sensitivePhotoAgreedAt                — Sensitive personal data
  //                                              (facial photos) consent
  //   - ageConfirmed                          — Age confirmation flag
  termsVersion: string | null;
  privacyVersion: string | null;
  sensitivePhotoVersion: string | null;
  ageConfirmed: true | null;
  termsAgreedAt: Date | null;
  privacyAgreedAt: Date | null;
  sensitivePhotoAgreedAt: Date | null;
}

export interface DailyRecord {
  date: string;
  photos: Record<Angle, boolean>;
  water: number;
  food: string;
  cosmetic: string;
  exercise: boolean;
  memo: string;
  isDraft?: boolean;
  lifestyleSavedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
