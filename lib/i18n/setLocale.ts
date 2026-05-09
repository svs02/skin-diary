'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type AppLocale = 'en' | 'ko';

export async function setLocale(locale: AppLocale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
