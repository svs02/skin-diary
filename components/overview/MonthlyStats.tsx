'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useStreak } from './useOverviewData';
import { getDailyRecord, listRecordKeysInRange } from '@/lib/firebase/dailyRecord';
import { todayKey } from '@/lib/utils/dateKey';

/**
 * 월간 스탯 — Streak ≥ 30일에서만 노출.
 *
 * 데이터:
 *  - 이번 달 기록 수: listRecordKeysInRange(month-start, next-month-start)
 *  - 가장 자주 한 라이프스타일 항목: 이번 달 기록의 mode (water>0 / food / cosmetic / exercise)
 *
 * Lazy fetch — 30일 게이트 통과 사용자에게만 추가 쿼리.
 *
 * 단순화: 이번 달 record 문서들만 추가로 읽어서 빈도 집계.
 *  - record 수가 30개를 넘기 어려운 도메인이라 비용 무시 가능.
 */

type HabitKey = 'water' | 'food' | 'cosmetic' | 'exercise';

function monthBounds(today: string): { start: string; endExclusive: string } {
  // 'YYYY-MM-DD'에서 첫 7자리 = 'YYYY-MM' → 'YYYY-MM-01'
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

      // 빈도 집계 — 각 record의 라이프스타일 필드 존재 여부.
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
  if (count === null) return null; // 로딩 중에는 공간 차지 X (게이트 통과 사용자 한정 — CLS 영향 미미)

  const habitLabel = mode ? tHabits(mode as 'water' | 'food' | 'cosmetic' | 'exercise') : '—';

  return (
    <section className="rounded-[18px] bg-[color:var(--color-surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
      <p className="text-[13px] text-[color:var(--color-fg-muted)]">
        {t('monthly', { n: count, habit: habitLabel })}
      </p>
    </section>
  );
}

