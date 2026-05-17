import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { recordPhotoAudit } from '@/lib/audit/client';
import { isFuture, isValidDateKey } from '@/lib/utils/dateKey';
import { getSignedURL, invalidateSignedURL } from './signedUrl';
import type { Angle } from '@/types';

// DESIGN.md §2.3: Storage Rules의 500KB 한계와 동일.
// 정규화된 1024×1024 JPG(0.82)는 보통 200~400KB에 들어오므로, 초과는 예외 상황.
const MAX_BLOB_SIZE = 500 * 1024;

export class PhotoUploadError extends Error {
  constructor(
    public code: 'invalid-date' | 'future-date' | 'too-large' | 'storage',
    message: string,
  ) {
    super(message);
    this.name = 'PhotoUploadError';
  }
}

function anglePath(uid: string, dateKey: string, angle: Angle): string {
  // CLAUDE.md §2.1 — /{uid}/{yyyy-mm-dd}/{angle}.jpg
  return `${uid}/${dateKey}/${angle}.jpg`;
}

/**
 * 정규화된 JPG Blob을 Firebase Storage에 업로드하고 downloadURL을 돌려준다.
 * 가드:
 *  - dateKey 형식 검증 (Storage Rules와 동일 규약)
 *  - 미래 날짜 차단 (CLAUDE.md §5.5; Rules는 형식만 검증하므로 클라가 책임)
 *  - 500KB 상한 (Rules의 후위 가드와 일치, 실패 시 명확한 에러 노출)
 *
 * TODO(Spec §4.3.c, retry-pending toast):
 *  실패 시 자동 재시도 큐를 도입할 때, 호출부에서 다음 형태로 토스트를 운용한다.
 *    const toast = useToast();
 *    const id = toast.retryPending(t('record.photos.toast.failed'));
 *    try { await uploadAnglePhoto(...); toast.dismiss(id); toast.success(...); }
 *    catch { /* keep retry-pending until queue exhausted, then dismiss + alert *\/ }
 *  본 함수 자체는 토스트와 비결합 — 호출부(CaptureShell, PhotoCapture)에서 처리한다.
 */
export async function uploadAnglePhoto(
  uid: string,
  dateKey: string,
  angle: Angle,
  blob: Blob,
): Promise<string> {
  if (!isValidDateKey(dateKey)) {
    throw new PhotoUploadError('invalid-date', `Invalid dateKey: ${dateKey}`);
  }
  if (isFuture(dateKey)) {
    throw new PhotoUploadError('future-date', `Future dateKey not allowed: ${dateKey}`);
  }
  if (blob.size >= MAX_BLOB_SIZE) {
    throw new PhotoUploadError(
      'too-large',
      `Blob ${blob.size}B exceeds ${MAX_BLOB_SIZE}B limit`,
    );
  }

  const objectRef = ref(storage, anglePath(uid, dateKey, angle));
  try {
    await uploadBytes(objectRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public,max-age=31536000,immutable',
    });
    // 업로드 직후 stale 캐시 제거 후 새 Signed URL 발급.
    // (캐시에는 보통 미스 상태이지만, 덮어쓰기 시 stale entry가 남아있을 수 있어 방어적 invalidate)
    invalidateSignedURL(dateKey, angle);
    // 감사 기록 — fire-and-forget. 실패가 업로드 성공 흐름을 막지 않도록 await하지 않는다.
    // (getSignedURL은 audit와 무관하게 진행)
    void recordPhotoAudit('photo.upload', dateKey, angle);
    return await getSignedURL(dateKey, angle);
  } catch (err) {
    throw new PhotoUploadError(
      'storage',
      err instanceof Error ? err.message : 'Storage upload failed',
    );
  }
}

/**
 * 이미 업로드된 angle 사진의 read URL 조회. 슬롯 mount 시 썸네일 표시용.
 *
 * 내부적으로 서버 발급 Signed URL을 사용하므로 객체 존재 여부는 200 OK로 응답된다.
 * 객체 누락 판정은 호출부의 <img onError> 콜백에서 수행한다.
 *
 * uid 파라미터는 시그니처 호환을 위해 유지하나, 서버가 ID 토큰에서 uid를 추출하므로
 * 내부에서는 사용하지 않는다.
 */
export async function getAngleDownloadURL(
  _uid: string,
  dateKey: string,
  angle: Angle,
): Promise<string> {
  return getSignedURL(dateKey, angle);
}

/**
 * 업로드된 angle 사진을 삭제한다 (Spec §3 메뉴의 "삭제" 액션).
 * 가드:
 *  - dateKey 형식 검증 (Storage Rules와 동일 규약)
 *  - 미래 날짜 차단 (객체는 존재할 수 없으나 일관성 + 클라 실수 방지)
 * 멱등 보장: 객체가 이미 없는 경우(`storage/object-not-found`)는 silent ignore —
 * optimistic delete + retry 흐름에서 안전.
 */
export async function deleteAnglePhoto(
  uid: string,
  dateKey: string,
  angle: Angle,
): Promise<void> {
  if (!isValidDateKey(dateKey)) {
    throw new PhotoUploadError('invalid-date', `Invalid dateKey: ${dateKey}`);
  }
  if (isFuture(dateKey)) {
    throw new PhotoUploadError('future-date', `Future dateKey not allowed: ${dateKey}`);
  }

  const objectRef = ref(storage, anglePath(uid, dateKey, angle));
  try {
    await deleteObject(objectRef);
    // 삭제 후 stale Signed URL이 1시간 동안 유효하므로 캐시는 즉시 제거.
    // (서버가 발급한 URL 자체는 GCS에서 만료되기 전까지 살아있으나, 클라이언트가 재요청해도
    //  객체가 없으면 404가 반환되므로 다음 fetch에서 자연스럽게 빈 슬롯으로 처리된다.)
    invalidateSignedURL(dateKey, angle);
    // 감사 기록 — fire-and-forget.
    void recordPhotoAudit('photo.delete', dateKey, angle);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'storage/object-not-found') {
      invalidateSignedURL(dateKey, angle);
      // 멱등 케이스도 사용자가 "삭제" 의도를 발동한 것이므로 감사에 남긴다.
      void recordPhotoAudit('photo.delete', dateKey, angle);
      return; // 멱등: 이미 삭제됨
    }
    throw new PhotoUploadError(
      'storage',
      err instanceof Error ? err.message : 'Storage delete failed',
    );
  }
}
