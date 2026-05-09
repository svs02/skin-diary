import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Angle, DailyRecord } from '@/types';

function recordRef(uid: string, dateKey: string) {
  return doc(db, 'users', uid, 'dailyRecords', dateKey);
}

function recordsCol(uid: string) {
  return collection(db, 'users', uid, 'dailyRecords');
}

/**
 * 범위 쿼리 결과 한 항목. dateKey + photos 메타.
 * Overview 21-dot strip / Streak 계산 / Compare 페어링이 단일 메타 쿼리로 동작하도록
 * photos 플래그까지 함께 반환한다 (CLAUDE.md §1.2 — front/left/right 3각도 고정).
 */
export type RecordRangeItem = {
  date: string; // yyyy-mm-dd
  photos: {
    front: boolean;
    left: boolean;
    right: boolean;
  };
};

/**
 * 지정 범위 내 기록이 있는 항목들을 dateKey 오름차순으로 반환.
 *  - documentId() 범위 쿼리 유지 (CLAUDE.md §4.2 경로 그대로).
 *  - photos 메타가 필요하므로 ID-only projection이 아니라 doc body를 읽는다.
 *    60일 윈도우 기준 최대 60건이라 비용 영향은 무시 수준.
 *  - photos 누락 데이터(과거 raw)는 false로 호환.
 * @param uid 사용자 uid
 * @param startKey 'YYYY-MM-DD' 시작일 (포함)
 * @param endKeyExclusive 'YYYY-MM-DD' 종료일 (배타적)
 */
export async function listRecordKeysInRange(
  uid: string,
  startKey: string,
  endKeyExclusive: string,
): Promise<RecordRangeItem[]> {
  const q = query(
    recordsCol(uid),
    where(documentId(), '>=', startKey),
    where(documentId(), '<', endKeyExclusive),
    orderBy(documentId()),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      date: d.id,
      photos: {
        front: data?.photos?.front ?? false,
        left: data?.photos?.left ?? false,
        right: data?.photos?.right ?? false,
      },
    };
  });
}

export async function getDailyRecord(
  uid: string,
  dateKey: string,
): Promise<DailyRecord | null> {
  const snap = await getDoc(recordRef(uid, dateKey));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    date: dateKey,
    photos: {
      front: data.photos?.front ?? false,
      left: data.photos?.left ?? false,
      right: data.photos?.right ?? false,
    },
    water: data.water ?? 0,
    food: data.food ?? '',
    cosmetic: data.cosmetic ?? '',
    exercise: data.exercise ?? false,
    memo: data.memo ?? '',
    isDraft: data.isDraft,
    lifestyleSavedAt: data.lifestyleSavedAt?.toDate?.() ?? null,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  };
}

export type SaveDailyRecordInput = Partial<
  Omit<DailyRecord, 'date' | 'lifestyleSavedAt' | 'createdAt' | 'updatedAt'>
>;

/**
 * 사진 업로드 후 photos.{angle} 플래그만 갱신. createdAt은 보존한다.
 *  - 문서 존재: updateDoc + 닷 표기로 부분 갱신 (createdAt 미터치)
 *  - 문서 미존재: setDoc으로 초기 shape 작성
 * Sprint 2a 진입점. saveDailyRecord(라이프스타일)와 책임 분리.
 */
export async function markPhotoUploaded(
  uid: string,
  dateKey: string,
  angle: Angle,
): Promise<void> {
  const ref = recordRef(uid, dateKey);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await updateDoc(ref, {
      [`photos.${angle}`]: true,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(ref, {
    date: dateKey,
    photos: {
      front: false,
      left: false,
      right: false,
      [angle]: true,
    },
    water: 0,
    food: '',
    cosmetic: '',
    exercise: false,
    memo: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * 라이프스타일 폼 저장. createdAt 보존(merge:true에 createdAt까지 명시하면 매번 갱신되는 버그를
 * 피하기 위해 markPhotoUploaded와 동일하게 존재/미존재 분기).
 *  - 문서 존재: updateDoc — createdAt 미터치, lifestyleSavedAt/updatedAt만 갱신
 *  - 문서 미존재: setDoc — 초기 shape + partial + createdAt
 */
export async function saveDailyRecord(
  uid: string,
  dateKey: string,
  partial: SaveDailyRecordInput,
): Promise<void> {
  const ref = recordRef(uid, dateKey);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await updateDoc(ref, {
      ...partial,
      lifestyleSavedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(ref, {
    date: dateKey,
    photos: { front: false, left: false, right: false },
    water: 0,
    food: '',
    cosmetic: '',
    exercise: false,
    memo: '',
    ...partial,
    lifestyleSavedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
