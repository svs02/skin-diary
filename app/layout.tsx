import type { Metadata } from 'next';
import { DM_Sans, Noto_Sans_KR } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { AnalyticsBootstrapper } from '@/components/AnalyticsBootstrapper';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

const notoSansKr = Noto_Sans_KR({
  variable: '--font-noto-sans-kr',
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'Skin Diary',
  description: 'Track your skin, one day at a time.',
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

  return (
    <html
      lang={locale}
      className={`${dmSans.variable} ${notoSansKr.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <AnalyticsBootstrapper />
            {children}
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
