'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LocaleToggle } from '@/components/LocaleToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DeleteAccountDialog } from '@/components/settings/DeleteAccountDialog';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const { user } = useAuth();

  const [deleteOpen, setDeleteOpen] = useState(false);

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold">{t('theme.title')}</h2>
            <p className="mt-1 text-[12px] text-fg-muted">
              {t('theme.description')}
            </p>
          </div>
          <ThemeToggle />
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

        <div
          role="separator"
          aria-hidden
          className="my-4 h-px bg-[color:var(--color-border)]"
        />

        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={!user}
          className="text-[13px] font-medium text-[color:var(--color-camera-check-warn)] hover:underline disabled:opacity-50"
        >
          {t('data.delete.button')}
        </button>
      </section>

      {user && (
        <DeleteAccountDialog
          open={deleteOpen}
          user={user}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}
