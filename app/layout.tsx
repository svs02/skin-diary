import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { ToastProvider } from '@/lib/toast';
import './globals.css';

// Pretendard Variable — single woff2 covering 100..900 weights.
// Self-hosted under /public/fonts to avoid CDN dependency.
const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
});

/**
 * 메타데이터는 locale별로 다르게 직렬화한다.
 *  - title/description: 마케팅 카피의 단일 소스(`marketing.meta.*`)를 재사용해 카피 드리프트 방지
 *  - openGraph/twitter: SNS 공유 카드. OG 이미지는 1200x630 (`public/og/skin-diary-og.png`)
 *  - metadataBase: 절대 URL 해소 기준. canonical 부재 시 OG/Twitter url 필수
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'marketing.meta' });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://skindiary.net';
  const title = t('title');
  const description = t('description');
  const ogLocale = locale === 'ko' ? 'ko_KR' : 'en_US';
  const ogAlternate = locale === 'ko' ? 'en_US' : 'ko_KR';

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    // manifest 라우트는 app/manifest.ts에서 자동 등록됨 — 명시적으로 link 태그 보장
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    openGraph: {
      type: 'website',
      siteName: 'Skin Diary',
      title,
      description,
      url: siteUrl,
      locale: ogLocale,
      alternateLocale: [ogAlternate],
      images: [
        {
          url: '/og/skin-diary-og.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/skin-diary-og.png'],
    },
  };
}

/**
 * Viewport / theme-color는 App Router에서 별도 export로 분리한다 (Next 14+).
 *  - viewport-fit=cover: iOS 노치 안전영역 사용 가능
 *  - themeColor: PWA 설치 시 상단 바 색상 (manifest의 theme_color와 동일하게 유지)
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#6DBF8A',
};

// Runs before React hydration to set <html data-theme> from localStorage,
// preventing a flash of the wrong theme. Kept tiny and self-contained.
const themeBootScript = `(function(){try{var k='skin-diary:theme';var v=localStorage.getItem(k);if(v==='light'||v==='dark'){document.documentElement.setAttribute('data-theme',v);}else{document.documentElement.removeAttribute('data-theme');}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  // CSP nonce injected by middleware (see /middleware.ts).
  // Empty fallback only triggers if middleware is bypassed (e.g. tests).
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html
      lang={locale}
      className={`${pretendard.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
