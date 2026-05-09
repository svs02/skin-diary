# Skin Diary - Integrated Design Document (Production-Ready)

## Context

Skin Diary는 피부 상태를 사진과 생활습관으로 기록하고, 날짜별 비교를 통해 변화를 추적하는 모바일 퍼스트 앱이다. AI 분석이 아닌 **"기록 + 비교"**에 집중한다. Web(Next.js)을 MVP로 시작하고 Android, iOS는 별도 프로젝트로 확장한다.

CLAUDE.md에 정의된 핵심 제약사항(이미지 1:1/1024px, Firebase Auth uid 단일 식별자, 날짜 단위 document 구조, 모바일 기준 UX)을 절대 위반하지 않는다. 기술 스택과 운영 표준은 `.claude/agents/*.md` (System Design / Frontend / Backend / Design / DevOps / Security / QA)를 단일 출처로 한다.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────┐
│         Client (Next.js + React, on Vercel)     │
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Firebase  │ │ Image     │ │ Draft         │  │
│  │ Auth SDK  │ │ Processor │ │ (localStorage │  │
│  │           │ │ (canvas)  │ │  + Firestore) │  │
│  └─────┬─────┘ └─────┬─────┘ └───────┬───────┘  │
│        │              │               │          │
└────────┼──────────────┼───────────────┼──────────┘
         │              │               │
    ┌────▼────┐   ┌─────▼─────┐  ┌──────▼──────┐
    │Firebase │   │ Firebase  │  │  Firestore  │
    │  Auth   │   │ Storage   │  │             │
    └─────────┘   └───────────┘  └─────────────┘

   (Phase 2) Vercel Function (Firebase Admin SDK)
            ─ 토큰 검증, 외부 API 등 필요 시점에 도입
```

### 핵심 설계 원칙
- **서버리스 BaaS 우선**: Firebase 서비스만 사용, 자체 백엔드 서버 없음
- **클라이언트 중심 처리**: 이미지 리사이즈/EXIF 제거는 클라이언트에서 수행 (서버는 원본을 신뢰하지 않음)
- **이중 저장 draft**: localStorage(즉시 UX) + Firestore draft(영속성)로 작성 중 데이터 보존
- **Vercel + Firebase**: 호스팅과 BaaS 두 곳만 운영

### 기술 스택 확정

| Layer | Technology | 용도 |
|-------|-----------|------|
| Hosting | **Vercel** | Production / Preview / Local |
| Framework | **Next.js (App Router)** | React + Server Components + Route Handlers |
| Language | **TypeScript (strict)** | 타입 안정성 |
| Routing | Next.js App Router | 파일 기반 라우팅 |
| State | React Context + Hooks | 가벼운 상태관리 |
| Draft | localStorage + Firestore | 작성 중 데이터 이중 저장 |
| Auth | Firebase Auth | Google OAuth + Email/PW |
| DB | Firestore | dailyRecords 저장 |
| Storage | Firebase Storage | 사진 저장 |
| Image | Canvas API (`createImageBitmap`) | 리사이즈 / EXIF strip |
| Style | Tailwind CSS | 모바일 퍼스트 UI, 디자인 토큰 |
| Test | Vitest + Firebase Emulator + Playwright | unit / integration / E2E |
| Backup | (Phase 2) Cloud Functions → GCS | 사용자 1k+ 시 검토 |

**사용하지 않는 것**: AWS, Fly.io, MongoDB, NestJS, Express, GraphQL, Microservice, Vite, React Router, Redux/Zustand(정당화 전).

---

## 2. Data Model Design

### 2.1 Firestore Collections

```
firestore-root/
├── users/{uid}                          # 사용자 프로필
│   ├── uid: string                      # path와 동일 (CLAUDE.md 3.3)
│   ├── email: string
│   ├── provider: "google" | "password"
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp
│
└── users/{uid}/dailyRecords/{yyyy-mm-dd}  # 일일 기록 (1 user + 1 date = 1 record)
    ├── date: string                       # "2026-04-29" (document ID와 동일)
    ├── photos: {
    │     front: boolean,
    │     left: boolean,
    │     right: boolean
    │   }
    ├── water: number                      # 0~20 잔
    ├── food: string                       # 자유 입력
    ├── cosmetic: string                   # 자유 입력
    ├── exercise: boolean
    ├── memo: string
    ├── createdAt: timestamp
    └── updatedAt: timestamp               # serverTimestamp()
```

### 2.2 Firestore Security Rules

```javascript
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

### 2.3 Firebase Storage Rules

```javascript
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
                    && request.resource.size < 500 * 1024
                    && request.resource.contentType == 'image/jpeg';
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

**보안 결정 근거:**
- `^...$` anchored regex로 `front.jpgABC` 같은 우회 차단
- 500KB 한계: 1024×1024 JPG 80~85%는 200~400KB → 500KB로 클라이언트 규격화 우회 차단
- 날짜 형식 검증으로 비표준 경로 차단

---

## 3. Auth Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Login    │────▶│ Firebase Auth │────▶│ Auth State   │
│ Screen   │     │ (Google/PW)  │     │ Listener     │
└──────────┘     └──────────────┘     └──────┬───────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │ uid 획득           │
                                    │ Firestore에 user   │
                                    │ doc 생성/갱신       │
                                    └─────────┬─────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │ Today (Home)       │
                                    └───────────────────┘
```

### 3.1 Auth 구현 상세

- **onAuthStateChanged** 리스너로 전역 인증 상태 관리 (Client Component에서)
- 로그인 성공 시 `users/{uid}` 문서 존재 여부 확인 → 없으면 생성 (첫 가입)
- 로그아웃 시 localStorage의 임시 데이터 유지 (재로그인 시 복원)
- Protected Route: `(app)` 라우트 그룹의 layout에서 미인증 시 `/login`으로 redirect

### 3.2 Auth Context 구조

```typescript
interface AuthContext {
  user: { uid: string; email: string; provider: string } | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

---

## 4. Image Storage Architecture

### 4.1 Image Upload Pipeline

```
[카메라/갤러리]
      │
      ▼
[File 선택] ── <input type="file" accept="image/*" capture="environment">
      │
      ▼
[Client Processing]
  1. createImageBitmap으로 로드 (브라우저가 EXIF 방향 자동 보정)
  2. 1:1 center crop
  3. 1024×1024 canvas에 그리기
  4. JPG 80~85% 압축
  5. toBlob → EXIF가 자동으로 제거된 Blob 획득
      │
      ▼
[Firebase Storage Upload]
  Path: /{uid}/{yyyy-mm-dd}/{angle}.jpg
  Metadata: contentType: 'image/jpeg'
      │
      ▼
[Firestore Update]
  photos.{angle}: true
```

### 4.2 Image Processing (Client-side)

```typescript
async function processImage(file: File): Promise<Blob> {
  // 1. createImageBitmap: 브라우저가 EXIF 방향 자동 적용
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });

  // 2. 정사각형 crop (중심 기준)
  const size = Math.min(img.width, img.height);
  const sx = (img.width - size) / 2;
  const sy = (img.height - size) / 2;

  // 3. 1024×1024 canvas
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, size, size, 0, 0, 1024, 1024);

  // 4. JPG Blob (toBlob은 EXIF를 인코딩하지 않음 → 자동 strip)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      0.82,
    );
  });
}
```

**호환성 주의:** `createImageBitmap`은 모던 브라우저에서 동작. iOS Safari 14+ 지원. HEIC 파일은 iOS Safari에서 자동 변환되나, 기타 환경에서는 파일 선택기에서 JPG로 변환됨.

### 4.3 Backup Strategy (Phase 2 검토 사항)

**MVP에서는 Firebase Storage의 자체 redundancy로 충분.** 사용자 1,000명 이상 또는 데이터 손실 위험 증가 시 다음을 검토:

- Cloud Function `onFinalize`: 이미지 업로드 시 GCS 백업 버킷 복제
- Firestore daily export: 매일 새벽 GCS로 전체 export
- 복구 시나리오: Storage path 구조(`/{uid}/{date}/{angle}.jpg`) 자체가 식별자 → 메타데이터 없이도 복구 가능

→ MVP에서는 도입하지 않는다. 운영 면적을 키우는 추가 도입은 System Design Agent의 정당화 후 진행.

---

## 5. UX Flow + Screen Structure

### 5.1 Screen Map

```
[Splash/Auth Check]
      │
      ├── 미인증 ──▶ [Login Screen]
      │                 ├── Google 로그인
      │                 └── Email/PW 로그인/가입
      │
      └── 인증됨 ──▶ [Today (Home)]
                        │
                        ├── Tab 1: Today  (= /record/{오늘} 진입점)
                        │     ├── Step 1: Photos
                        │     ├── Step 2: Lifestyle
                        │     └── Step 3: Save/Confirm
                        │
                        ├── Tab 2: Calendar
                        │     ├── 날짜 선택 → 기록 조회/편집 (/record/{date})
                        │     └── 미래 날짜는 비활성화 (선택 불가)
                        │
                        ├── Tab 3: Compare
                        │     ├── 두 날짜 선택
                        │     └── 동일 angle 비교 (Phase 1: 좌우 배치, Phase 2: 슬라이더)
                        │
                        └── Tab 4: Settings
                              ├── 프로필
                              └── 로그아웃
```

### 5.2 화면별 상세

#### Screen 1: Login
- Google OAuth 버튼 (메인)
- Email/PW 폼 (토글)
- 최소 UI, 로고 + 버튼 1~2개

#### Screen 2: Today / Record (Home Record)
- `/today` 진입 시 서버 단에서 `/record/{오늘 dateKey}`로 redirect → 동일한 기록 화면 사용
- 상단: 선택된 날짜 표시 (오늘이면 "Today" 라벨, 아니면 날짜)
- 사진 영역: 3개 슬롯 (front / left / right) — **포스트잇 스타일**
  - 빈 슬롯: "+" 아이콘, 탭하면 카메라/갤러리 선택
  - 촬영 완료: 썸네일 표시, 탭하면 재촬영
- 하단: "다음" 또는 "스킵" 버튼
- 라우트 가드: 미래 날짜로 직접 진입 시 `/calendar`로 redirect

#### Screen 3: Lifestyle Input
- 물: 슬라이더 (0~20잔)
- 음식: 텍스트 한 줄 입력
- 화장품: 텍스트 한 줄 입력
- 운동: 토글 (했다/안했다)
- 메모: 텍스트 영역
- 하단: "저장" 버튼 (**항상 활성**)

#### Screen 4: Calendar
- 월간 달력 뷰
- 기록 있는 날짜에 점 표시
- **과거/오늘 날짜 탭 → `/record/{date}` 이동 (조회 + 편집 가능)** — Today와 동일 화면 재사용
- **미래 날짜는 비활성화** (`disabled` + `aria-disabled`, 탭 무반응, screen reader 안내 문구)
- 정책 근거: CLAUDE.md §5.5 "날짜 편집 정책" — 개인 기록의 사용 패턴(과거 보정) 존중, 일기 도메인 위반(미래) 차단

#### Screen 5: Compare
- 상단: angle 선택 (front / left / right)
- 날짜 A, 날짜 B 선택
- Phase 1: 두 사진 좌우 배치
- Phase 2: 오버레이 슬라이더 (픽셀 오차 0)

### 5.3 Navigation

```
Bottom Tab Bar (fixed, mobile-first)
┌────────┬──────────┬─────────┬──────────┐
│ Today  │ Calendar │ Compare │ Settings │
└────────┴──────────┴─────────┴──────────┘
```

Next.js 구현 시 `(app)/layout.tsx`에서 BottomTabBar 컴포넌트를 고정 렌더링.

### 5.4 State Persistence (이탈 복구)

- Today 기록 진행 중 데이터를 **localStorage(즉시) + Firestore draft(영속)** 이중 저장
- localStorage Key: `draft_{uid}_{yyyy-mm-dd}`
- Firestore draft 경로: `users/{uid}/dailyRecords/{date}`에 `isDraft: true` 플래그
- 앱 재진입 시 우선순위: Firestore draft > localStorage > 빈 상태
- Firestore 정식 저장 성공 시 `isDraft: false`로 갱신, localStorage draft 삭제
- iOS Safari 7-day storage eviction에 대비해 Firestore에도 동기화

---

## 6. MVP Scope

### Phase 1: MVP (Web) — 핵심 기록 + 단순 비교

| 기능 | 포함 | 비고 |
|------|------|------|
| Firebase Auth (Google + Email) | O | |
| 일일 기록 (사진 3장) | O | 오늘/과거 가능, 미래 차단 |
| 일일 기록 (생활습관) | O | 오늘/과거 가능, 미래 차단 |
| 이미지 클라이언트 처리 | O | 1:1, 1024, EXIF strip, JPG 80~85% |
| 달력 조회 + 과거 보정 편집 | O | 미래 날짜 셀 비활성화 |
| Compare (단순 좌우 배치) | △ | 슬라이더는 Phase 2 |
| 백업 Cloud Function | X | Phase 2 |
| Settings 화면 | △ | 로그아웃 + 데이터 내보내기 정도 |
| PWA manifest | △ | Phase 1 후반 |

### MVP 파일 구조 (Next.js App Router)

```
app/
├── layout.tsx                       # RootLayout, AuthProvider 주입
├── (auth)/
│   └── login/page.tsx               # Google + Email/PW
├── (app)/                           # 인증 필요 그룹
│   ├── layout.tsx                   # ProtectedRoute + BottomTabBar
│   ├── today/page.tsx               # /today → /record/{오늘}로 redirect (얇은 래퍼)
│   ├── record/[date]/page.tsx       # 일일 기록 본 화면 (Photo + Lifestyle), 미래 날짜 가드
│   ├── calendar/page.tsx            # 월간 달력 (미래 날짜 비활성화)
│   ├── compare/page.tsx             # 두 날짜 비교
│   └── settings/page.tsx            # 로그아웃 등
components/
├── ui/                              # 디자인 시스템 원시 컴포넌트
└── features/
    ├── PhotoSlot.tsx                # 포스트잇 스타일 사진 슬롯
    ├── PhotoCapture.tsx             # 카메라 + 규격화 파이프라인
    ├── LifestyleForm.tsx            # 물/음식/화장품/운동/메모
    ├── CompareView.tsx              # 두 사진 좌우 배치
    ├── BottomTabBar.tsx             # Today / Calendar / Compare / Settings
    ├── DateHeader.tsx
    └── ProtectedRoute.tsx
contexts/
└── AuthContext.tsx                  # onAuthStateChanged 리스너
hooks/
├── useAuth.ts
├── useDailyRecord.ts                # Firestore CRUD
└── useDraft.ts                      # localStorage + Firestore draft
lib/
├── firebase/
│   ├── client.ts                    # Web SDK 초기화
│   └── admin.ts                     # Admin SDK (Vercel Function 전용, Phase 2)
├── image/
│   └── processor.ts                 # createImageBitmap → 1024×1024 → JPG
└── storage/
    └── upload.ts                    # Firebase Storage 업로드 헬퍼
types/
└── index.ts                         # User, DailyRecord 타입
firestore.rules                      # Firestore Security Rules
storage.rules                        # Storage Rules
firebase.json                        # Firebase 프로젝트 설정
next.config.ts
tailwind.config.ts
```

---

## 7. Web → Android → iOS Expansion Strategy

### Phase 1: Web MVP (Next.js App Router on Vercel)
- 모바일 브라우저 최적화 (viewport, touch events)
- PWA manifest 추가 (홈 화면 추가 가능, Phase 1 후반)
- 카메라 접근: `<input type="file" accept="image/*" capture="environment">`
- 인증 walled 앱 → SSR 최소, 대부분 Client Component로 구현

### Phase 2: Web 고도화
- Compare 슬라이더 인터랙션 (픽셀 오차 0)
- Cloud Functions 백업 구현 (필요 시점에)
- PWA 오프라인 지원 (Service Worker)

### Phase 3: Android (별도 프로젝트, React Native 또는 Flutter)
- Firebase SDK 동일 사용
- 이미지 처리: 네이티브 라이브러리 (동일 규격 1:1, 1024)
- Firestore/Storage 경로 동일
- **데이터 마이그레이션 불필요** (같은 Firebase 프로젝트)

### Phase 4: iOS (별도 프로젝트)
- Android와 동일 전략
- HEIC → JPG 변환, 카메라 권한 추가 고려

### 확장 시 변경되지 않는 것 (CLAUDE.md 6장)
- Firestore 구조: `users/{uid}/dailyRecords/{date}`
- Storage 경로: `/{uid}/{date}/{angle}.jpg`
- 이미지 규격: 1:1, 1024×1024, JPG, EXIF 제거
- Auth: Firebase uid 단일 식별자

---

## 8. Risks + Failure Points

| Risk | Impact | Mitigation |
|------|--------|------------|
| 대용량 이미지 클라이언트 처리 실패 | 업로드 불가 | 처리 전 파일 크기 체크, 에러 시 재시도 UI |
| Firebase Storage 용량 초과 | 비용 증가 | 1024×1024 고정으로 ~200~400KB, Storage Rules 500KB 한계 |
| localStorage 용량 한계 | draft 손실 | draft는 메타데이터만, 이미지 제외, 5MB 이내 유지. Firestore 이중 저장으로 보강 |
| 모바일 브라우저 카메라 호환성 | 촬영 불가 | `<input accept="image/*">` fallback, 갤러리 업로드 항상 가능 |
| Firestore 무료 티어 초과 | 서비스 중단 | DAU 1,000 미만은 무료 티어 충분. 임계값 알림 설정. |
| EXIF 방향 미처리 | 사진 회전 오류 | `createImageBitmap({ imageOrientation: 'from-image' })`로 자동 보정 |
| 오프라인 상태 기록 | 데이터 유실 | Firestore offline persistence 활성화 |
| Compare 성능 (이미지 로딩) | 느린 UX | Storage URL 캐싱, lazy loading |
| iOS Safari 7-day storage eviction | draft 손실 | Firestore draft 이중 저장으로 회피 |
| Firebase API 키 노출 | (낮음) | API 키는 도메인 제한이 1차 방어. Rules가 최종 방어. |

### Critical Failure Point
- **이미지 처리 파이프라인**: 모든 플랫폼에서 동일 규격을 보장해야 함. 클라이언트 처리 실패 시 Storage Rules가 후위 가드(500KB, JPEG, 경로 형식). 비정상 데이터는 업로드 자체가 거부됨.

---

## 9. Verification Plan

MVP 구현 후 검증 항목 (`.claude/agents/qa.md` 참조):

1. **Auth**: Google 로그인 → uid 확인 → Firestore user doc 생성 확인
2. **Photo Upload**: 사진 촬영 → 1024×1024 JPG 확인 → Storage 경로 확인 → EXIF 제거 확인
3. **Daily Record**: 생활습관 입력 → Firestore document 확인 → 날짜별 조회
4. **Draft Recovery**: 기록 중 브라우저 닫기 → 재접속 → draft 복원 확인 (localStorage + Firestore 양쪽)
5. **Calendar**: 기록 있는 날짜에 점 표시 → 탭하면 기록 조회
6. **Mobile UX**: 모바일 브라우저에서 전체 플로우 1분 내 완료 가능
7. **Security**: 다른 uid의 데이터 접근 불가 (Firestore Rules + Storage Rules 양쪽 검증)
8. **Compare**: 동일 angle의 두 날짜 사진 좌우 배치, angle 다르면 비교 차단

---

## 10. 단일 출처 우선순위

본 문서의 결정이 다른 문서와 충돌하는 경우 다음 순서로 우선시한다:

1. **CLAUDE.md** — 절대 변경 불가 핵심 결정
2. **.claude/agents/*.md** — 기술 스택, 운영 표준, 팀별 가드레일
3. **DESIGN.md** (이 문서) — 위 두 출처를 통합한 구체 설계
