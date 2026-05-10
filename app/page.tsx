import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MarketingPage } from './_marketing/MarketingPage';
import { AuthRedirect } from './_marketing/AuthRedirect';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'marketing.meta' });
  const title = t('title');
  const description = t('description');
  const ogLocale = locale === 'ko' ? 'ko_KR' : 'en_US';
  const altLocale = locale === 'ko' ? ['en_US'] : ['ko_KR'];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: ogLocale,
      alternateLocale: altLocale,
      images: [
        {
          url: '/og/skin-diary-og.png',
          width: 1200,
          height: 630,
          alt: 'Skin Diary',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/skin-diary-og.png'],
    },
    alternates: { canonical: '/' },
    robots: { index: true, follow: true },
  };
}

export default function RootPage() {
  return (
    <>
      <AuthRedirect />
      <MarketingPage />
    </>
  );
}
