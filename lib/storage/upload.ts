import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';
import { isFuture, isValidDateKey } from '@/lib/utils/dateKey';
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
    return await getDownloadURL(objectRef);
  } catch (err) {
    throw new PhotoUploadError(
      'storage',
      err instanceof Error ? err.message : 'Storage upload failed',
    );
  }
}

/**
 * 이미 업로드된 angle 사진의 downloadURL 조회. 슬롯 mount 시 썸네일 표시용.
 * 객체가 없으면 storage/object-not-found 에러가 던져진다 — 호출부에서 분기.
 */
export async function getAngleDownloadURL(
  uid: string,
  dateKey: string,
  angle: Angle,
): Promise<string> {
  return getDownloadURL(ref(storage, anglePath(uid, dateKey, angle)));
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
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'storage/object-not-found') {
      return; // 멱등: 이미 삭제됨
    }
    throw new PhotoUploadError(
      'storage',
      err instanceof Error ? err.message : 'Storage delete failed',
    );
  }
}
