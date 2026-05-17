import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';

/**
 * Admin-side deletion primitives shared by:
 *   - POST /api/account/delete         (user-initiated full account wipe)
 *   - POST /api/account/abandon-signup (sign-up abandoned before consent)
 *
 * The two endpoints differ in the *pre-conditions* (re-auth window vs. pending-
 * consent check) but the actual data wipe is identical, so the destructive
 * steps live here behind narrow, single-purpose helpers.
 *
 * Each helper is intentionally idempotent-safe:
 *   - deleteAllDailyRecords     no-op when the subcollection is empty
 *   - deleteUserDoc             single-document delete (no-op if missing is
 *                               not raised by Admin SDK)
 *   - deleteAllStorageObjects   force:true swallows missing-object errors
 *   - deleteAuthUser            last step; runs only after data wipe succeeds
 */

const BATCH_SIZE = 500; // Firestore batch ceiling

/**
 * users/{uid}/dailyRecords 하위 모든 문서를 BATCH_SIZE씩 삭제.
 * select() 없이 ID만 필요한 쿼리는 Admin SDK가 내부적으로 효율적으로 처리.
 *
 * 무한 루프 방지 — 비정상적으로 큰 컬렉션은 조기 차단 (실제 도메인상 365 * N년 수준).
 * 안전 상한 50,000개. 초과 시 명시적 에러로 운영자가 인지하도록 함.
 */
export async function deleteAllDailyRecords(uid: string): Promise<void> {
  const db = adminDb();
  const colRef = db.collection('users').doc(uid).collection('dailyRecords');

  let totalDeleted = 0;
  const safetyMax = 50_000;

  while (true) {
    const snap = await colRef.limit(BATCH_SIZE).get();
    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    totalDeleted += snap.size;
    if (snap.size < BATCH_SIZE) return; // 마지막 페이지

    if (totalDeleted > safetyMax) {
      throw new Error(
        `dailyRecords delete exceeded safety cap (${safetyMax}). Manual cleanup required.`,
      );
    }
  }
}

export async function deleteUserDoc(uid: string): Promise<void> {
  await adminDb().collection('users').doc(uid).delete();
}

/**
 * Storage prefix 끝 슬래시 필수 — `${uid}/` 가 없으면 동일 prefix를 가진 다른 uid
 * 까지 매칭될 위험. (Firebase uid는 충돌하지 않지만 방어적으로 명시)
 *
 * `force: true` — 객체가 이미 없거나 일부가 404여도 전체 호출을 실패시키지 않음.
 * abandon-signup 흐름에선 사진이 아예 없는 게 정상이므로 특히 중요.
 */
export async function deleteAllStorageObjects(uid: string): Promise<void> {
  const bucket = adminStorage().bucket();
  await bucket.deleteFiles({ prefix: `${uid}/`, force: true });
}

export async function deleteAuthUser(uid: string): Promise<void> {
  await adminAuth().deleteUser(uid);
}
