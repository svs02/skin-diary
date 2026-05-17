import { auth } from '@/lib/firebase/client';
import type { Angle } from '@/types';

/**
 * 클라이언트측 감사(audit) 로그 트리거 — fire-and-forget.
 *
 * 배경:
 *  - 사진 업로드/삭제는 Firebase Storage 클라이언트 SDK로 직접 수행되므로
 *    서버 endpoint를 거치지 않는다. 그러나 audit 컬렉션 write는 보안 룰에서
 *    클라이언트에게 막혀있다(Admin SDK 전용). 이를 우회하지 않으면서 사진
 *    이벤트를 기록하려면, 클라이언트가 별도 인증 endpoint를 호출해 서버가
 *    대신 audit를 기록하게 해야 한다.
 *  - 본 헬퍼는 `POST /api/audit/photo`를 호출한다. 토큰 검증 + 화이트리스트된
 *    event만 허용.
 *
 * 정책:
 *  - **fire-and-forget**: 호출자는 await할 필요 없고 실패해도 사용자 경험이
 *    영향받지 않는다. 본 모듈 내부에서 catch로 흡수하고 console.warn만 남긴다.
 *  - 토큰 미존재 시 조용히 패스 (로그아웃 race 상황). 토큰 갱신 재시도는 하지
 *    않는다 — 감사 기록은 best-effort이고 정확성보다 비차단이 우선.
 */

const ENDPOINT = '/api/audit/photo';

export type PhotoAuditEvent = 'photo.upload' | 'photo.delete';

/**
 * 사진 업로드/삭제 감사 이벤트를 서버에 통보한다.
 *
 * 호출 후 await는 선택 — 본 함수는 절대 reject하지 않는다 (내부에서 catch).
 * 페이지 언로드와 race 가능성에 대비해 keepalive 옵션을 사용한다.
 */
export async function recordPhotoAudit(
  event: PhotoAuditEvent,
  date: string,
  angle: Angle,
): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) {
      // 로그아웃 직후 race 등. 조용히 패스.
      return;
    }
    const token = await user.getIdToken();
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event, date, angle }),
      // 사진 업로드 직후 페이지 전환이 있는 흐름에서도 요청이 완주하도록.
      keepalive: true,
      cache: 'no-store',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 감사 실패는 UX에 영향 없음. 콘솔 경고만.
    console.warn(`[audit/client] photo audit failed: ${message}`);
  }
}
