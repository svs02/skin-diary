'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { notFound, redirect } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getDailyRecord } from '@/lib/firebase/dailyRecord';
import { isFuture, isValidDateKey, todayKey } from '@/lib/utils/dateKey';
import { PhotoCapture } from '@/components/PhotoCapture';
import { LifestyleSection } from '@/components/LifestyleSection';
import type { Angle, DailyRecord } from '@/types';

const EMPTY_PHOTOS: Record<Angle, boolean> = { front: false, left: false, right: false };

function formatHero(dateKey: string, locale: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const monthName = new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
  const weekday = new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
  return { day: String(d), monthName, weekday };
}

function hasAnyPhoto(photos: Record<Angle, boolean>): boolean {
  return photos.front || photos.left || photos.right;
}

export default function RecordPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateKey } = use(params);

  // 훅은 어떤 분기에서도 동일하게 호출해야 하므로(rules of hooks) 가드보다 먼저 둔다.
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations('record');
  const [record, setRecord] = useState<DailyRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  const guardFailed = !isValidDateKey(dateKey) || isFuture(dateKey);

  const refresh = useCallback(async () => {
    if (!user) return;
    const r = await getDailyRecord(user.uid, dateKey);
    setRecord(r);
    setLoaded(true);
  }, [user, dateKey]);

  useEffect(() => {
    if (!user || guardFailed) return;
    let cancelled = false;
    getDailyRecord(user.uid, dateKey).then((r) => {
      if (!cancelled) {
        setRecord(r);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, dateKey, guardFailed]);

  // 라우트 가드 — 형식 위반은 404, 미래는 캘린더로 돌려보낸다 (CLAUDE.md §5.5)
  if (!isValidDateKey(dateKey)) notFound();
  if (isFuture(dateKey)) redirect('/calendar');

  const isToday = dateKey === todayKey();
  const hero = formatHero(dateKey, locale);
  const photos = record?.photos ?? EMPTY_PHOTOS;
  const showBadge = !!record?.lifestyleSavedAt || hasAnyPhoto(photos);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col">
        <span className="text-[12px] font-medium uppercase tracking-wide text-fg-muted">
          {isToday ? t('todayLabel') : hero.weekday}
        </span>
        <div className="flex items-baseline gap-3">
          <span
            className="font-bold leading-none text-fg"
            style={{ fontFamily: 'var(--font-display)', fontSize: 58 }}
          >
            {hero.day}
          </span>
          <span className="text-[16px] font-medium text-fg-muted">{hero.monthName}</span>
          {showBadge && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-dim px-2.5 py-1 text-[11px] font-semibold text-[color:var(--color-accent-text)]">
              <CheckIcon />
              {t('recorded.badge')}
            </span>
          )}
        </div>
      </header>

      {!loaded || !user ? (
        <div className="h-32 animate-pulse rounded-[18px] bg-surface-2" />
      ) : (
        <div className="flex flex-col gap-5">
          <PhotoCapture
            key={`photos-${dateKey}`}
            uid={user.uid}
            dateKey={dateKey}
            photos={photos}
            onUploaded={() => {
              void refresh();
            }}
          />
          <LifestyleSection
            key={`lifestyle-${dateKey}`}
            uid={user.uid}
            dateKey={dateKey}
            record={record}
            onSaved={refresh}
          />
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
