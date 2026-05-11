export interface Transform {
  scale: number;
  ox: number;
  oy: number;
}

export type Side = 'A' | 'B';

export const IDENTITY: Transform = { scale: 1, ox: 0, oy: 0 };
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 3;

export function clampScale(s: number): number {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, s));
}

export function clampOffset(t: Transform, halfSize: number): Transform {
  // 1배율(또는 축소)에서도 이동 가능. 한쪽이 절반까지 비어 보일 수 있는 한도(±halfSize)로 제한.
  // 줌인 상태(scale>1)에서는 사진이 컨테이너보다 크므로 (scale-1)*halfSize까지만 의미 있음.
  const max = t.scale > 1 ? (t.scale - 1) * halfSize : halfSize;
  return {
    scale: t.scale,
    ox: Math.max(-max, Math.min(max, t.ox)),
    oy: Math.max(-max, Math.min(max, t.oy)),
  };
}
