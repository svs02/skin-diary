'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logAnalyticsEvent } from '@/lib/firebase/analytics';

/**
 * SPA 라우트 변경마다 page_view 이벤트 발사. 첫 마운트 시 Analytics 초기화도 함께 트리거.
 * Analytics 미설정/미지원 환경에선 무동작 (logAnalyticsEvent 내부에서 가드).
 */
export function AnalyticsBootstrapper() {
  const pathname = usePathname();

  useEffect(() => {
    void logAnalyticsEvent('page_view', { page_path: pathname });
  }, [pathname]);

  return null;
}
