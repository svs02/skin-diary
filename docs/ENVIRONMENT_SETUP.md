# Skin Diary — Firebase Dev / Prod 환경 분리 가이드

이 문서는 **사용자(메이커)가 직접 콘솔에서 수행해야 하는 작업**을 단계별로 정리한 실행 가이드다.
코드 레벨 변경은 최소화한다. 대부분의 작업은 Firebase Console / GCP Console / Vercel Dashboard 에서 진행한다.

> **목표**: Production Firebase 데이터는 어떤 비프로덕션 환경(로컬, Preview, CI)에서도 접근 불가하도록 **프로젝트 자체를 분리**한다.

---

## 0. 환경 매트릭스

| 환경         | 호스팅              | Firebase 프로젝트              | env 소스                              |
| ------------ | ------------------- | ------------------------------ | ------------------------------------- |
| Local        | `next dev` (로컬)   | `skin-diary-ea893` (dev, 기존) | `.env.local` (gitignored)             |
| Preview (PR) | Vercel Preview      | `skin-diary-ea893` (dev, 공유) | Vercel Env Vars — Scope: **Preview**  |
| Production   | Vercel Production   | `skin-diary-prod` (신규)       | Vercel Env Vars — Scope: **Production** |

> **원칙**: Preview는 dev 프로젝트를 공유한다. PR마다 prod에 쓰지 않기 위함이다.
> 추후 Preview를 별도 프로젝트(`skin-diary-staging` 등)로 분리할 수 있으나, 현재 단계에서는 운영 면적을 늘리지 않는다.

---

## 1. Firebase prod 프로젝트 신규 생성

기존 `skin-diary-ea893`는 dev로 그대로 둔다. Production용 새 프로젝트를 만든다.

### 1.1 프로젝트 생성

- [ ] Firebase Console (<https://console.firebase.google.com>) 접속 — **`svs02po@gmail.com`** 계정
- [ ] **Add project** 클릭
- [ ] Project name: `skin-diary-prod` (Project ID도 동일하게 권장)
- [ ] Google Analytics: **활성화** (선택. 나중에 추가 가능)
- [ ] 생성 완료 후 프로젝트 진입

### 1.2 Authentication 활성화

- [ ] Build → Authentication → **Get started**
- [ ] Sign-in method 탭에서 dev와 동일한 provider 활성화 (예: Google, Email/Password)
- [ ] Google provider 사용 시 Support email = `svs02po@gmail.com`

### 1.3 Firestore Database 생성

- [ ] Build → Firestore Database → **Create database**
- [ ] **Production mode**로 시작 (테스트 모드 아님)
- [ ] Location: **`asia-northeast3` (Seoul)** — dev와 동일하게 맞출 것

### 1.4 Storage 활성화

- [ ] Build → Storage → **Get started**
- [ ] 동일 location 선택 (Firestore와 일치해야 함)

### 1.5 Web App 등록

- [ ] Project Settings (톱니바퀴) → General → **Your apps** → Web (`</>`) 추가
- [ ] App nickname: `skin-diary-web` (편한 이름)
- [ ] **Firebase Hosting은 체크하지 않는다** (Vercel을 사용)
- [ ] 발급된 `firebaseConfig` 값 복사 — 다음 단계에서 Vercel에 등록

### 1.6 Blaze 요금제 (필요 시)

- [ ] Storage 외부 트래픽이나 Cloud Functions를 쓸 계획이면 prod는 **Blaze** 권장
- [ ] **예산 알림(Budget alerts)**: GCP Console → Billing → Budgets → 월 USD 10 / 50% · 90% · 100% 알림 등록

---

## 2. GCP Console — API key HTTP Referrer 제한

`NEXT_PUBLIC_FIREBASE_API_KEY`는 클라이언트에 노출된다. 도메인 제한이 실질적 방어선이다.

### 2.1 dev 프로젝트 (`skin-diary-ea893`)

- [ ] <https://console.cloud.google.com/apis/credentials?project=skin-diary-ea893> 접속
- [ ] **Browser key (auto created by Firebase)** 클릭
- [ ] Application restrictions → **HTTP referrers (web sites)** 선택
- [ ] 다음 referrer 추가:
  - [ ] `http://localhost:3000/*`
  - [ ] `http://localhost:*/*`
  - [ ] `https://*.vercel.app/*` (Preview 도메인 전체 와일드카드)
  - [ ] (선택) 커스텀 dev 도메인 사용 시 해당 referrer
- [ ] API restrictions → **Don't restrict key** (또는 필요 API만 명시)
- [ ] **Save**

### 2.2 prod 프로젝트 (`skin-diary-prod`)

- [ ] <https://console.cloud.google.com/apis/credentials?project=skin-diary-prod> 접속
- [ ] **Browser key** 동일하게 편집
- [ ] HTTP referrers — **Production 도메인만** 등록:
  - [ ] `https://<your-prod-domain>/*` (예: `https://skindiary.app/*`)
  - [ ] `https://www.<your-prod-domain>/*` (www 사용 시)
- [ ] **`localhost`나 `*.vercel.app`은 prod 키에 절대 추가하지 않는다**
- [ ] **Save**

> **검증**: prod 키를 localhost에서 사용하면 `auth/unauthorized-domain` 또는 referrer 차단 오류가 떠야 한다. 안 뜨면 제한이 적용되지 않은 것.

---

## 3. Firebase Authorized Domains

API key 제한과 별개로, Firebase Auth는 자체 화이트리스트가 있다.

### 3.1 dev 프로젝트

- [ ] Firebase Console → Authentication → Settings → **Authorized domains**
- [ ] 다음이 포함되어 있는지 확인 (대부분 자동 등록):
  - [ ] `localhost`
  - [ ] `skin-diary-ea893.firebaseapp.com`
  - [ ] `skin-diary-ea893.web.app`
- [ ] Vercel Preview 도메인 추가:
  - [ ] **`vercel.app`** (이게 등록되면 모든 `*.vercel.app` 서브도메인 허용됨)
- [ ] (선택) 커스텀 dev 도메인이 있다면 추가

### 3.2 prod 프로젝트

- [ ] Authentication → Settings → Authorized domains
- [ ] 다음만 유지:
  - [ ] `localhost` — **운영 시 제거 권장** (디버깅 시 일시 추가)
  - [ ] `skin-diary-prod.firebaseapp.com`
  - [ ] `skin-diary-prod.web.app`
  - [ ] **운영 도메인** (예: `skindiary.app`, `www.skindiary.app`)
- [ ] **`vercel.app` 추가 금지** — Preview에서 prod 인증을 절대 못 하게 한다

---

## 4. Vercel Dashboard — Environment Variables 분리

Vercel CLI 미설치 상태이므로 웹 콘솔 기준으로 안내한다.

### 4.1 프로젝트 연결 (최초 1회)

- [ ] <https://vercel.com> 로그인 → **Add New → Project**
- [ ] GitHub 리포지토리 import
- [ ] Framework Preset: **Next.js** (자동 감지)
- [ ] **Deploy 버튼은 아직 누르지 않는다** — 환경 변수 먼저 등록

### 4.2 환경 변수 등록

Vercel Dashboard → 프로젝트 → **Settings → Environment Variables**

각 변수마다 우측 Environment 체크박스로 **Preview / Production / Development** 중 어느 환경에 적용할지 선택할 수 있다.

#### 4.2.1 Preview용 (Firebase **dev** 프로젝트 값)

다음 변수를 **Environment: Preview** 에만 체크하여 등록:

- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY` = (dev 프로젝트 API key)
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `skin-diary-ea893.firebaseapp.com`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `skin-diary-ea893`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `skin-diary-ea893.firebasestorage.app`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = (dev sender id)
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID` = (dev app id)

#### 4.2.2 Production용 (Firebase **prod** 프로젝트 값)

같은 변수명을 **Environment: Production** 에만 체크하여 별도로 등록:

- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY` = (**prod** 프로젝트 API key)
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `skin-diary-prod.firebaseapp.com`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `skin-diary-prod`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `skin-diary-prod.firebasestorage.app`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = (prod sender id)
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID` = (prod app id)

#### 4.2.3 Admin SDK (Phase 2 — 서버 라우트 도입 시)

다음은 **Sensitive** 타입으로 등록하고 `NEXT_PUBLIC_` 접두사를 절대 붙이지 않는다.

- [ ] `FIREBASE_ADMIN_PROJECT_ID`
- [ ] `FIREBASE_ADMIN_CLIENT_EMAIL`
- [ ] `FIREBASE_ADMIN_PRIVATE_KEY` — 서비스 계정 JSON의 `private_key`. 줄바꿈을 `\n`으로 escape한 한 줄 문자열로 저장.
  - Vercel은 따옴표를 자동으로 추가하지 않으므로 값 자체에 따옴표 없이 넣는다.
  - 코드에서 사용 시: `process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')`

> **Preview/Production 환경에 동일한 Admin 값을 쓰지 않는다.** dev 프로젝트의 서비스 계정은 Preview에, prod 프로젝트의 서비스 계정은 Production에 분리.

### 4.3 도메인 연결 (Production 출시 시)

- [ ] Settings → **Domains** → 운영 도메인 추가
- [ ] DNS 설정 안내대로 A/CNAME 레코드 등록
- [ ] HTTPS 인증서 자동 발급 확인
- [ ] **§2.2와 §3.2의 도메인 화이트리스트와 일치하는지 재확인**

---

## 5. Firestore Rules / Storage Rules 동기화

같은 룰을 dev/prod 양쪽에 게시한다. 한쪽만 업데이트하면 환경 간 동작 불일치 → 운영 사고로 직결.

### 5.1 수동 게시 (CI 도입 전 임시 절차)

- [ ] dev에서 룰 변경 후 충분히 검증
- [ ] Firebase Console → Firestore Database → **Rules** → `firestore.rules` 내용 붙여넣기 → Publish
- [ ] 동일 내용을 **prod** 프로젝트의 Rules 탭에도 붙여넣기 → Publish
- [ ] Storage도 동일 절차 (Storage → Rules)

### 5.2 CI 자동 배포 (후속 작업, 권장)

- [ ] Service Account JSON 발급 (각 프로젝트별)
  - Firebase Console → Project Settings → Service accounts → **Generate new private key**
- [ ] GitHub Actions Secrets에 등록:
  - `FIREBASE_SERVICE_ACCOUNT_DEV`
  - `FIREBASE_SERVICE_ACCOUNT_PROD`
- [ ] `.github/workflows/deploy-rules.yml` 추가 (예시):

```yaml
name: Deploy Firestore/Storage Rules
on:
  push:
    branches: [main]
    paths: [firestore.rules, storage.rules, firebase.json]
  workflow_dispatch:
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: w9jds/firebase-action@master
        with:
          args: deploy --only firestore:rules,storage --project skin-diary-prod
        env:
          GCP_SA_KEY: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_PROD }}
```

> dev에 대한 동일 잡을 PR/main 푸시 트리거로 추가하면 두 환경이 자동 동기화된다.

### 5.3 Rules 변경 후 모니터링

- [ ] Publish 직후 30분간 Firestore/Storage 사용량 그래프 확인
- [ ] Auth 실패율 급증 여부 확인 (Console → Authentication → Usage)
- [ ] 이상 시 즉시 이전 버전 Rules로 되돌리기 (Console에 버전 히스토리 있음)

---

## 6. 로컬 개발 환경 (변경 없음)

- [ ] `.env.local`은 **dev 프로젝트** 키만 사용 (현재 그대로 유지)
- [ ] `.env.local`은 절대 커밋하지 않는다 (`.gitignore`에 `.env*` 포함됨, `.env*.example`만 예외)
- [ ] prod 프로젝트 키는 **로컬 어떤 파일에도 저장하지 않는다** — Vercel에만 존재

---

## 7. 검증 체크리스트 (배포 전 최종)

### 7.1 dev/Preview 격리

- [ ] Preview 배포 URL에서 회원가입 → Firebase Console (dev)에 사용자 생성됨
- [ ] 같은 작업으로 prod 콘솔에는 **아무 변화 없음**

### 7.2 Production 격리

- [ ] prod 도메인에서 회원가입 → Firebase Console (prod)에 사용자 생성됨
- [ ] localhost에서 prod API key를 강제로 사용해보면 **referrer 차단 오류** 발생

### 7.3 환경 변수 누수 검사

- [ ] 빌드 산출물(브라우저 DevTools → Sources)에서 `FIREBASE_ADMIN_PRIVATE_KEY` 검색 → **0건**
- [ ] `FIREBASE_ADMIN_*` 변수가 `NEXT_PUBLIC_` 접두사 없이 등록되어 있는지 Vercel에서 재확인

### 7.4 Rollback 준비

- [ ] Vercel Deployments 탭에서 직전 안정 빌드 위치 확인 → **Instant Rollback** 버튼으로 즉시 복구 가능
- [ ] Firestore/Storage Rules 직전 버전 메모

---

## 8. 운영 시 정기 점검 (월 1회)

- [ ] dev/prod 양쪽 Firebase 사용량 확인 (Firestore reads/writes, Storage GB)
- [ ] 무료 티어 80% 도달 시 알림 설정 확인
- [ ] Authorized Domains에 불필요한 도메인 없는지 확인
- [ ] GCP API key referrer 목록에 와일드카드 남용 없는지 확인
- [ ] Service account 키 90일 이상 미회전 여부 확인 (Phase 2 적용 시)

---

## 9. 트러블슈팅

| 증상                                                    | 원인                                                  | 해결                                                              |
| ------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| `auth/unauthorized-domain`                              | Firebase Authorized Domains에 현재 도메인 미등록      | §3에서 도메인 추가                                                |
| `Requests from referer ... are blocked`                 | GCP API key의 HTTP referrer 제한과 불일치             | §2에서 referrer 패턴 확인                                         |
| Preview에서 prod 데이터가 보임                          | Vercel 환경 변수가 Preview/Production에 모두 동일 등록 | §4.2에서 Environment 체크박스 분리 재등록                         |
| `FIREBASE_ADMIN_PRIVATE_KEY` invalid                    | `\n` escape 문제                                      | 코드에서 `.replace(/\\n/g, '\n')` 적용 또는 멀티라인 secret 사용 |
| prod 배포 직후 Auth 실패율 급증                         | Rules 변경 또는 도메인 화이트리스트 누락              | §5.3 Rollback, §3.2 도메인 재확인                                 |

---

## 10. 변경 이력

| 날짜       | 변경 내용                                              | 담당      |
| ---------- | ------------------------------------------------------ | --------- |
| 2026-05-10 | 초기 작성. dev/prod 분리 가이드, Vercel 콘솔 기준 절차 | DevOps    |
