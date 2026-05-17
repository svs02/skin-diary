import type { MetadataRoute } from 'next';

/**
 * 크롤러 규칙.
 *  - allow: 마케팅(루트), 약관/개인정보처리방침 (공개 페이지)
 *  - disallow: 인증 필요 라우트(`app/(app)/*`), 로그인(인덱싱 가치 없음), 모든 API
 *  - sitemap: 절대 URL 명시 (크롤러는 robots.txt와 다른 도메인일 수 있음)
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://skindiary.net';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: [
          '/login',
          '/today',
          '/calendar',
          '/compare',
          '/overview',
          '/record',
          '/settings',
          '/api/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
