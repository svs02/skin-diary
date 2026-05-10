'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { normalizeToSquareJpeg } from '@/lib/image/normalize';
import { uploadAnglePhoto } from '@/lib/storage/upload';
import { markPhotoUploaded } from '@/lib/firebase/dailyRecord';
import { useToast } from '@/lib/toast';
import type { Angle } from '@/types';
import { AngleGuide } from './AngleGuide';

const ANGLES: Angle[] = ['front', 'left', 'right'];

type Phase =
  | 'checking'
  | 'prompt'
  | 'allowed'
  | 'denied-once'
  | 'denied-permanent'
  | 'no-camera'
  | 'in-use';

type CapturedPreview = {
  blob: Blob;
  objectUrl: string;
};

const VIDEO_CONSTRAINTS_PREFERRED: MediaStreamConstraints = {
  video: {
    facingMode: 'environment',
    width: { ideal: 1080 },
    height: { ideal: 1080 },
  },
  audio: false,
};

const VIDEO_CONSTRAINTS_FALLBACK: MediaStreamConstraints = {
  video: true,
  audio: false,
};

export function CaptureShell({
  uid,
  date,
  angle,
}: {
  uid: string;
  date: string;
  angle: Angle;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('record.capture');
  const tAngles = useTranslations('record.capture.angle');

  const [phase, setPhase] = useState<Phase>('checking');
  const [deniedCount, setDeniedCount] = useState(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [preview, setPreview] = useState<CapturedPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<CapturedPreview | null>(null);
  previewRef.current = preview;

  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        // autoplay 정책 거부 시 무시
      });
    }
  }, []);

  const angleIdx = ANGLES.indexOf(angle) + 1;

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const requestStream = useCallback(
    async (mode: 'environment' | 'user' = facingMode): Promise<void> => {
      stopStream();
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1080 },
          height: { ideal: 1080 },
        },
        audio: false,
      };
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          if (
            err instanceof DOMException &&
            err.name === 'OverconstrainedError'
          ) {
            // 제약 완화 후 재시도
            stream = await navigator.mediaDevices.getUserMedia(
              VIDEO_CONSTRAINTS_FALLBACK,
            );
          } else {
            throw err;
          }
        }
        streamRef.current = stream;
        // phase를 먼저 올려 video 엘리먼트 렌더 트리거
        setPhase('allowed');
        // 이미 mount된 경우(예: flipCamera) 즉시 부착.
        // 초기 진입은 attachVideo callback ref가 mount 시점에 처리.
        const video = videoRef.current;
        if (video && video.srcObject !== stream) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // ignore
          }
        }
        // torch 지원 여부 검사
        const track = stream.getVideoTracks()[0];
        const caps =
          (track?.getCapabilities?.() as MediaTrackCapabilities & {
            torch?: boolean;
          }) ?? {};
        setTorchSupported(!!caps.torch);
      } catch (err) {
        if (err instanceof DOMException) {
          if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
            const next = deniedCount + 1;
            setDeniedCount(next);
            // permissions.state로 영구 거부 여부 보강
            let permanent = next >= 2;
            try {
              const status = await navigator.permissions?.query?.({
                name: 'camera' as PermissionName,
              });
              if (status?.state === 'denied') permanent = true;
            } catch {
              // 미지원 — count 기반만 사용
            }
            setPhase(permanent ? 'denied-permanent' : 'denied-once');
            return;
          }
          if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
            setPhase('no-camera');
            return;
          }
          if (err.name === 'NotReadableError' || err.name === 'AbortError') {
            setPhase('in-use');
            return;
          }
        }
        // unknown — fallback to prompt for retry
        setPhase('prompt');
      }
    },
    [deniedCount, facingMode, stopStream],
  );

  // 초기 권한 상태 조회
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setPhase('no-camera');
        return;
      }
      try {
        const status = await navigator.permissions?.query?.({
          name: 'camera' as PermissionName,
        });
        if (cancelled) return;
        if (status?.state === 'granted') {
          await requestStream('environment');
          return;
        }
        if (status?.state === 'denied') {
          setPhase('denied-permanent');
          return;
        }
        setPhase('prompt');
      } catch {
        // permissions API 미지원 — prompt 카드부터 보여주고 사용자가 허용 누르면 getUserMedia
        if (!cancelled) setPhase('prompt');
      }
    })();
    return () => {
      cancelled = true;
    };
    // requestStream을 deps에 넣으면 deniedCount 변화 시 재진입돼 의도와 어긋난다.
    // mount 시 한 번만 실행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 카메라 디바이스 수 검사 (allowed 진입 후)
  useEffect(() => {
    if (phase !== 'allowed') return;
    let cancelled = false;
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((devices) => {
        if (cancelled) return;
        const cams = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(cams.length >= 2);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // body scroll lock
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // visibilitychange — 백그라운드 시 stream stop (배터리/권한)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    function onVis() {
      if (document.visibilityState === 'hidden') {
        stopStream();
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stopStream]);

  // 키보드: Space/Enter → 셔터, Esc → 닫기
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.back();
        return;
      }
      if ((e.key === ' ' || e.key === 'Enter') && phase === 'allowed' && !preview) {
        e.preventDefault();
        void handleShutter();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, preview, router]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      stopStream();
      const p = previewRef.current;
      if (p) URL.revokeObjectURL(p.objectUrl);
    };
  }, [stopStream]);

  async function handleAllow() {
    setPhase('checking');
    await requestStream('environment');
  }

  function openGallery() {
    galleryInputRef.current?.click();
  }

  async function handleGalleryFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const blob = await normalizeToSquareJpeg(file);
      await uploadAnglePhoto(uid, date, angle, blob);
      await markPhotoUploaded(uid, date, angle);
      stopStream();
      router.replace(`/record/${date}`);
    } catch (err) {
      toast.alert(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleShutter() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    // 후면(environment) 카메라는 그대로, 전면(user)은 자연스러운 사용감을 위해 좌우 mirror.
    if (facingMode === 'user') {
      ctx.translate(1024, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 1024, 1024);

    const rawBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
    });
    if (!rawBlob) {
      toast.alert('capture failed');
      return;
    }

    // EXIF/orientation은 이미 없지만 파이프라인 일관성을 위해 normalize 한 번 더 통과
    const file = new File([rawBlob], 'capture.jpg', { type: 'image/jpeg' });
    let normalized: Blob;
    try {
      normalized = await normalizeToSquareJpeg(file);
    } catch {
      normalized = rawBlob;
    }

    const objectUrl = URL.createObjectURL(normalized);
    setPreview({ blob: normalized, objectUrl });
    // freeze 동안 stream은 살려둔다 — 다시 찍기 시 즉시 라이브 복귀
  }

  function discardPreview() {
    if (preview) URL.revokeObjectURL(preview.objectUrl);
    setPreview(null);
  }

  async function handleUsePhoto() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      await uploadAnglePhoto(uid, date, angle, preview.blob);
      await markPhotoUploaded(uid, date, angle);
      URL.revokeObjectURL(preview.objectUrl);
      stopStream();
      router.replace(`/record/${date}`);
    } catch (err) {
      toast.alert(err instanceof Error ? err.message : 'upload failed');
      setBusy(false);
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet & { torch: boolean }],
      });
      setTorchOn(next);
    } catch {
      // 비표준 — 무시
    }
  }

  async function flipCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    await requestStream(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--color-camera-bg)' }}
    >
      {/* 갤러리 fallback input — 모든 phase에서 사용 가능 */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleGalleryFile}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {phase === 'checking' && (
        <div className="flex flex-1 items-center justify-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-label={t('shutter')}
          />
        </div>
      )}

      {phase === 'prompt' && (
        <PermissionCard
          title={t('permission.prompt.title')}
          body={t('permission.prompt.body')}
          primaryLabel={t('permission.allow')}
          onPrimary={handleAllow}
          secondaryLabel={t('permission.gallery')}
          onSecondary={openGallery}
          onClose={() => router.back()}
          closeLabel={t('close')}
        />
      )}

      {phase === 'denied-once' && (
        <PermissionCard
          title={t('permission.deniedOnce.title')}
          body={t('permission.deniedOnce.body')}
          primaryLabel={t('retry')}
          onPrimary={handleAllow}
          secondaryLabel={t('permission.gallery')}
          onSecondary={openGallery}
          onClose={() => router.back()}
          closeLabel={t('close')}
        />
      )}

      {phase === 'denied-permanent' && (
        <PermissionCard
          title={t('permission.deniedPermanent.title')}
          body={t('permission.deniedPermanent.body')}
          secondaryLabel={t('permission.gallery')}
          onSecondary={openGallery}
          onClose={() => router.back()}
          closeLabel={t('close')}
        />
      )}

      {phase === 'no-camera' && (
        <PermissionCard
          title={t('error.notFound.title')}
          body={t('error.notFound.body')}
          primaryLabel={t('permission.gallery')}
          onPrimary={openGallery}
          onClose={() => router.back()}
          closeLabel={t('close')}
        />
      )}

      {phase === 'in-use' && (
        <PermissionCard
          title={t('error.notReadable.title')}
          body={t('error.notReadable.body')}
          primaryLabel={t('retry')}
          onPrimary={handleAllow}
          secondaryLabel={t('permission.gallery')}
          onSecondary={openGallery}
          onClose={() => router.back()}
          closeLabel={t('close')}
        />
      )}

      {phase === 'allowed' && (
        <>
          {/* 라이브 비디오 */}
          <video
            ref={attachVideo}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              transform: facingMode === 'user' ? 'scaleX(-1)' : undefined,
            }}
          />

          {/* AngleGuide 오버레이 */}
          {!preview && <AngleGuide angle={angle} />}

          {/* preview freeze layer */}
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.objectUrl}
              alt={tAngles(angle)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* 상단 바 */}
          <header
            className="relative z-10 flex items-center justify-between px-4 pt-2"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 8px)',
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))',
            }}
          >
            <button
              type="button"
              aria-label={t('close')}
              onClick={() => router.back()}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white"
              style={{ background: 'rgba(0,0,0,0.32)' }}
            >
              <CloseIcon />
            </button>
            <div
              className="text-[14px] font-semibold text-white"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
            >
              {tAngles(angle)} · {angleIdx}/3
            </div>
            <div className="h-11 w-11" aria-hidden />
          </header>

          {/* 진행 도트 */}
          {!preview && (
            <div className="relative z-10 mt-3 flex items-center justify-center gap-2.5">
              {ANGLES.map((a) => {
                const active = a === angle;
                return (
                  <span
                    key={a}
                    aria-hidden
                    className="block rounded-full"
                    style={
                      active
                        ? {
                            width: 10,
                            height: 10,
                            border: '2px solid var(--color-accent)',
                            background: 'transparent',
                          }
                        : {
                            width: 8,
                            height: 8,
                            border: '1px solid rgba(255,255,255,0.55)',
                            background: 'transparent',
                          }
                    }
                  />
                );
              })}
            </div>
          )}

          {/* 사이드레일 (좌측 세로) */}
          {!preview && (
            <div
              className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3"
            >
              {torchSupported && (
                <button
                  type="button"
                  aria-label="torch"
                  aria-pressed={torchOn}
                  onClick={() => void toggleTorch()}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                  style={{ background: 'rgba(0,0,0,0.32)' }}
                >
                  <TorchIcon active={torchOn} />
                </button>
              )}
              {hasMultipleCameras && (
                <button
                  type="button"
                  aria-label="switch-camera"
                  onClick={() => void flipCamera()}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                  style={{ background: 'rgba(0,0,0,0.32)' }}
                >
                  <SwitchIcon />
                </button>
              )}
            </div>
          )}

          {/* 하단 영역: 셔터 또는 미리보기 액션 */}
          <div
            className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center justify-center px-4"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
              paddingTop: 24,
              background:
                'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))',
            }}
          >
            {!preview ? (
              <ShutterButton
                disabled={busy}
                onClick={() => void handleShutter()}
                label={t('shutter')}
              />
            ) : (
              <div className="flex w-full max-w-[420px] gap-2">
                <button
                  type="button"
                  onClick={discardPreview}
                  disabled={busy}
                  className="flex h-[52px] flex-1 items-center justify-center rounded-[12px] text-[15px] font-semibold text-white disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.16)' }}
                >
                  {t('preview.retake')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleUsePhoto()}
                  disabled={busy}
                  className="flex h-[52px] flex-1 items-center justify-center rounded-[12px] bg-accent text-[15px] font-semibold text-[color:var(--color-surface)] disabled:opacity-60"
                >
                  {busy ? '…' : t('preview.use')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PermissionCard({
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onClose,
  closeLabel,
}: {
  title: string;
  body: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="relative flex flex-1 flex-col">
      <header
        className="flex items-center justify-end px-4 pt-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white"
          style={{ background: 'rgba(0,0,0,0.32)' }}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          aria-hidden
        >
          <CameraIllustration />
        </div>
        <h1
          className="text-[22px] font-semibold leading-snug"
          style={{ color: 'var(--color-surface)' }}
        >
          {title}
        </h1>
        <p
          className="mt-2 max-w-[320px] text-[16px]"
          style={{ color: 'var(--color-fg-subtle)' }}
        >
          {body}
        </p>

        <div className="mt-8 flex w-full max-w-[320px] flex-col items-stretch gap-3">
          {primaryLabel && onPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              className="flex h-[52px] items-center justify-center rounded-[12px] bg-accent text-[15px] font-semibold text-[color:var(--color-surface)]"
            >
              {primaryLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="flex h-[44px] items-center justify-center rounded-[12px] text-[14px] font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ShutterButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="group relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform duration-100 ease-out active:scale-[0.94] disabled:opacity-60"
      style={{
        boxShadow: 'inset 0 0 0 3px var(--color-surface)',
        background: 'transparent',
      }}
    >
      <span
        className="block h-[64px] w-[64px] rounded-full"
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-raised)',
        }}
      />
    </button>
  );
}

function CloseIcon() {
  return (
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
  );
}

function CameraIllustration() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-surface)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.5 4h-5l-2 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5l-2-2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function TorchIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7h13l-3-3" />
      <path d="M21 17H8l3 3" />
    </svg>
  );
}
