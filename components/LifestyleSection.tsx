'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveDailyRecord, type SaveDailyRecordInput } from '@/lib/firebase/dailyRecord';
import { isFuture } from '@/lib/utils/dateKey';
import {
  clearLifestyleDraft,
  isDraftFresher,
  readLifestyleDraft,
  writeLifestyleDraft,
} from '@/lib/draft/lifestyleDraft';
import type { DailyRecord } from '@/types';

type FormValues = SaveDailyRecordInput & {
  water: number;
  food: string;
  cosmetic: string;
  exercise: boolean;
  memo: string;
};

function valuesFromRecord(record: DailyRecord | null): FormValues {
  return {
    water: record?.water ?? 0,
    food: record?.food ?? '',
    cosmetic: record?.cosmetic ?? '',
    exercise: record?.exercise ?? false,
    memo: record?.memo ?? '',
  };
}

/**
 * 라이프스타일 5개 필드 입력 + 저장. 저장 후 view 모드로 전환되며 "수정" 버튼으로 재진입.
 * 모드 초기값은 record.lifestyleSavedAt 유무로 결정 — 사진만 업로드된 상태(라이프스타일 미저장)는
 * markPhotoUploaded가 만든 default 0/'' 값이므로 폼 모드로 시작.
 */
export function LifestyleSection({
  uid,
  dateKey,
  record,
  onSaved,
}: {
  uid: string;
  dateKey: string;
  record: DailyRecord | null;
  onSaved: () => void | Promise<void>;
}) {
  const tCommon = useTranslations('common');
  const tRecorded = useTranslations('record.recorded');
  const tForm = useTranslations('record.lifestyle');

  const future = isFuture(dateKey);

  // 초기 모드/값 결정 — draft가 Firestore보다 신선하면 draft 적용 + 자동 edit 모드.
  // draft 조회는 localStorage 동기 호출이라 useState 초기값에서 안전 (typeof window 가드 내장).
  // 미래 날짜는 draft 로직 자체를 건너뜀.
  const initial = (() => {
    const base = valuesFromRecord(record);
    if (future) return { values: base, fromDraft: false };
    const draft = readLifestyleDraft(uid, dateKey);
    if (draft && isDraftFresher(draft, record?.lifestyleSavedAt ?? null)) {
      return {
        values: {
          water: draft.water ?? base.water,
          food: draft.food ?? base.food,
          cosmetic: draft.cosmetic ?? base.cosmetic,
          exercise: draft.exercise ?? base.exercise,
          memo: draft.memo ?? base.memo,
        },
        fromDraft: true,
      };
    }
    return { values: base, fromDraft: false };
  })();

  const [mode, setMode] = useState<'view' | 'edit'>(
    initial.fromDraft || !record?.lifestyleSavedAt ? 'edit' : 'view',
  );
  const [values, setValues] = useState<FormValues>(initial.values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce 1s — 입력이 잦은 동안에는 마지막 한 번만 직렬화·저장한다.
  // edit 모드에서 사용자가 실제로 만진 경우에만 작동: hasDirtyRef로 mount 시 1회 호출 차단.
  const hasDirtyRef = useRef(false);
  useEffect(() => {
    if (future) return;
    if (mode !== 'edit') return;
    if (!hasDirtyRef.current) {
      hasDirtyRef.current = true;
      return;
    }
    const id = window.setTimeout(() => {
      writeLifestyleDraft(uid, dateKey, {
        water: values.water,
        food: values.food,
        cosmetic: values.cosmetic,
        exercise: values.exercise,
        memo: values.memo,
      });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [values, uid, dateKey, mode, future]);

  function enterEdit() {
    setValues(valuesFromRecord(record));
    setError(null);
    setMode('edit');
    // 사용자 명시적 edit — 다음 변경부터 draft 저장 활성화
    hasDirtyRef.current = false;
  }

  async function handleSave() {
    if (saving) return;
    if (future) return; // CLAUDE.md §5.5 — 호출부 한 번 더 가드
    setSaving(true);
    setError(null);
    try {
      await saveDailyRecord(uid, dateKey, values);
      // 정상 저장 직후 draft 제거 — stale 누적 방지
      clearLifestyleDraft(uid, dateKey);
      await onSaved();
      setMode('view');
    } catch {
      setError(tForm('saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[18px] bg-surface p-5 shadow-sm">
      <header className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">{tRecorded('lifestyle')}</h2>
        {mode === 'view' && (
          <button
            type="button"
            onClick={enterEdit}
            className="rounded-full bg-accent-dim px-3 py-1 text-[12px] font-semibold text-[color:var(--color-accent-text)]"
          >
            {tForm('editButton')}
          </button>
        )}
      </header>

      {mode === 'view' && record && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Field label={tRecorded('water')} value={`${record.water}`} />
          <Field
            label={tRecorded('exercise')}
            value={record.exercise ? tRecorded('exerciseYes') : tRecorded('exerciseNo')}
          />
          <Field label={tRecorded('food')} value={record.food || '—'} />
          <Field label={tRecorded('cosmetic')} value={record.cosmetic || '—'} />
          {record.memo && (
            <div className="col-span-2 mt-1 rounded-[12px] bg-surface-2 p-3 text-[13px] text-fg-muted">
              {record.memo}
            </div>
          )}
        </dl>
      )}

      {mode === 'edit' && (
        <div className="mt-4 flex flex-col gap-5">
          {/* Water — slider + big number */}
          <div className="flex flex-col gap-2">
            <FieldLabel>{tRecorded('water')}</FieldLabel>
            <div className="flex items-baseline gap-2">
              <span
                className="font-bold leading-none text-fg"
                style={{ fontFamily: 'var(--font-display)', fontSize: 48 }}
              >
                {values.water}
              </span>
              <span className="text-[13px] text-fg-muted">{tForm('cups')}</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={values.water}
              onChange={(e) =>
                setValues((p) => ({ ...p, water: Number(e.target.value) }))
              }
              className="w-full"
              style={{ accentColor: 'var(--color-accent)' }}
              aria-label={tRecorded('water')}
            />
          </div>

          {/* Food */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>{tRecorded('food')}</FieldLabel>
            <TextInput
              value={values.food}
              maxLength={120}
              placeholder={tForm('foodPlaceholder')}
              onChange={(v) => setValues((p) => ({ ...p, food: v }))}
            />
          </div>

          {/* Cosmetic */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>{tRecorded('cosmetic')}</FieldLabel>
            <TextInput
              value={values.cosmetic}
              maxLength={120}
              placeholder={tForm('cosmeticPlaceholder')}
              onChange={(v) => setValues((p) => ({ ...p, cosmetic: v }))}
            />
          </div>

          {/* Exercise */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>{tRecorded('exercise')}</FieldLabel>
            <div className="flex gap-2">
              <ToggleChip
                active={values.exercise === true}
                onClick={() => setValues((p) => ({ ...p, exercise: true }))}
              >
                {tRecorded('exerciseYes')}
              </ToggleChip>
              <ToggleChip
                active={values.exercise === false}
                onClick={() => setValues((p) => ({ ...p, exercise: false }))}
              >
                {tRecorded('exerciseNo')}
              </ToggleChip>
            </div>
          </div>

          {/* Memo */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>{tRecorded('memo')}</FieldLabel>
            <textarea
              value={values.memo}
              maxLength={500}
              rows={3}
              placeholder={tForm('memoPlaceholder')}
              onChange={(e) => setValues((p) => ({ ...p, memo: e.target.value }))}
              className="w-full resize-none rounded-[12px] border border-[color:var(--color-border)] bg-surface-2 px-3 py-2.5 text-[14px] leading-relaxed text-fg placeholder:text-fg-subtle focus:border-[color:var(--color-accent)] focus:outline-none"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-[13px] text-[color:var(--color-danger,#ef4444)]"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving || undefined}
            className="mt-1 inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--color-accent)] px-6 text-[14px] font-semibold text-white shadow-sm transition-opacity disabled:opacity-60"
          >
            {saving ? tCommon('saving') : tCommon('save')}
          </button>
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
      {children}
    </span>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[12px] border border-[color:var(--color-border)] bg-surface-2 px-3 py-2.5 text-[14px] text-fg placeholder:text-fg-subtle focus:border-[color:var(--color-accent)] focus:outline-none"
    />
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? 'bg-accent-dim text-[color:var(--color-accent-text)]'
          : 'bg-surface-2 text-fg-muted'
      }`}
    >
      {children}
    </button>
  );
}
