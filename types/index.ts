export type Provider = 'google' | 'password';

export type Angle = 'front' | 'left' | 'right';

export interface User {
  uid: string;
  email: string;
  provider: Provider;
  createdAt: Date;
  updatedAt: Date;
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
