# Firebase 프로젝트 셋업 가이드

이 문서는 Skin Diary가 동작하려면 사용자가 **Firebase 콘솔에서 직접** 해야 하는 일회성 설정을 단계별로 안내한다. 끝까지 마치면 `.env.local`이 채워져 앱이 실제로 로그인/저장까지 동작한다.

소요 시간: 약 10분.

---

## 0. 사전 준비
- Google 계정 (Firebase 콘솔 로그인용)
- 결제 카드 **불필요** — Spark(무료) 플랜으로 시작.

---

## 1. Firebase 프로젝트 생성

1. https://console.firebase.google.com 접속.
2. **프로젝트 추가** 클릭.
3. **프로젝트 이름**: `skin-diary-dev` (개발용 권장. 운영용은 나중에 별도 프로젝트로 분리).
4. **Google Analytics 사용 설정** 토글 ON → 다음 → 기본 GA 계정 선택(없으면 자동 생성) → **프로젝트 만들기**.
5. 완료 대기.

> 운영 분리 원칙: 실서비스 시작 시 `skin-diary-prod`를 새로 만들어 환경 분리. 본 가이드는 dev만 다룸.

> Analytics는 자동 페이지 뷰 + 향후 커스텀 이벤트(`photo_uploaded`, `record_saved` 등) 기록에 사용. 코드에서 `lib/firebase/analytics.ts`가 SSR-안전 가드와 함께 자동 초기화하므로 환경 변수만 채우면 동작.

---

## 2. Authentication 활성화

좌측 메뉴 **빌드 → Authentication → 시작하기**.

### 2-1. Google 제공업체
1. **Sign-in method** 탭 → **Google** 선택.
2. **사용 설정** 토글 ON.
3. **프로젝트 지원 이메일**: 본인 Google 계정 이메일 선택.
4. **저장**.

### 2-2. 이메일/비밀번호 제공업체
1. 같은 **Sign-in method** 탭 → **이메일/비밀번호** 선택.
2. **이메일/비밀번호** 토글 ON. (이메일 링크 옵션은 OFF로 둠.)
3. **저장**.

### 2-3. 승인된 도메인 확인
- **Settings** 탭 → **승인된 도메인**에 `localhost` 가 있는지 확인 (기본 포함).
- 나중에 Vercel 배포 시 거기 도메인을 여기에 추가해야 함.

---

## 3. Firestore Database 생성

좌측 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**.

1. **위치**: `us-west1 (Oregon)` 선택 (밴쿠버 기준 가장 가까운 GCP 리전, ~30ms).
   - ⚠️ 위치는 **한 번 정하면 변경 불가**. 신중히.
2. 시작 모드: **프로덕션 모드에서 시작** 선택.
3. **사용 설정** → 생성 완료 대기.

### 3-1. Security Rules 적용
**규칙** 탭 → 아래 내용으로 **전체 교체** → **게시**.

```js
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

      // 일별 기록: 본인 + 날짜 형식 검증.
      match /dailyRecords/{date} {
        allow read:  if isOwner(uid);
        allow write: if isOwner(uid) && isValidDate(date);
      }
    }
  }
}
```

> 이 규칙이 데이터 보호의 실제 방어선이다. Next.js 코드는 단지 사용자 편의 레이어일 뿐, 보안 경계는 여기서 결정된다.
> `isValidDate`로 비표준 문서 ID(`abcd`, `2026-13-99` 등)를 차단한다. 미래 날짜 차단은 클라이언트 UX(달력 비활성화 + 라우트 가드)로 수행 — 타임존 차이로 Rules의 `request.time`(UTC) 검증은 정상 사용을 막을 수 있어 의도적으로 제외했다 (`DESIGN.md §2.2 결정`).

---

## 4. Storage 생성

좌측 메뉴 **빌드 → Storage → 시작하기**.

1. **위치**: Firestore와 **동일 리전** (`us-west1`).
2. 시작 모드: **프로덕션 모드에서 시작**.
3. **완료**.

### 4-1. Storage Rules 적용
**Rules** 탭 → 아래 내용으로 **전체 교체** → **게시**.

```js
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // /{uid}/{yyyy-mm-dd}/{front|left|right}.jpg
    match /{uid}/{date}/{filename} {
      allow read:   if request.auth != null && request.auth.uid == uid;
      allow write:  if request.auth != null
                    && request.auth.uid == uid
                    && date.matches('^\\d{4}-\\d{2}-\\d{2}$')
                    && filename.matches('^(front|left|right)\\.jpg$')
                    && request.resource.size < 500 * 1024            // 500KB 상한 (클라 정규화 우회 차단)
                    && request.resource.contentType == 'image/jpeg';
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

> CLAUDE.md §1.2(1024×1024 JPG, 품질 0.82)와 §2(파일 네이밍 규칙)를 룰 레벨에서 강제한다. 클라이언트 정규화 라이브러리(`lib/image/normalize.ts`)와 이중 방어.
>
> **앵커 정규식(`^...$`)**: `front.jpgABC` 같은 우회 차단.
> **500KB 한계**: 1024×1024 JPG 0.82는 ~200~400KB. 500KB가 우회 마지노선.

---

## 5. 웹 앱 등록 + 환경 변수 가져오기

1. 프로젝트 홈(콘솔 좌측 상단 톱니바퀴 → **프로젝트 설정**) 진입.
2. **일반** 탭 하단 **앱** 섹션 → **`</>`(웹) 아이콘** 클릭.
3. 앱 닉네임: `skin-diary-web` (자유).
4. **Firebase Hosting 사용 안 함** (Vercel 사용 예정).
5. **앱 등록** → 다음 화면에서 **firebaseConfig 객체**가 표시됨 (Analytics 활성화한 프로젝트는 `measurementId`도 함께 노출):
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "skin-diary-dev.firebaseapp.com",
     projectId: "skin-diary-dev",
     storageBucket: "skin-diary-dev.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef...",
     measurementId: "G-XXXXXXXXXX"
   };
   ```
6. 이 값들을 메모.

### 5-1. `.env.local` 작성

프로젝트 루트(`/Users/admin/Desktop/PP/skin_diary/`)에 `.env.local` 파일 생성. `.env.local.example`을 복사해 다음과 같이 채운다:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...                          # apiKey
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=skin-diary-dev.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=skin-diary-dev
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=skin-diary-dev.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX              # measurementId (Analytics 활성화 시)
```

> ⚠️ `.env.local`은 `.gitignore`에 이미 포함되어 있다 — git 커밋 금지. 노출되어도 Security Rules가 방어선이지만 그래도 굳이 노출하지 말 것.

---

## 6. 검증 (앱이 실제로 동작하는지)

```bash
pnpm dev
```

브라우저에서 http://localhost:3000 접속 후 다음 시나리오를 모두 통과하면 셋업 완료.

| # | 동작 | 기대 결과 |
|---|------|-----------|
| 1 | 첫 진입 | `/login`으로 자동 이동 |
| 2 | "Continue with Google" 클릭 | Google 팝업 → 인증 후 `/today` → `/record/{오늘}`로 redirect |
| 3 | Firebase 콘솔 → Authentication → **Users** 탭 | 방금 로그인한 계정이 목록에 있음 |
| 4 | Firebase 콘솔 → Firestore → 데이터 | `users/{uid}` 문서가 자동 생성되어 있음 |
| 5 | 로그아웃 후 이메일/비밀번호로 신규 가입 | `users/{새 uid}` 문서, `provider: "password"` 확인 |
| 6 | Firestore에서 수동으로 `users/{uid}/dailyRecords/2026-05-08` 문서 생성 | `/today` 새로고침 시 1B(기록 완료) 화면으로 변경 |
| 7 | 그 문서 삭제 후 새로고침 | 1A(빈 상태) 화면으로 복귀 |
| 8 | `/calendar` 진입 후 미래 날짜 셀 탭 | 비활성화(반응 없음, screen reader가 "기록 불가" 안내) |
| 9 | 주소창에 `/record/2099-01-01` 직접 입력 | `/calendar`로 redirect |
| 10 | 캘린더에서 3일 전 날짜 선택 → 빈 기록 화면 진입 | URL이 `/record/{과거 dateKey}`이고 입력/저장 가능 |

---

## 7. 자주 만나는 오류

**`auth/unauthorized-domain`**
- Authentication → Settings → 승인된 도메인에 `localhost` 추가.

**Google 로그인 팝업이 즉시 닫힘**
- 브라우저 팝업 차단 해제.
- Safari iOS는 popup이 막히는 경우가 많음 → `signInWithRedirect` 폴백이 필요할 수 있음(다음 스프린트에서 추가).

**`Missing or insufficient permissions` (Firestore 쓰기 시)**
- §3-1 규칙이 게시되었는지, `request.auth.uid`가 문서 ID와 일치하는지 확인.

**`.env.local` 변경했는데 반영 안 됨**
- `pnpm dev` 프로세스를 **반드시 재시작**. Next.js는 환경 변수를 부팅 시점에 읽음.

---

## 8. 요약 체크리스트

- [ ] 프로젝트 생성 (`skin-diary-dev`)
- [ ] Authentication: Google + 이메일/비밀번호 활성화
- [ ] Firestore Database 생성 (`us-west1`) + Rules 게시
- [ ] Storage 생성 (`us-west1`) + Rules 게시
- [ ] 웹 앱 등록 + firebaseConfig 6개 값 확보
- [ ] `.env.local` 작성
- [ ] `pnpm dev` → §6 시나리오 7개 통과

여기까지 완료하면 Sprint 1의 E2E 검증이 끝나고, 다음 스프린트(사진 촬영 + 업로드)로 진행 가능.
