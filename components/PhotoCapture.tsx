'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { normalizeToSquareJpeg } from '@/lib/image/normalize';
import { rotateBlob, type RotationDegrees } from '@/lib/image/rotate';
import {
  PhotoUploadError,
  deleteAnglePhoto,
  uploadAnglePhoto,
} from '@/lib/storage/upload';
import { getSignedURL, invalidateSignedURL } from '@/lib/storage/signedUrl';
import { markPhotoDeleted, markPhotoUploaded } from '@/lib/firebase/dailyRecord';
import { useToast } from '@/lib/toast';
import type { Angle } from '@/types';
import { PhotoSlot, type SlotState } from './PhotoSlot';
import { AddPhotoSheet } from './photo/AddPhotoSheet';
import { PhotoMenuSheet } from './photo/PhotoMenuSheet';

const ANGLES: Angle[] = ['front', 'left', 'right'];
// Spec §3.5 — 5초 grace 후 실 서버 commit
const DELETE_COMMIT_MS = 5000;

type ErrorKey = 'tooLarge' | 'unsupported' | 'upload' | 'load' | 'missing';
type Transient = { state: 'uploading' } | { state: 'error'; errorKey: ErrorKey };

type PreviewRotation = 0 | RotationDegrees;
type GalleryPreview = {
  angle: Angle;
  blob: Blob;
  objectUrl: string;
  rotation: PreviewRotation;
};

function nextRotation(r: PreviewRotation): PreviewRotation {
  return ((r + 90) % 360) as PreviewRotation;
}

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
  const tToast = useTranslations('record.photos.toast');
  const tMenu = useTranslations('record.photos.menu');
  const tCapture = useTranslations('record.capture');
  const tAngles = useTranslations('record.capture.angle');
  const router = useRouter();
  const toast = useToast();
  const [imageUrls, setImageUrls] = useState<Partial<Record<Angle, string>>>({});
  const [transient, setTransient] = useState<Partial<Record<Angle, Transient>>>({});
  const [sheet, setSheet] = useState<{ open: boolean; angle: Angle }>({
    open: false,
    angle: 'front',
  });
  const [menu, setMenu] = useState<{ open: boolean; angle: Angle }>({
    open: false,
    angle: 'front',
  });
  // optimistic delete 동안 부모의 photos[angle]=true를 가리는 클라이언트-only 상태.
  // 부모 photos prop은 readonly이므로 PhotoCapture 내부에서만 마스킹한다.
  const [pendingDeletes, setPendingDeletes] = useState<Set<Angle>>(new Set());
  const [preview, setPreview] = useState<GalleryPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRef = useRef<GalleryPreview | null>(null);
  previewRef.current = preview;
  const lastFileRef = useRef<Partial<Record<Angle, File>>>({});
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAngleRef = useRef<Angle | null>(null);
  // 진행 중인 URL 요청을 추적. 결과가 cancel/실패해도 항상 해제해서 다음 effect run에서 재시도 가능하게 한다.
  const inflightRef = useRef<Set<Angle>>(new Set());
  // imageUrls는 동기 스킵 체크용으로만 필요 — ref로 항상 최신 값을 읽되 effect 재실행은 트리거하지 않는다.
  // (deps에 imageUrls를 넣으면 첫 URL 도착 시 effect cleanup이 in-flight 다른 angle의 closure를 cancel시켜 영구 'uploading'에 갇힘.)
  const imageUrlsRef = useRef<Partial<Record<Angle, string>>>({});
  imageUrlsRef.current = imageUrls;
  // 5초 grace 동안 진행 중인 삭제 commit 타이머. undo 시 cancel.
  const deleteTimersRef = useRef<Partial<Record<Angle, ReturnType<typeof setTimeout>>>>(
    {},
  );

  useEffect(() => {
    // cancelled 플래그를 두지 않는다. Strict Mode에서 cleanup→rerun 사이에
    // cancelled=true가 되어 첫 fetch 결과가 버려지고, 두 번째 effect run은
    // inflightRef 때문에 skip → imageUrls가 영구히 비어 'uploading'에 갇힘.
    // setState는 idempotent하고 dateKey 변경은 부모의 key prop으로 remount되므로
    // 여기서 stale write 위험은 없다.
    for (const angle of ANGLES) {
      if (!photos[angle]) continue;
      if (pendingDeletes.has(angle)) continue; // 삭제 진행 중에는 fetch 보류
      if (imageUrlsRef.current[angle]) continue; // 이미 URL 보유
      if (inflightRef.current.has(angle)) continue;
      inflightRef.current.add(angle);
      // Signed URL fetch: 200 OK + URL을 받으면 객체 존재 여부와 무관하게 성공.
      // 객체 누락(404)은 <img onError> 콜백(handleImageError)에서 'missing' 에러로 처리.
      // 여기서 에러는 네트워크/401 재시도 실패 등 'load' 계열만 발생한다.
      getSignedURL(dateKey, angle)
        .then((url) => {
          inflightRef.current.delete(angle);
          setImageUrls((p) => ({ ...p, [angle]: url }));
        })
        .catch((err: unknown) => {
          inflightRef.current.delete(angle);
          console.error('[PhotoCapture] URL fetch failed', { angle, dateKey, err });
          setTransient((p) => ({
            ...p,
            [angle]: { state: 'error', errorKey: 'load' },
          }));
        });
    }
  }, [uid, dateKey, photos, pendingDeletes]);

  // <img onError> — Signed URL이 200으로 반환된 후 실제 객체 fetch가 404로 실패하는 경우.
  // 객체 누락 케이스를 'missing'으로 분기하고, stale URL 캐시를 비워 다음 페치에서 재시도 가능하게 한다.
  const handleImageError = useCallback(
    (angle: Angle) => {
      console.warn('[PhotoCapture] image fetch failed (likely missing object)', {
        angle,
        dateKey,
      });
      invalidateSignedURL(dateKey, angle);
      setImageUrls((p) => {
        const { [angle]: _omit, ...rest } = p;
        void _omit;
        return rest;
      });
      setTransient((p) => ({
        ...p,
        [angle]: { state: 'error', errorKey: 'missing' },
      }));
    },
    [dateKey],
  );

  // unmount 시 모든 pending delete commit 타이머 정리 — undo 권한이 사라지므로 즉시 commit하지 않고 단순 cancel.
  // (삭제 의도는 5초 후에만 영속화 — 그 전에 화면을 떠나면 변경 없음으로 간주, UX §5.3 "안 해도 된다" 톤.)
  useEffect(() => {
    return () => {
      for (const t of Object.values(deleteTimersRef.current)) {
        if (t) clearTimeout(t);
      }
      deleteTimersRef.current = {};
    };
  }, []);

  const commitUpload = useCallback(
    async (angle: Angle, blob: Blob) => {
      setTransient((p) => ({ ...p, [angle]: { state: 'uploading' } }));
      // Spec §4.3.c — uploading 토스트 (info 톤)
      toast.info(tToast('uploading'));
      try {
        const url = await uploadAnglePhoto(uid, dateKey, angle, blob);
        await markPhotoUploaded(uid, dateKey, angle);
        setImageUrls((p) => ({ ...p, [angle]: url }));
        setTransient((p) => {
          const { [angle]: _omit, ...rest } = p;
          void _omit;
          return rest;
        });
        toast.success(tToast('uploaded'));
        onUploaded(angle);
      } catch (err) {
        const errorKey: ErrorKey =
          err instanceof PhotoUploadError && err.code === 'too-large'
            ? 'tooLarge'
            : 'upload';
        setTransient((p) => ({ ...p, [angle]: { state: 'error', errorKey } }));
        toast.alert(tToast('failed'), {
          label: tToast('retry'),
          onClick: () => commitUpload(angle, blob),
        });
      }
    },
    [uid, dateKey, onUploaded, toast, tToast],
  );

  const runUpload = useCallback(
    async (angle: Angle, file: File) => {
      lastFileRef.current[angle] = file;
      let blob: Blob;
      try {
        blob = await normalizeToSquareJpeg(file);
      } catch {
        setTransient((p) => ({
          ...p,
          [angle]: { state: 'error', errorKey: 'unsupported' },
        }));
        toast.alert(tToast('failed'), {
          label: tToast('retry'),
          onClick: () => runUpload(angle, file),
        });
        return;
      }
      await commitUpload(angle, blob);
    },
    [commitUpload, toast, tToast],
  );

  // 갤러리 입력 흐름: normalize → preview 시트 → 회전/사용 확정 → commitUpload
  const openPreviewFromFile = useCallback(
    async (angle: Angle, file: File) => {
      lastFileRef.current[angle] = file;
      let blob: Blob;
      try {
        blob = await normalizeToSquareJpeg(file);
      } catch {
        setTransient((p) => ({
          ...p,
          [angle]: { state: 'error', errorKey: 'unsupported' },
        }));
        toast.alert(tToast('failed'), {
          label: tToast('retry'),
          onClick: () => runUpload(angle, file),
        });
        return;
      }
      // 기존 preview가 있으면 revoke
      const prev = previewRef.current;
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      const objectUrl = URL.createObjectURL(blob);
      setPreview({ angle, blob, objectUrl, rotation: 0 });
    },
    [runUpload, toast, tToast],
  );

  function rotatePreview() {
    setPreview((p) => (p ? { ...p, rotation: nextRotation(p.rotation) } : p));
  }

  function discardPreview() {
    const p = previewRef.current;
    if (p) URL.revokeObjectURL(p.objectUrl);
    setPreview(null);
  }

  async function confirmPreview() {
    const p = previewRef.current;
    if (!p || previewBusy) return;
    setPreviewBusy(true);
    try {
      const finalBlob =
        p.rotation === 0 ? p.blob : await rotateBlob(p.blob, p.rotation);
      URL.revokeObjectURL(p.objectUrl);
      setPreview(null);
      await commitUpload(p.angle, finalBlob);
    } catch {
      // 회전 베이크 실패 시 침묵하지 않고 사용자에게 통지. preview는 유지하여 재시도 가능.
      toast.alert(tToast('failed'));
    } finally {
      setPreviewBusy(false);
    }
  }

  // unmount 시 preview blob URL 정리
  useEffect(() => {
    return () => {
      const p = previewRef.current;
      if (p) URL.revokeObjectURL(p.objectUrl);
    };
  }, []);

  function deriveSlot(angle: Angle): {
    state: SlotState;
    imageUrl?: string;
    errorKey?: ErrorKey;
  } {
    const tr = transient[angle];
    if (tr?.state === 'uploading') return { state: 'uploading' };
    if (tr?.state === 'error') return { state: 'error', errorKey: tr.errorKey };
    // optimistic delete: 부모가 photos[angle]=true여도 pendingDeletes 동안 empty로 노출
    if (pendingDeletes.has(angle)) return { state: 'empty' };
    if (photos[angle]) {
      // 업로드는 끝났으나 download URL을 아직 못 받았거나 fetch가 cancel된 직후 — 빈 칸 대신 스피너 노출
      if (!imageUrls[angle]) return { state: 'uploading' };
      return { state: 'filled', imageUrl: imageUrls[angle] };
    }
    return { state: 'empty' };
  }

  function openSheet(angle: Angle) {
    pendingAngleRef.current = angle;
    setSheet({ open: true, angle });
  }

  function handleSheetCamera() {
    const angle = pendingAngleRef.current;
    if (!angle) {
      // MediaDevices 미지원 환경 안전망 — 기존 file input 트리거
      cameraInputRef.current?.click();
      return;
    }
    pendingAngleRef.current = null;
    router.push(`/record/${dateKey}/capture/${angle}`);
  }

  function handleSheetGallery() {
    galleryInputRef.current?.click();
  }

  function handleSheetFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const angle = pendingAngleRef.current;
    if (file && angle) {
      pendingAngleRef.current = null;
      void openPreviewFromFile(angle, file);
    }
  }

  // ⋯ 메뉴: "다시 촬영" — CaptureShell 라우트로 이동
  function handleMenuRetake() {
    const angle = menu.angle;
    router.push(`/record/${dateKey}/capture/${angle}`);
  }

  // ⋯ 메뉴: "갤러리에서 교체" — file picker 직행
  function handleMenuReplace() {
    pendingAngleRef.current = menu.angle;
    replaceInputRef.current?.click();
  }

  // ⋯ 메뉴: "삭제" — optimistic + 5s undo
  function handleMenuDelete() {
    const angle = menu.angle;

    // 1) 즉시 UI 반영: 슬롯을 empty로 마스킹 + 캐시 URL 제거
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.add(angle);
      return next;
    });
    setImageUrls((prev) => {
      const { [angle]: _omit, ...rest } = prev;
      void _omit;
      return rest;
    });

    // 2) undo 핸들러 — 5s 안에 누르면 commit 취소 + 마스킹 해제 → effect가 URL 재페치
    const undo = () => {
      const t = deleteTimersRef.current[angle];
      if (t) {
        clearTimeout(t);
        delete deleteTimersRef.current[angle];
      }
      setPendingDeletes((prev) => {
        if (!prev.has(angle)) return prev;
        const next = new Set(prev);
        next.delete(angle);
        return next;
      });
    };

    // 3) 토스트 (alert 톤 — action 보장 위해)
    toast.alert(tMenu('deletedToast'), {
      label: tMenu('undo'),
      onClick: undo,
    });

    // 4) 5s 후 실 서버 commit
    deleteTimersRef.current[angle] = setTimeout(() => {
      delete deleteTimersRef.current[angle];
      void (async () => {
        try {
          await deleteAnglePhoto(uid, dateKey, angle);
          await markPhotoDeleted(uid, dateKey, angle);
          // 부모 photos record를 false로 동기화 — onUploaded는 record 재페치 트리거 콜백
          onUploaded(angle);
          // 부모 photos[angle]=false가 prop으로 내려오면 pendingDeletes는 더 이상 의미 없음 → 정리
          setPendingDeletes((prev) => {
            if (!prev.has(angle)) return prev;
            const next = new Set(prev);
            next.delete(angle);
            return next;
          });
        } catch (err) {
          console.error('[PhotoCapture] delete failed', { angle, dateKey, err });
          // 롤백: 마스킹 해제 → effect가 URL 재페치
          setPendingDeletes((prev) => {
            if (!prev.has(angle)) return prev;
            const next = new Set(prev);
            next.delete(angle);
            return next;
          });
          toast.alert(tToast('failed'), {
            label: tToast('retry'),
            onClick: () => handleMenuDelete(),
          });
        }
      })();
    }, DELETE_COMMIT_MS);
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
              showRetry={slot.errorKey != null && slot.errorKey !== 'missing'}
              onEmptyClick={() => openSheet(angle)}
              onPick={(file) => runUpload(angle, file)}
              onMenuOpen={() => setMenu({ open: true, angle })}
              onImageError={() => handleImageError(angle)}
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

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleSheetFile}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleSheetFile}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      {/* ⋯ 메뉴 "갤러리에서 교체" 전용 — pendingAngleRef로 angle 전달, handleSheetFile과 동일 흐름 */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        onChange={handleSheetFile}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      <AddPhotoSheet
        open={sheet.open}
        angle={sheet.angle}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        onAngleChange={(a) => {
          pendingAngleRef.current = a;
          setSheet((s) => ({ ...s, angle: a }));
        }}
        onCamera={handleSheetCamera}
        onGallery={handleSheetGallery}
      />

      <PhotoMenuSheet
        open={menu.open}
        angle={menu.angle}
        onOpenChange={(o) => setMenu((s) => ({ ...s, open: o }))}
        onRetake={handleMenuRetake}
        onReplace={handleMenuReplace}
        onDelete={handleMenuDelete}
      />

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tAngles(preview.angle)}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'var(--color-camera-bg)' }}
        >
          <header
            className="relative z-10 flex items-center justify-between px-4"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 8px)',
              paddingBottom: 8,
            }}
          >
            <button
              type="button"
              aria-label={tCapture('close')}
              onClick={discardPreview}
              disabled={previewBusy}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-50"
              style={{ background: 'rgba(0,0,0,0.32)' }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div
              className="text-[14px] font-semibold text-white"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
            >
              {tAngles(preview.angle)}
            </div>
            <button
              type="button"
              onClick={rotatePreview}
              disabled={previewBusy}
              aria-label={tCapture('rotate.aria')}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-white disabled:opacity-50"
              style={{
                background: 'rgba(0,0,0,0.45)',
                boxShadow: 'var(--shadow-raised)',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
              <span>
                {preview.rotation === 0
                  ? tCapture('rotate.label')
                  : tCapture('rotate.degrees', { deg: preview.rotation })}
              </span>
            </button>
          </header>

          <div className="relative flex flex-1 items-center justify-center px-4">
            <div className="relative aspect-square w-full max-w-[480px] overflow-hidden rounded-[18px] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.objectUrl}
                alt={tAngles(preview.angle)}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  transform: `rotate(${preview.rotation}deg)`,
                  transition: 'transform 180ms ease-out',
                }}
              />
            </div>
          </div>

          <div
            className="relative z-10 flex flex-col items-center px-4"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
              paddingTop: 24,
              background:
                'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))',
            }}
          >
            <div className="flex w-full max-w-[420px] gap-2">
              <button
                type="button"
                onClick={discardPreview}
                disabled={previewBusy}
                className="flex h-[52px] flex-1 items-center justify-center rounded-[12px] text-[15px] font-semibold text-white disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.16)' }}
              >
                {tCapture('preview.retake')}
              </button>
              <button
                type="button"
                onClick={() => void confirmPreview()}
                disabled={previewBusy}
                className="flex h-[52px] flex-1 items-center justify-center rounded-[12px] bg-accent text-[15px] font-semibold text-[color:var(--color-surface)] disabled:opacity-60"
              >
                {previewBusy ? '…' : tCapture('preview.use')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
