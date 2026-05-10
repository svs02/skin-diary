'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useStreak } from './useOverviewData';
import { getDailyRecord, listRecordKeysInRange } from '@/lib/firebase/dailyRecord';
import { todayKey } from '@/lib/utils/dateKey';

/**
 * Monthly stats — Streak ≥ 30일에서만 노출.
 * 한 줄 인라인: 「이번 달 · {n}일 기록 · 가장 자주 {habit}」
 *  - 가운데 세그먼트(`{n}일 기록`)는 accent weight 600 tabular.
 *  - separator는 3px subtle round dot.
 *
 * 카드 박스 없음 — 부모 MetaInlineBlock가 surface 제공.
 */

type HabitKey = 'water' | 'food' | 'cosmetic' | 'exercise';

function SubtleDot() {
  return (
    <span
      aria-hidden
      className="inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--color-fg-subtle)]"
    />
  );
}

function monthBounds(today: string): { start: string; endExclusive: string } {
  const ym = today.slice(0, 7);
  const start = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const endExclusive = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { start, endExclusive };
}

export function MonthlyStats() {
  const { user } = useAuth();
  const streak = useStreak();
  const t = useTranslations('overview.stats');
  const tHabits = useTranslations('record.recorded');

  const [count, setCount] = useState<number | null>(null);
  const [mode, setMode] = useState<HabitKey | null>(null);

  const enabled = streak !== undefined && streak >= 30 && !!user;

  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;
    (async () => {
      const today = todayKey();
      const { start, endExclusive } = monthBounds(today);
      const items = await listRecordKeysInRange(user.uid, start, endExclusive);
      if (cancelled) return;
      setCount(items.length);

      const records = await Promise.all(
        items.map((i) => getDailyRecord(user.uid, i.date)),
      );
      if (cancelled) return;
      const tally: Record<HabitKey, number> = {
        water: 0,
        food: 0,
        cosmetic: 0,
        exercise: 0,
      };
      for (const r of records) {
        if (!r) continue;
        if (r.water > 0) tally.water++;
        if (r.food.trim()) tally.food++;
        if (r.cosmetic.trim()) tally.cosmetic++;
        if (r.exercise) tally.exercise++;
      }
      let topKey: HabitKey | null = null;
      let topVal = 0;
      (Object.keys(tally) as HabitKey[]).forEach((k) => {
        if (tally[k] > topVal) {
          topVal = tally[k];
          topKey = k;
        }
      });
      setMode(topVal > 0 ? topKey : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, user]);

  if (!enabled) return null;
  if (count === null) return null;

  const habitLabel = mode ? tHabits(mode as 'water' | 'food' | 'cosmetic' | 'exercise') : '—';

  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] leading-relaxed text-[color:var(--color-fg)]">
      <span>{t('monthly')}</span>
      <SubtleDot />
      <span
        className="font-semibold text-[color:var(--color-accent)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {t('monthlyDays', { n: count })}
      </span>
      <SubtleDot />
      <span className="text-[color:var(--color-fg-muted)]">
        {t('monthlyHabit', { habit: habitLabel })}
      </span>
    </p>
  );
}
