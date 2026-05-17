import type { MetadataRoute } from 'next';

/**
 * 사이트맵.
 *  - 인증이 필요 없는 공개 페이지만 포함 (마케팅·법무)
 *  - 다국어는 쿠키 기반 (URL prefix 없음) → alternates 생략 (URL이 동일하기 때문)
 *  - lastModified는 빌드 시각으로 두고, 카피 변경 시 자연 갱신
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://skindiary.net';
  const now = new Date();

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];
}
