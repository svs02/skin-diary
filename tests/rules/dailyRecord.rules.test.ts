import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Firestore Rules smoke test — verifies the core ownership invariant on
 * `users/{uid}/dailyRecords/{date}`:
 *   - owner can create/update their own record
 *   - non-owners and unauthenticated requests are denied
 *
 * Requires the Firebase Emulator running on port 8080. Start with `pnpm emulators`
 * in a separate shell, then `pnpm test:rules`.
 *
 * If you see "ECONNREFUSED 127.0.0.1:8080" the emulator isn't running — see the
 * README "Testing" section.
 */

const PROJECT_ID = 'skin-diary-rules-test';
const RULES_PATH = path.resolve(__dirname, '../../firestore.rules');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const TODAY = '2026-05-17';

function buildRecord() {
  return {
    date: TODAY,
    photos: { front: false, left: false, right: false },
    updatedAt: new Date(),
  };
}

async function seedOwnerWithConsent(uid: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      uid,
      email: `${uid}@example.test`,
      provider: 'password',
      termsVersion: '2026-05-09',
      privacyVersion: '2026-05-09',
      sensitivePhotoVersion: '2026-05-09',
      ageConfirmed: true,
      termsAgreedAt: new Date(),
      privacyAgreedAt: new Date(),
      sensitivePhotoAgreedAt: new Date(),
      ageConfirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
}

describe('firestore.rules — users/{uid}/dailyRecords', () => {
  it('owner with full consent can create their own record', async () => {
    const uid = 'alice';
    await seedOwnerWithConsent(uid);
    const db = testEnv
      .authenticatedContext(uid, { email: `${uid}@example.test` })
      .firestore();
    await assertSucceeds(
      setDoc(doc(db, `users/${uid}/dailyRecords/${TODAY}`), buildRecord()),
    );
  });

  it('non-owner cannot read another user’s record', async () => {
    const owner = 'alice';
    const intruder = 'mallory';
    await seedOwnerWithConsent(owner);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${owner}/dailyRecords/${TODAY}`),
        buildRecord(),
      );
    });
    const db = testEnv
      .authenticatedContext(intruder, { email: `${intruder}@example.test` })
      .firestore();
    await assertFails(getDoc(doc(db, `users/${owner}/dailyRecords/${TODAY}`)));
  });

  it('unauthenticated request cannot read any record', async () => {
    const owner = 'alice';
    await seedOwnerWithConsent(owner);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${owner}/dailyRecords/${TODAY}`),
        buildRecord(),
      );
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `users/${owner}/dailyRecords/${TODAY}`)));
  });

  it('owner cannot write a record at another user’s path', async () => {
    const uid = 'alice';
    await seedOwnerWithConsent(uid);
    const db = testEnv
      .authenticatedContext(uid, { email: `${uid}@example.test` })
      .firestore();
    await assertFails(
      setDoc(doc(db, `users/bob/dailyRecords/${TODAY}`), buildRecord()),
    );
  });

  it('rateLimits collection is locked to clients', async () => {
    const uid = 'alice';
    await seedOwnerWithConsent(uid);
    const db = testEnv
      .authenticatedContext(uid, { email: `${uid}@example.test` })
      .firestore();
    await assertFails(
      getDoc(doc(db, `rateLimits/auditPhoto_${uid}_1`)),
    );
    await assertFails(
      setDoc(doc(db, `rateLimits/auditPhoto_${uid}_1`), { count: 1 }),
    );
  });
});
