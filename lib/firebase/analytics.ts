import {
  getAnalytics,
  isSupported,
  logEvent as firebaseLogEvent,
  type Analytics,
} from 'firebase/analytics';
import { app, hasAnalyticsConfig } from './client';

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

/**
 * 브라우저 한 번만 Analytics를 초기화한다. SSR/미지원 환경/measurementId 미설정 시 null.
 */
export async function getAnalyticsClient(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (!hasAnalyticsConfig) return null;
  if (analyticsInstance) return analyticsInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const supported = await isSupported();
    if (!supported) return null;
    analyticsInstance = getAnalytics(app);
    return analyticsInstance;
  })();

  return initPromise;
}

export async function logAnalyticsEvent(
  eventName: string,
  params?: Record<string, unknown>,
): Promise<void> {
  const a = await getAnalyticsClient();
  if (!a) return;
  firebaseLogEvent(a, eventName, params);
}
