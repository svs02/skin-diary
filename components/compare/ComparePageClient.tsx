'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useRecent60 } from '@/components/overview/useOverviewData';
import { isFuture, isValidDateKey } from '@/lib/utils/dateKey';
import { ANGLE_ORDER, pickComparePair } from '@/lib/utils/comparePair';
import { useCompareData } from '@/hooks/useCompareData';
import type { Angle } from '@/types';
import { CompareHeader } from './CompareHeader';
import { CompareView } from './CompareView';
import { EditSheet, type SheetMode } from './EditSheet';
import { MetaToggle } from './MetaToggle';
import { MetaCompare } from './MetaCompare';

type State = {
  fromKey: string;
  toKey: string;
  angle: Angle;
  sheetMode: SheetMode;
  metaOpen: boolean;
};

type Action =
  | { type: 'init'; from: string; to: string; angle: Angle }
  | { type: 'setAngle'; angle: Angle }
  | { type: 'setDate'; which: 'from' | 'to'; dateKey: string }
  | { type: 'openSheet'; mode: Exclude<SheetMode, null> }
  | { type: 'closeSheet' }
  | { type: 'toggleMeta'; open: boolean };

function isAngle(value: string): value is Angle {
  return (ANGLE_ORDER as readonly string[]).includes(value);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'init': {
      let from = action.from;
      let to = action.to;
      if (from > to) {
        [from, to] = [to, from];
      }
      return { ...state, fromKey: from, toKey: to, angle: action.angle };
    }
    case 'setAngle':
      return { ...state, angle: action.angle };
    case 'setDate': {
      let from = state.fromKey;
      let to = state.toKey;
      if (action.which === 'from') from = action.dateKey;
      else to = action.dateKey;
      if (from > to) {
        [from, to] = [to, from];
      }
      return { ...state, fromKey: from, toKey: to };
    }
    case 'openSheet':
      return { ...state, sheetMode: action.mode };
    case 'closeSheet':
      return { ...state, sheetMode: null };
    case 'toggleMeta':
      return { ...state, metaOpen: action.open };
  }
}

export default function ComparePageClient() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const router = useRouter();
  const sp = useSearchParams();
  const { data: recent } = useRecent60();

  // 쿼리 파싱
  const qFrom = sp.get('from');
  const qTo = sp.get('to');
  const qAngle = sp.get('angle');
  const qFromValid = qFrom && isValidDateKey(qFrom) && !isFuture(qFrom) ? qFrom : null;
  const qToValid = qTo && isValidDateKey(qTo) && !isFuture(qTo) ? qTo : null;
  const qAngleValid = qAngle && isAngle(qAngle) ? (qAngle as Angle) : null;

  // recent60에서 페어 fallback (사진 ≤1건이면 null)
  const fallbackPair = useMemo(() => {
    if (!recent) return null;
    return pickComparePair(recent, { minGapDays: 0 });
  }, [recent]);

  const initialFrom = qFromValid ?? fallbackPair?.from.date ?? '';
  const initialTo = qToValid ?? fallbackPair?.to.date ?? '';
  const initialAngle: Angle = qAngleValid ?? fallbackPair?.angle ?? 'front';

  const [state, dispatch] = useReducer(reducer, {
    fromKey: initialFrom,
    toKey: initialTo,
    angle: initialAngle,
    sheetMode: null,
    metaOpen: false,
  });

  // 진입 동기화 — recent 로드 직후 한 번 init
  const initedRef = useRef(false);
  useEffect(() => {
    if (initedRef.current) return;
    if (!recent) return;
    const f = qFromValid ?? fallbackPair?.from.date ?? null;
    const tk = qToValid ?? fallbackPair?.to.date ?? null;
    const a = qAngleValid ?? fallbackPair?.angle ?? 'front';
    if (f && tk) {
      dispatch({ type: 'init', from: f, to: tk, angle: a });
      initedRef.current = true;
    }
  }, [recent, qFromValid, qToValid, qAngleValid, fallbackPair]);

  // URL 동기화 (state 변경 시 router.replace)
  useEffect(() => {
    if (!state.fromKey || !state.toKey) return;
    const url = `/compare?from=${state.fromKey}&to=${state.toKey}&angle=${state.angle}`;
    const current = `?from=${qFrom ?? ''}&to=${qTo ?? ''}&angle=${qAngle ?? ''}`;
    const next = `?from=${state.fromKey}&to=${state.toKey}&angle=${state.angle}`;
    if (current !== next) {
      router.replace(url, { scroll: false });
    }
    // qFrom/qTo/qAngle를 deps에 넣으면 무한 루프 위험 → 의도적으로 빼고 일치 비교만 사용.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fromKey, state.toKey, state.angle]);

  // 데이터 로드 — 빈 문자열은 hook 내부에서 자동으로 비활성 처리.
  const compare = useCompareData(uid, state.fromKey, state.toKey, state.angle);

  // sheet 트리거 element 보관 (포커스 반환용)
  const triggerElRef = useRef<HTMLElement | null>(null);
  function openSheet(mode: Exclude<SheetMode, null>, el: HTMLElement | null) {
    triggerElRef.current = el;
    dispatch({ type: 'openSheet', mode });
  }

  // ---- 빈 상태: recent 로드 후 사진 ≤1건 ----
  if (recent && (!state.fromKey || !state.toKey || !fallbackPair) && !qFromValid && !qToValid) {
    if (!fallbackPair) {
      return <EmptyNoPhoto />;
    }
  }

  if (!state.fromKey || !state.toKey) {
    // 아직 init 전: 가벼운 로딩 placeholder
    return (
      <div className="flex flex-col gap-4 pt-2">
        <div className="h-14" />
        <div className="aspect-square w-full animate-pulse rounded-[var(--radius-lg)] bg-[color:var(--color-surface-2)]" />
      </div>
    );
  }

  const splitHidden = state.fromKey === state.toKey;

  const fromPhotos = compare.records.from?.photos ?? { front: false, left: false, right: false };
  const toPhotos = compare.records.to?.photos ?? { front: false, left: false, right: false };

  const bothNoUrl =
    compare.urls.from == null && compare.urls.to == null && !compare.isLoading;

  return (
    <div className="flex flex-col gap-5">
      <CompareHeader
        angle={state.angle}
        fromKey={state.fromKey}
        toKey={state.toKey}
        activeMode={state.sheetMode}
        openSheet={openSheet}
      />

      {bothNoUrl ? (
        <EmptyNoPhoto inline />
      ) : (
        <CompareView
          fromUrl={compare.urls.from}
          toUrl={compare.urls.to}
          fromDate={state.fromKey}
          toDate={state.toKey}
          angle={state.angle}
          splitHidden={splitHidden}
        />
      )}

      <MetaToggle
        open={state.metaOpen}
        onOpenChange={(open) => dispatch({ type: 'toggleMeta', open })}
      >
        <MetaCompare
          fromRecord={compare.records.from}
          toRecord={compare.records.to}
          fromDate={state.fromKey}
          toDate={state.toKey}
        />
      </MetaToggle>

      <EditSheet
        mode={state.sheetMode}
        uid={uid}
        fromKey={state.fromKey}
        toKey={state.toKey}
        angle={state.angle}
        fromPhotos={fromPhotos}
        toPhotos={toPhotos}
        onClose={() => dispatch({ type: 'closeSheet' })}
        onAngleChange={(a) => dispatch({ type: 'setAngle', angle: a })}
        onDateChange={(which, dateKey) => dispatch({ type: 'setDate', which, dateKey })}
        returnFocusRef={triggerElRef}
      />
    </div>
  );
}

function EmptyNoPhoto({ inline }: { inline?: boolean }) {
  const t = useTranslations('compare');
  return (
    <section
      className={`flex flex-col items-center gap-3 rounded-[var(--radius-lg)] bg-[color:var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)] ${
        inline ? '' : 'mt-6'
      }`}
    >
      <p className="text-[15px] font-semibold text-[color:var(--color-fg)]">
        {t('empty.noPhoto')}
      </p>
      <p className="text-[13px] text-[color:var(--color-fg-muted)]">
        {t('empty.noPhotoHint')}
      </p>
      <Link
        href="/calendar"
        className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-4 text-[13px] font-semibold text-[color:var(--color-accent-text)]"
      >
        {t('empty.calendarCta')}
      </Link>
    </section>
  );
}
