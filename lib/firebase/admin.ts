import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

/**
 * Firebase Admin SDK 초기화 — 서버 전용.
 *
 * 주의:
 *  - 절대 클라이언트 번들에 포함되지 않도록 `NEXT_PUBLIC_` 접두사 환경변수 사용 금지.
 *  - Vercel Function (Node runtime) 호출당 1회 init이 보장되도록 getApps() 가드.
 *  - 환경변수 누락 시 호출 시점에 명확한 에러 throw — silent fallback 금지
 *    (실수로 잘못된 프로젝트에 쓰는 것보다 즉시 실패가 안전).
 *
 * 환경변수 (FIREBASE_ADMIN_*):
 *  - FIREBASE_ADMIN_PROJECT_ID
 *  - FIREBASE_ADMIN_CLIENT_EMAIL
 *  - FIREBASE_ADMIN_PRIVATE_KEY  // 줄바꿈은 `\n` 문자열로 escape 1줄 형태
 *
 * Storage bucket은 클라이언트와 동일한 NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET를 사용한다
 * (양쪽이 같은 버킷을 가리켜야 사진 삭제가 일관됨).
 */

const APP_NAME = 'skin-diary-admin';

function readEnv(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  storageBucket: string;
} {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  const missing: string[] = [];
  if (!projectId) missing.push('FIREBASE_ADMIN_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL');
  if (!rawPrivateKey) missing.push('FIREBASE_ADMIN_PRIVATE_KEY');
  if (!storageBucket) missing.push('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');

  if (missing.length > 0) {
    throw new Error(
      `[firebase-admin] Missing required env vars: ${missing.join(', ')}. ` +
        'Set them in .env.local (dev) or Vercel Environment Variables (Preview/Production).',
    );
  }

  return {
    projectId: projectId!,
    clientEmail: clientEmail!,
    // Vercel/GitHub Secrets에 1줄로 저장된 \n escape를 실제 개행으로 복원.
    privateKey: rawPrivateKey!.replace(/\\n/g, '\n'),
    storageBucket: storageBucket!,
  };
}

function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;

  const env = readEnv();
  return initializeApp(
    {
      credential: cert({
        projectId: env.projectId,
        clientEmail: env.clientEmail,
        privateKey: env.privateKey,
      }),
      storageBucket: env.storageBucket,
    },
    APP_NAME,
  );
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminStorage(): Storage {
  return getStorage(getAdminApp());
}
