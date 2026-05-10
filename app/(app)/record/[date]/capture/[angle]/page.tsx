'use client';

import { use, useEffect } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useToast } from '@/lib/toast';
import { isFuture, isValidDateKey, todayKey } from '@/lib/utils/dateKey';
import { CaptureShell } from '@/components/photo/CaptureShell';
import type { Angle } from '@/types';

const VALID_ANGLES: ReadonlySet<string> = new Set(['front', 'left', 'right']);

export default function CapturePage({
  params,
}: {
  params: Promise<{ date: string; angle: string }>;
}) {
  const { date, angle } = use(params);

  // 훅은 어떤 분기에서도 동일하게 호출 (rules of hooks)
  const router = useRouter();
  const toast = useToast();
  const tFuture = useTranslations('record.calendar.future');
  const { user } = useAuth();

  // 미래 날짜는 오늘로 부드럽게 되돌린다 (CLAUDE.md §5.5)
  useEffect(() => {
    if (!isValidDateKey(date)) return;
    if (isFuture(date)) {
      toast.info(tFuture('toast'));
      router.replace(`/record/${todayKey()}`);
    }
  }, [date, router, toast, tFuture]);

  // 형식 위반은 404
  if (!isValidDateKey(date)) notFound();
  if (!VALID_ANGLES.has(angle)) notFound();

  if (isFuture(date)) {
    return <div className="h-32 animate-pulse rounded-[18px] bg-surface-2" />;
  }
  if (!user) {
    return <div className="h-32 animate-pulse rounded-[18px] bg-surface-2" />;
  }

  return <CaptureShell uid={user.uid} date={date} angle={angle as Angle} />;
}
