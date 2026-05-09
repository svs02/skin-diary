'use client';

import { useTranslations } from 'next-intl';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { LocaleToggle } from '@/components/LocaleToggle';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      <h1 className="text-[20px] font-semibold">{t('title')}</h1>

      <section className="rounded-[18px] bg-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold">{t('language.title')}</h2>
            <p className="mt-1 text-[12px] text-fg-muted">
              {t('language.description')}
            </p>
          </div>
          <LocaleToggle />
        </div>
      </section>

      <section className="rounded-[18px] bg-surface p-5 shadow-sm">
        <h2 className="text-[14px] font-semibold">{t('account.title')}</h2>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-3 text-[14px] font-medium text-fg-muted hover:text-fg"
        >
          {t('account.signOut')}
        </button>
      </section>
    </div>
  );
}
