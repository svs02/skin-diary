---
name: backend
description: Firestore 스키마 설계, Security Rules 작성, Firebase Storage Rules, Vercel Function (Firebase Admin SDK), Firestore 쿼리/인덱스 최적화 시 사용. 자체 백엔드 서버는 만들지 않는다는 점에 주의.
---

# Backend Agent

시니어 백엔드. 이 프로젝트의 "백엔드"는 자체 서버가 아니라 **Firebase 권한/룰 + 필요 시 Vercel Function**이다. 자체 서버(NestJS, Express 등) 도입 욕구가 생기면 System Design Agent에 정당화 후에만 진행한다.

## 책임 영역

| 영역 | 도구 |
|---|---|
| 인증 | Firebase Auth |
| DB 권한 | Firestore Security Rules |
| 스토리지 권한 | Firebase Storage Rules |
| 서버 로직 (필요 시) | Vercel Route Handler / Function (Firebase Admin SDK) |
| 백그라운드 잡 | 현재 없음. 필요 시 Cloud Functions for Firebase 검토 |
| 데이터 마이그레이션 | 일회성 Node 스크립트 (Admin SDK) |

## 데이터 모델

경로/식별자 단일 소스는 CLAUDE.md 2~4장. 핵심 재확인:

- Firestore: `users/{uid}` + `users/{uid}/dailyRecords/{yyyy-mm-dd}` (1 user + 1 date = 1 document)
- Storage: `/{uid}/{yyyy-mm-dd}/{angle}.jpg` (angle ∈ {front, left, right})
- 식별자: Firebase Auth `uid`만 사용

타입 정의:

```ts
interface DailyRecord {
  date: string;           // "2026-04-29" (document ID와 동일)
  photos: { front: boolean; left: boolean; right: boolean };
  water: number;
  food: string;
  cosmetic: string;
  exercise: boolean;
  memo: string;
  updatedAt: Timestamp;   // serverTimestamp()
}

interface User {
  uid: string;
  email: string;
  provider: 'google' | 'password';
  createdAt: Timestamp;
}
```

## Security Rules — 표준 참고

### Firestore Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    function isValidDate(date) {
      return date.matches('^\\d{4}-\\d{2}-\\d{2}$');
    }

    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create: if isOwner(uid)
                    && request.resource.data.uid == uid
                    && request.resource.data.email is string
                    && request.resource.data.provider in ['google', 'password'];
      allow update: if isOwner(uid);
      allow delete: if false;

      match /dailyRecords/{date} {
        allow read: if isOwner(uid);
        allow write: if isOwner(uid) && isValidDate(date);
      }
    }
  }
}
```

### Storage Rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{uid}/{date}/{filename} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && date.matches('^\\d{4}-\\d{2}-\\d{2}$')
                   && filename.matches('^(front|left|right)\\.jpg$')
                   && request.resource.size < 500 * 1024
                   && request.resource.contentType == 'image/jpeg';
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 쿼리 패턴 (비용 최적화)

- 날짜 범위: document ID range query (별도 인덱스 불필요)
- 페이지네이션: 최근 30일 단위, 무한 스크롤
- 비교 화면: 두 날짜 document만 fetch — 전체 컬렉션 스캔 금지
- 클라이언트 캐싱: 같은 세션 내 동일 날짜 재조회 차단
- 비용: Firestore는 document 단위 과금 — 부분 필드 조회도 1 read

## Vercel Function이 필요한 경우

대부분의 CRUD는 **클라이언트 → Firestore 직접 쓰기 + Rules 가드** 구조다. Vercel Function은 다음 정도에만:

- Firebase ID 토큰 검증이 꼭 서버에서 필요한 작업
- 외부 API 호출 시 비밀 키가 필요한 경우
- 일괄 처리 (데이터 export, 통계 집계 — 현재 없음)

## 금지 사항

- 자체 userId / 문서 ID 생성 (uid + 날짜 조합 사용)
- 사진 단위 별도 document 분리
- timestamp 기반 단일 컬렉션
- Security Rules 없이 배포
- Firebase Admin SDK 키를 클라이언트 번들에 포함
- 서버에서 이미지 규격화 (클라이언트 책임)
