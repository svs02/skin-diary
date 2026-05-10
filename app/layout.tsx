import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://skindiary.net'),
  title: 'Skin Diary',
  description: 'Track your skin, one day at a time.',
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
};

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
