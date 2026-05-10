'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FirebaseError } from 'firebase/app';
import { normalizeToSquareJpeg } from '@/lib/image/normalize';
import {
  PhotoUploadError,
  deleteAnglePhoto,
  getAngleDownloadURL,
  uploadAnglePhoto,
} from '@/lib/storage/upload';
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
      getAngleDownloadURL(uid, dateKey, angle)
        .then((url) => {
          inflightRef.current.delete(angle);
          setImageUrls((p) => ({ ...p, [angle]: url }));
        })
        .catch((err: unknown) => {
          inflightRef.current.delete(angle);
          console.error('[PhotoCapture] URL fetch failed', { angle, dateKey, err });
          const code =
            err instanceof FirebaseError
              ? err.code
              : (err as { code?: string } | null)?.code;
          const message =
            err instanceof Error ? err.message : typeof err === 'string' ? err : '';
          const isMissing =
            code === 'storage/object-not-found' ||
            message.includes('object-not-found');
          const errorKey: ErrorKey = isMissing ? 'missing' : 'load';
          setTransient((p) => ({
            ...p,
            [angle]: { state: 'error', errorKey },
          }));
        });
    }
  }, [uid, dateKey, photos, pendingDeletes]);

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

  const runUpload = useCallback(
    async (angle: Angle, file: File) => {
      lastFileRef.current[angle] = file;
      setTransient((p) => ({ ...p, [angle]: { state: 'uploading' } }));
      // Spec §4.3.c — uploading 토스트 (info 톤)
      toast.info(tToast('uploading'));

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

      try {
        const url = await uploadAnglePhoto(uid, dateKey, angle, blob);
        await markPhotoUploaded(uid, dateKey, angle);
        setImageUrls((p) => ({ ...p, [angle]: url }));
        setTransient((p) => {
          const { [angle]: _omit, ...rest } = p;
          void _omit;
          return rest;
        });
        // Spec §4.3.c — uploaded 토스트 (success 톤)
        toast.success(tToast('uploaded'));
        onUploaded(angle);
      } catch (err) {
        const errorKey: ErrorKey =
          err instanceof PhotoUploadError && err.code === 'too-large'
            ? 'tooLarge'
            : 'upload';
        setTransient((p) => ({ ...p, [angle]: { state: 'error', errorKey } }));
        // Spec §4.3.c — failed 토스트 (alert 톤 + 재시도 액션)
        toast.alert(tToast('failed'), {
          label: tToast('retry'),
          onClick: () => runUpload(angle, file),
        });
      }
    },
    [uid, dateKey, onUploaded, toast, tToast],
  );

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
      runUpload(angle, file);
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
    </section>
  );
}
