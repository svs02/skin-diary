/**
 * 라이프스타일 입력 작성중 데이터 localStorage 백업.
 *  - CLAUDE.md §5.4: "앱 종료 후 재진입 시 작성중 데이터 복원" 필수.
 *  - 키 네임스페이스 'sd:draft:{uid}:{yyyy-mm-dd}' — uid 격리, 날짜 단위 분리.
 *  - 정상 저장 후에는 즉시 clearLifestyleDraft 호출하여 stale 누적을 방지한다.
 *  - SSR 안전: 모든 함수가 typeof window 가드.
 *  - 직렬화 실패/스토리지 예외(quota, private mode)는 silently 무시 — 백업이 본 흐름을 막아선 안 됨.
 */

export type LifestyleDraft = {
  /** ISO8601 직렬화 시각. Firestore lifestyleSavedAt와 비교하여 더 최신을 채택. */
  updatedAt: string;
  water?: number;
  food?: string;
  cosmetic?: string;
  exercise?: boolean;
  memo?: string;
};

function buildKey(uid: string, dateKey: string): string {
  return `sd:draft:${uid}:${dateKey}`;
}

export function readLifestyleDraft(
  uid: string,
  dateKey: string,
): LifestyleDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(buildKey(uid, dateKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const draft = parsed as Partial<LifestyleDraft>;
    if (typeof draft.updatedAt !== 'string') return null;
    return {
      updatedAt: draft.updatedAt,
      water: typeof draft.water === 'number' ? draft.water : undefined,
      food: typeof draft.food === 'string' ? draft.food : undefined,
      cosmetic: typeof draft.cosmetic === 'string' ? draft.cosmetic : undefined,
      exercise: typeof draft.exercise === 'boolean' ? draft.exercise : undefined,
      memo: typeof draft.memo === 'string' ? draft.memo : undefined,
    };
  } catch {
    return null;
  }
}

export function writeLifestyleDraft(
  uid: string,
  dateKey: string,
  payload: Omit<LifestyleDraft, 'updatedAt'>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const value: LifestyleDraft = {
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(buildKey(uid, dateKey), JSON.stringify(value));
  } catch {
    // quota / private mode — 무시
  }
}

export function clearLifestyleDraft(uid: string, dateKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildKey(uid, dateKey));
  } catch {
    // ignore
  }
}

/**
 * draft.updatedAt이 Firestore lifestyleSavedAt보다 신선한지 판단.
 *  - lifestyleSavedAt이 null(미저장)이면 draft가 무조건 우선.
 *  - 두 값이 같거나 Firestore가 더 최신이면 false.
 */
export function isDraftFresher(
  draft: LifestyleDraft,
  serverSavedAt: Date | null,
): boolean {
  if (!serverSavedAt) return true;
  const draftTime = Date.parse(draft.updatedAt);
  if (Number.isNaN(draftTime)) return false;
  return draftTime > serverSavedAt.getTime();
}
