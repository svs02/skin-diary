'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { normalizeToSquareJpeg } from '@/lib/image/normalize';
import {
  PhotoUploadError,
  getAngleDownloadURL,
  uploadAnglePhoto,
} from '@/lib/storage/upload';
import { markPhotoUploaded } from '@/lib/firebase/dailyRecord';
import type { Angle } from '@/types';
import { PhotoSlot, type SlotState } from './PhotoSlot';

const ANGLES: Angle[] = ['front', 'left', 'right'];

type ErrorKey = 'tooLarge' | 'unsupported' | 'upload';
type Transient = { state: 'uploading' } | { state: 'error'; errorKey: ErrorKey };

/**
 * 3슬롯 사진 입력 + 업로드 오케스트레이터.
 * 부모는 dateKey 변경 시 `key={dateKey}`로 remount 시킬 것 (URL 캐시 초기화 의도).
 */
export function PhotoCapture({
  uid,
  dateKey,
  photos,
  onUploaded,
}: {
  uid: string;
  dateKey: string;
  photos: Record<Angle, boolean>;
  onUploaded: (angle: Angle) => void;
}) {
  const tErr = useTranslations('record.photos.error');
  const [imageUrls, setImageUrls] = useState<Partial<Record<Angle, string>>>({});
  const [transient, setTransient] = useState<Partial<Record<Angle, Transient>>>({});
  const lastFileRef = useRef<Partial<Record<Angle, File>>>({});
  // 진행 중인 URL 요청을 추적. 결과가 cancel/실패해도 항상 해제해서 다음 effect run에서 재시도 가능하게 한다.
  const inflightRef = useRef<Set<Angle>>(new Set());

  useEffect(() => {
    let cancelled = false;
    for (const angle of ANGLES) {
      if (!photos[angle]) continue;
      if (imageUrls[angle]) continue; // 이미 URL 보유
      if (inflightRef.current.has(angle)) continue;
      inflightRef.current.add(angle);
      getAngleDownloadURL(uid, dateKey, angle)
        .then((url) => {
          inflightRef.current.delete(angle);
          if (cancelled) return;
          setImageUrls((p) => ({ ...p, [angle]: url }));
        })
        .catch(() => {
          inflightRef.current.delete(angle);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [uid, dateKey, photos, imageUrls]);

  const runUpload = useCallback(
    async (angle: Angle, file: File) => {
      lastFileRef.current[angle] = file;
      setTransient((p) => ({ ...p, [angle]: { state: 'uploading' } }));

      let blob: Blob;
      try {
        blob = await normalizeToSquareJpeg(file);
      } catch {
        setTransient((p) => ({
          ...p,
          [angle]: { state: 'error', errorKey: 'unsupported' },
        }));
        return;
      }

      try {
        const url = await uploadAnglePhoto(uid, dateKey, angle, blob);
        await markPhotoUploaded(uid, dateKey, angle);
        setImageUrls((p) => ({ ...p, [angle]: url }));
        setTransient((p) => {
          const { [angle]: _omit, ...rest } = p;
          void _omit;
          return rest;
        });
        onUploaded(angle);
      } catch (err) {
        const errorKey: ErrorKey =
          err instanceof PhotoUploadError && err.code === 'too-large'
            ? 'tooLarge'
            : 'upload';
        setTransient((p) => ({ ...p, [angle]: { state: 'error', errorKey } }));
      }
    },
    [uid, dateKey, onUploaded],
  );

  function deriveSlot(angle: Angle): {
    state: SlotState;
    imageUrl?: string;
    errorKey?: ErrorKey;
  } {
    const tr = transient[angle];
    if (tr?.state === 'uploading') return { state: 'uploading' };
    if (tr?.state === 'error') return { state: 'error', errorKey: tr.errorKey };
    if (photos[angle]) {
      // 업로드는 끝났으나 download URL을 아직 못 받았거나 fetch가 cancel된 직후 — 빈 칸 대신 스피너 노출
      if (!imageUrls[angle]) return { state: 'uploading' };
      return { state: 'filled', imageUrl: imageUrls[angle] };
    }
    return { state: 'empty' };
  }

  return (
    <section aria-label="photos" className="rounded-[18px] bg-surface p-5 shadow-sm">
      <div className="grid grid-cols-3 gap-2.5">
        {ANGLES.map((angle) => {
          const slot = deriveSlot(angle);
          return (
            <PhotoSlot
              key={angle}
              angle={angle}
              state={slot.state}
              imageUrl={slot.imageUrl}
              errorMessage={slot.errorKey ? tErr(slot.errorKey) : undefined}
              onPick={(file) => runUpload(angle, file)}
              onRetry={
                slot.errorKey
                  ? () => {
                      const last = lastFileRef.current[angle];
                      if (last) runUpload(angle, last);
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}
