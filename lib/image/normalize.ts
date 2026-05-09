/**
 * CLAUDE.md §1.2 규격 — 1024×1024 1:1 JPG, EXIF 제거, 품질 0.82.
 * 클라이언트 전용 (canvas, dynamic imports of heic2any/exifr).
 */

const TARGET_SIZE = 1024;
const JPEG_QUALITY = 0.82;
const HEIC_PATTERN = /\.(heic|heif)$/i;

function isHeic(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true;
  return HEIC_PATTERN.test(file.name);
}

async function fileToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
    return img;
  } finally {
    // Note: revokeObjectURL after drawImage; defer to caller via finalizer.
    // Caller already has decoded pixels in canvas; safe to revoke now.
    URL.revokeObjectURL(url);
  }
}

interface DrawTransform {
  drawWidth: number;
  drawHeight: number;
  rotateRad: number;
  flipX: number;
  flipY: number;
}

/**
 * EXIF orientation (1..8) → canvas 회전/플립 파라미터.
 * https://exiv2.org/tags.html
 */
function orientationToTransform(
  orientation: number,
  imgW: number,
  imgH: number,
): DrawTransform {
  switch (orientation) {
    case 2:
      return { drawWidth: imgW, drawHeight: imgH, rotateRad: 0, flipX: -1, flipY: 1 };
    case 3:
      return { drawWidth: imgW, drawHeight: imgH, rotateRad: Math.PI, flipX: 1, flipY: 1 };
    case 4:
      return { drawWidth: imgW, drawHeight: imgH, rotateRad: 0, flipX: 1, flipY: -1 };
    case 5:
      return { drawWidth: imgH, drawHeight: imgW, rotateRad: Math.PI / 2, flipX: -1, flipY: 1 };
    case 6:
      return { drawWidth: imgH, drawHeight: imgW, rotateRad: Math.PI / 2, flipX: 1, flipY: 1 };
    case 7:
      return { drawWidth: imgH, drawHeight: imgW, rotateRad: -Math.PI / 2, flipX: -1, flipY: 1 };
    case 8:
      return { drawWidth: imgH, drawHeight: imgW, rotateRad: -Math.PI / 2, flipX: 1, flipY: 1 };
    case 1:
    default:
      return { drawWidth: imgW, drawHeight: imgH, rotateRad: 0, flipX: 1, flipY: 1 };
  }
}

export async function normalizeToSquareJpeg(file: File): Promise<Blob> {
  let source: Blob = file;

  if (isHeic(file)) {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    source = Array.isArray(converted) ? converted[0] : converted;
  }

  let orientation = 1;
  try {
    const exifr = await import('exifr');
    const result = await exifr.orientation(source);
    if (typeof result === 'number') orientation = result;
  } catch {
    // EXIF 읽기 실패 시 기본값(1) 유지
  }

  const img = await fileToImage(source);
  const { drawWidth, drawHeight, rotateRad, flipX, flipY } = orientationToTransform(
    orientation,
    img.naturalWidth,
    img.naturalHeight,
  );

  // orientation 보정 후 크기 기준으로 center-crop
  const minSide = Math.min(drawWidth, drawHeight);
  const cropX = (drawWidth - minSide) / 2;
  const cropY = (drawHeight - minSide) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.imageSmoothingQuality = 'high';

  // 1) orientation 보정용 임시 캔버스
  const oriented = document.createElement('canvas');
  oriented.width = drawWidth;
  oriented.height = drawHeight;
  const octx = oriented.getContext('2d');
  if (!octx) throw new Error('Canvas 2D context unavailable');

  octx.translate(drawWidth / 2, drawHeight / 2);
  octx.rotate(rotateRad);
  octx.scale(flipX, flipY);
  octx.drawImage(
    img,
    -img.naturalWidth / 2,
    -img.naturalHeight / 2,
    img.naturalWidth,
    img.naturalHeight,
  );

  // 2) center-crop → 1024×1024
  ctx.drawImage(
    oriented,
    cropX,
    cropY,
    minSide,
    minSide,
    0,
    0,
    TARGET_SIZE,
    TARGET_SIZE,
  );

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) throw new Error('Canvas toBlob returned null');
  return blob;
}
