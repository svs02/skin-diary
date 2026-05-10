/**
 * 가벼운 User-Agent 분기. denied-permanent 상태에서 OS별 카메라 권한 복구 단계 안내에 사용 (Spec §4.1).
 * 정밀 분기가 아니라 사용자에게 보여줄 카피만 다르게 가져가기 위한 휴리스틱.
 *
 * SSR 안전: window/navigator 미존재 시 'unknown' 반환.
 */
export type Platform = 'ios-safari' | 'android-chrome' | 'desktop' | 'unknown';

export function detectPlatform(uaInput?: string): Platform {
  let ua = uaInput;
  if (typeof ua !== 'string') {
    if (typeof navigator === 'undefined') return 'unknown';
    ua = navigator.userAgent;
  }
  if (!ua) return 'unknown';

  // iPadOS 13+ 는 데스크톱 Safari로 위장하지만 touch + Mac UA. 하지만 권한 복구 단계는 동일하므로 ios-safari로 묶는다.
  const isIOSDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
      ((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1 &&
      /Macintosh/.test(ua));

  if (isIOSDevice) {
    // iOS 의 모든 in-app browser는 Safari 기반(WKWebView). 카메라 권한 경로도 동일.
    return 'ios-safari';
  }

  if (/Android/.test(ua)) {
    // Android 의 비 Chrome 브라우저(Samsung, Edge 등)도 Chromium 기반이며 권한 UI 동일.
    return 'android-chrome';
  }

  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) {
    return 'desktop';
  }

  return 'unknown';
}
