'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useTodayRecord } from './useOverviewData';
import { getSignedURL } from '@/lib/storage/signedUrl';
import { pickFirstAngle } from '@/lib/utils/comparePair';
import { todayKey } from '@/lib/utils/dateKey';
import type { Angle } from '@/types';

/**
 * Hero photo — 1:1 정사각, 화면 폭 - 32px gutter, radius 16, hairline ring (inset 1px).
 * 오늘 record가 있고 사진이 있으면 그 사진. 없으면 점선 빈 프레임 + 카메라 글리프 + hint.
 * 탭 시 /record/{today}로 이동.
 */
export function HeroPhoto() {
  const { user } = useAuth();
  const { data: today } = useTodayRecord();
  const t = useTranslations('overview.hero');

  const angle: Angle | null = today ? pickFirstAngle(today.photos) : null;
  const date = todayKey();

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !angle) return;
    let cancelled = false;
    getSignedURL(date, angle)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        // 네트워크/401 재시도 실패 — placeholder 유지.
        // (객체 누락은 200 OK + URL 반환 후 <img onError>에서 처리됨)
      });
    return () => {
      cancelled = true;
    };
  }, [user, angle, date]);

  const hasPhoto = !!angle;

  return (
    <Link
      href={`/record/${date}`}
      aria-label={hasPhoto ? date : t('emptyPhotoHint')}
      className="block w-full"
    >
      {hasPhoto ? (
        <div
          className="relative aspect-square w-full overflow-hidden rounded-[16px] bg-[color:var(--color-surface-2)] transition-opacity duration-150 hover:opacity-95 active:scale-[0.98]"
          style={{ boxShadow: 'inset 0 0 0 1px var(--color-border)' }}
        >
          {url && (
            <Image
              src={url}
              alt=""
              fill
              sizes="(max-width: 480px) 100vw, 448px"
              className="object-cover"
              unoptimized
              priority
            />
          )}
        </div>
      ) : (
        <div
          className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[16px] bg-[color:var(--color-surface)] transition-opacity duration-150 hover:opacity-95 active:scale-[0.98]"
          style={{ border: '1.5px dashed var(--color-border-strong)' }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="text-[color:var(--color-fg-subtle)]"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <p className="text-[13px] text-[color:var(--color-fg-muted)]">
            {t('emptyPhotoHint')}
          </p>
        </div>
      )}
    </Link>
  );
}
