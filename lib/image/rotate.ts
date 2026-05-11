/**
 * 사용자가 preview 단계에서 적용한 회전을 픽셀 단위로 베이크.
 * 입력은 normalizeToSquareJpeg 이후의 1024×1024 정사각 JPG 가정.
 * 출력도 동일 규격(1024×1024 JPG 0.82).
 */

const TARGET_SIZE = 1024;
const JPEG_QUALITY = 0.82;

export type RotationDegrees = 90 | 180 | 270;

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for rotation'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function rotateBlob(blob: Blob, degrees: RotationDegrees): Promise<Blob> {
  const img = await blobToImage(blob);

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.imageSmoothingQuality = 'high';
  ctx.translate(TARGET_SIZE / 2, TARGET_SIZE / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -TARGET_SIZE / 2, -TARGET_SIZE / 2, TARGET_SIZE, TARGET_SIZE);

  const out: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });
  if (!out) throw new Error('Canvas toBlob returned null');
  return out;
}
