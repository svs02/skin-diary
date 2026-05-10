import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export const isFirebaseConfigured = !!apiKey;

if (!isFirebaseConfigured && typeof window !== 'undefined') {
  // 사용자 환경 변수 미설정 — 콘솔에 안내 한 번 출력 (실제 호출은 실패).
  console.warn(
    '[firebase] NEXT_PUBLIC_FIREBASE_* env vars are missing. Auth/Firestore calls will fail until .env.local is filled in.',
  );
}

const firebaseConfig = {
  apiKey: apiKey ?? 'AIza-DEV-PLACEHOLDER',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'localhost',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'dev-placeholder',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'dev-placeholder.appspot.com',
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:000:web:000',
};

const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export { app };
