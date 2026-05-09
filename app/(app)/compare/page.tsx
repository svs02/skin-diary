'use client';

import { useTranslations } from 'next-intl';

export default function ComparePage() {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-2 pt-4">
      <h1 className="text-[20px] font-semibold">{t('tabs.compare')}</h1>
      <p className="text-sm text-fg-muted">{t('placeholder.comingSoon')}</p>
    </div>
  );
}
