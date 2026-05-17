import type { MetadataRoute } from 'next';

/**
 * PWA web app manifest.
 *  - 색상 토큰은 디자인 사양의 라이트 배경/액센트 고정값을 사용한다 (브랜드 일관성).
 *  - 아이콘 자산은 public/ 에 사전 배치되어 있어야 한다.
 *  - lang='ko'는 기본값일 뿐, 실제 페이지 lang은 next-intl이 결정한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Skin Diary',
    short_name: 'Skin Diary',
    // manifest 라우트는 build-time 정적이라 locale 분기 불가 — 한국이 주 타겟이므로 ko 고정
    description: '하루 한 장, 피부를 기록해요. 정면·좌·우 사진과 짧은 메모.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F2F5FA',
    theme_color: '#6DBF8A',
    lang: 'ko',
    dir: 'ltr',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
