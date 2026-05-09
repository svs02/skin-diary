'use client';

import { useTranslations } from 'next-intl';
import type { Angle } from '@/types';
import { ANGLE_ORDER } from '@/lib/utils/comparePair';

interface PhotoFlags {
  front: boolean;
  left: boolean;
  right: boolean;
}

interface Props {
  value: Angle;
  onChange: (angle: Angle) => void;
  fromPhotos: PhotoFlags;
  toPhotos: PhotoFlags;
}

/**
 * 3분할 pill (Front / Left / Right).
 *  - 양쪽 모두 사진 있는 angle만 활성. 그렇지 않으면 opacity-40 + aria-disabled.
 *  - 한쪽이라도 사진이 없는 항목 클릭은 무반응 (alert 금지 — 핸드오프 원칙).
 *  - 적용은 즉시 (Apply 버튼 없음 — sheet auto-dismiss는 호출부에서).
 */
export function AngleSegment({ value, onChange, fromPhotos, toPhotos }: Props) {
  const t = useTranslations('compare.angles');
  const tCompare = useTranslations('compare');

  const items = ANGLE_ORDER.map((angle) => ({
    angle,
    enabled: fromPhotos[angle] && toPhotos[angle],
  }));

  const anyDisabled = items.some((i) => !i.enabled);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={tCompare('sheet.angleTitle')}
        className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-1"
      >
        {items.map(({ angle, enabled }) => {
          const active = value === angle;
          return (
            <button
              key={angle}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={!enabled}
              tabIndex={enabled ? 0 : -1}
              onClick={() => {
                if (!enabled) return;
                onChange(angle);
              }}
              className={`flex h-10 items-center justify-center rounded-[var(--radius-sm)] text-[14px] font-medium transition-colors ${
                active
                  ? 'bg-[color:var(--color-accent-dim)] text-[color:var(--color-accent-text)]'
                  : 'text-[color:var(--color-fg-muted)]'
              } ${enabled ? '' : 'opacity-40'}`}
            >
              {t(angle)}
            </button>
          );
        })}
      </div>
      {anyDisabled && (
        <p className="text-[12px] text-[color:var(--color-fg-subtle)]">{tCompare('angleDisabled')}</p>
      )}
    </div>
  );
}
