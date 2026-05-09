import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Provider } from '@/types';

interface EnsureUserDocInput {
  uid: string;
  email: string | null;
  provider: Provider;
}

export async function ensureUserDoc({ uid, email, provider }: EnsureUserDocInput): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    uid,
    email: email ?? '',
    provider,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
