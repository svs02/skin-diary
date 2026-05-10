# Skin Diary — 배포 파이프라인 운영 가이드

이 문서는 **사용자(메이커)가 직접 콘솔에서 1회 수행해야 하는 셋업 절차**를 단계별로 정리한 실행 가이드다.
파이프라인 자체는 코드(`vercel.ts`, `.github/workflows/*.yml`)로 정의되어 있으므로,
아래 다섯 단계만 마치면 다음과 같이 자동 동작한다.

| 트리거 | 결과 |
| --- | --- |
| `feat: ...` PR 생성 / 업데이트 | Vercel **Preview** 배포 (Firebase **dev**) + GitHub Actions `CI` 실행 |
| `firestore.rules` / `storage.rules` 가 포함된 PR | 위에 더해 `Firebase Rules` 워크플로의 **rules-dev** 잡이 dev 룰 배포 |
| `main` 머지 | Vercel **Production** 배포 (Firebase **prod**) + `Firebase Rules` 의 **rules-prod** 잡이 prod 룰 배포 |

전제: dev/prod 환경 격리 정책은 [`docs/ENVIRONMENT_SETUP.md`](./ENVIRONMENT_SETUP.md)와 동일하다 (변경 없음).

---

## 1. Vercel 프로젝트 연결 (CLI 없이 웹 콘솔만)

- [ ] <https://vercel.com> 로그인 → **Add New → Project**
- [ ] GitHub 리포지토리 선택 → **Import**
- [ ] Framework Preset: **Next.js** (자동 감지)
- [ ] Root Directory: `./` (변경 불필요)
- [ ] Build/Install/Dev 명령은 `vercel.ts`가 자동으로 주입한다 — 빈 칸으로 둔다
- [ ] **환경 변수 등록 전까지 Deploy 버튼 누르지 말 것** (3번 단계 후 첫 배포)
- [ ] Settings → Git → **Production Branch**: `main` (기본값)
- [ ] Settings → Git → **Ignored Build Step**: 비워둠 (모든 PR에서 Preview 빌드)

> Vercel과 GitHub은 가입 시 자동으로 통합된다. PR 생성 시 Preview, main 머지 시 Production 배포가 별도 설정 없이 동작한다.

---

## 2. prod Firebase 프로젝트 신규 생성 (`skin-diary-prod`)

[`docs/ENVIRONMENT_SETUP.md` §1](./ENVIRONMENT_SETUP.md#1-firebase-prod-프로젝트-신규-생성) 절차를 그대로 따른다. 요약:

- [ ] Firebase Console에서 새 프로젝트 `skin-diary-prod` 생성
- [ ] Authentication 활성화 (dev와 동일 provider)
- [ ] Firestore Database 생성 — Production mode, location `asia-northeast3`
- [ ] Storage 활성화 — 동일 location
- [ ] Web App 등록 → 발급된 `firebaseConfig` 6개 값 메모 (다음 단계에서 사용)

> dev (`skin-diary-ea893`)는 이미 존재한다. prod만 신규 생성한다.

---

## 3. Vercel 환경 변수 등록 (Preview = dev, Production = prod)

Vercel Dashboard → 프로젝트 → **Settings → Environment Variables**

각 변수마다 **Environment** 체크박스로 적용 환경을 분리해서 등록한다. 같은 이름의 변수를 Preview용과 Production용으로 **두 번** 등록하는 구조다.

### 3.1 Preview 환경 (Firebase **dev** 값)

다음 6개를 **Environment: Preview** 만 체크하여 등록 (Development는 선택, 로컬은 `.env.local` 사용 권장).

- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY` = (dev 프로젝트 값)
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `skin-diary-ea893.firebaseapp.com`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `skin-diary-ea893`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `skin-diary-ea893.firebasestorage.app`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = (dev 값)
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID` = (dev 값)

### 3.2 Production 환경 (Firebase **prod** 값)

같은 6개 변수명을 **Environment: Production** 만 체크하여 별도 등록.

- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY` = (**prod** 프로젝트 값)
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `skin-diary-prod.firebaseapp.com`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `skin-diary-prod`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `skin-diary-prod.firebasestorage.app`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = (prod 값)
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID` = (prod 값)

> **금지**: 한 변수에 Preview + Production 동시 체크. 데이터 격리 원칙 위반.

### 3.3 Firebase Admin SDK 키 (서버 전용 — Preview·Production 모두 등록)

`app/api/account/delete` 등 Vercel Function이 Firebase Admin SDK로 사용자 데이터를 직접 조작할 때 필요. **반드시 dev 서비스 계정과 prod 서비스 계정 키를 분리 발급**한다 (한 환경의 키가 다른 환경 데이터에 닿으면 격리 원칙 위반).

발급 절차 (각 Firebase 프로젝트마다 1회):

1. Firebase Console → 해당 프로젝트 → ⚙️ **프로젝트 설정 → 서비스 계정** 탭
2. **새 비공개 키 생성** → JSON 다운로드 (이 파일은 1회만 표시되므로 안전한 곳에 보관)
3. JSON에서 다음 3개 필드 사용:
   - `project_id` → `FIREBASE_ADMIN_PROJECT_ID`
   - `client_email` → `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_ADMIN_PRIVATE_KEY` (줄바꿈을 `\n` 문자열로 escape하여 1줄로)

Vercel Dashboard → Settings → Environment Variables 에서 **Sensitive**로 표시하여 등록.

#### Preview (dev 서비스 계정 키)

- [ ] `FIREBASE_ADMIN_PROJECT_ID` = `skin-diary-ea893` — Environment: **Preview**
- [ ] `FIREBASE_ADMIN_CLIENT_EMAIL` = (dev JSON의 `client_email`) — Environment: **Preview**
- [ ] `FIREBASE_ADMIN_PRIVATE_KEY` = (dev JSON의 `private_key`, `\n` escape) — Environment: **Preview**

#### Production (prod 서비스 계정 키)

- [ ] `FIREBASE_ADMIN_PROJECT_ID` = `skin-diary-prod` — Environment: **Production**
- [ ] `FIREBASE_ADMIN_CLIENT_EMAIL` = (prod JSON의 `client_email`) — Environment: **Production**
- [ ] `FIREBASE_ADMIN_PRIVATE_KEY` = (prod JSON의 `private_key`, `\n` escape) — Environment: **Production**

> **주의**: `NEXT_PUBLIC_` 접두사 절대 금지 — 붙이면 클라이언트 번들로 새어나간다.
> **회전**: 키 유출 의심 시 Firebase Console 같은 화면에서 해당 키 비활성화 후 재발급.

---

## 4. GitHub Secrets 등록

리포지토리 → **Settings → Secrets and variables → Actions → New repository secret**

### 4.1 Firebase CI 토큰 (Rules 자동 배포용)

먼저 로컬에서 토큰을 발급받는다 (Vercel CLI 미설치 상태이므로 firebase CLI는 npx로 1회만 호출한다).

```bash
# dev 토큰 — dev 프로젝트에 접근 권한이 있는 Google 계정으로 로그인
npx firebase-tools@latest login:ci
# 출력된 1//... 토큰을 복사

# prod 토큰 — prod 프로젝트 owner 계정으로 다시 로그인
npx firebase-tools@latest login:ci --reauth
```

GitHub에 등록:

- [ ] `FIREBASE_TOKEN_DEV` = (dev 프로젝트 토큰)
- [ ] `FIREBASE_TOKEN_PROD` = (prod 프로젝트 토큰)

> **prod 프로젝트가 아직 없으면 `FIREBASE_TOKEN_PROD`는 비워둬도 된다.** `rules-prod` 잡이 자동으로 skip된다 (워크플로 내 가드 참조). 프로젝트 생성 후 추가하면 다음 main 머지부터 동작한다.

### 4.2 CI 빌드용 Firebase 환경 변수 (dev 값만)

`.github/workflows/ci.yml`의 build 잡이 `pnpm build`를 dev 환경값으로 실행한다. **CI에는 prod 값을 절대 노출하지 않는다.**

- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY` = (dev 값, Vercel Preview와 동일)
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `skin-diary-ea893.firebaseapp.com`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `skin-diary-ea893`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `skin-diary-ea893.firebasestorage.app`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = (dev 값)
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID` = (dev 값)

### 4.3 (선택) GitHub Environment 분리

`firebase-rules.yml`은 `environment: firebase-dev` / `environment: firebase-prod`를 지정한다. 필요 시 리포지토리 → **Settings → Environments**에서 두 환경을 만들고 각각 보호 규칙(예: prod 배포 전 수동 승인)을 걸 수 있다. 만들지 않아도 워크플로는 동작한다.

---

## 5. Rules 배포 동작 확인 (smoke test)

전체 파이프라인이 살아있는지 확인하는 가장 가벼운 검증 절차다.

1. [ ] `firestore.rules` 파일에 의미 없는 주석 한 줄 추가 (예: `// rules deploy smoke 2026-05-10`)
2. [ ] 새 브랜치로 PR 생성 → main 대상
3. [ ] PR 페이지의 Checks 탭에서 다음을 확인:
   - [ ] `CI / Type check` — pass
   - [ ] `CI / Lint` — pass
   - [ ] `CI / Build (dev Firebase)` — pass
   - [ ] `Firebase Rules / Deploy rules to dev (skin-diary-ea893)` — pass
   - [ ] Vercel — Preview 배포 성공, PR 코멘트에 URL이 달림
4. [ ] Firebase Console (dev) → Firestore → Rules 탭에서 **새 버전이 게시되었는지** 확인
5. [ ] PR을 main에 머지
6. [ ] Actions 탭에서 다음을 확인:
   - [ ] `Firebase Rules / Deploy rules to prod (skin-diary-prod)` — pass (prod 토큰 미등록 시 skip)
   - [ ] Vercel Production 배포 성공
7. [ ] Firebase Console (prod) → Firestore → Rules 탭에서 새 버전 게시 확인

---

## 6. Rollback

- **Vercel Production 배포 롤백**
  - Vercel Dashboard → Deployments → 직전 안정 배포 → **⋯ → Promote to Production** (수 초)
- **Firestore / Storage Rules 롤백**
  - Firebase Console → Rules 탭 → 버전 히스토리에서 이전 버전 선택 → **Rollback**
  - 또는 git에서 룰 파일을 revert 후 main 머지 → 자동 재배포
- **사고 직후 30분간 모니터링**: Auth 실패율, Firestore reads/writes 그래프

---

## 7. 트러블슈팅

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Firebase Rules / rules-dev` 가 매 PR마다 fail | `FIREBASE_TOKEN_DEV` 시크릿 누락 또는 만료 | §4.1 절차로 토큰 재발급 후 secret 갱신 |
| `rules-prod` 가 main 머지 후에도 항상 skip | `FIREBASE_TOKEN_PROD` 시크릿 미등록 | prod 프로젝트 생성(§2) 후 §4.1로 토큰 등록 |
| Vercel Preview 빌드는 되는데 CI build 잡만 fail | GitHub Secrets 의 `NEXT_PUBLIC_FIREBASE_*` 누락 | §4.2 절차 재확인 |
| `vercel.ts is not valid` | `vercel build` 가 컴파일 실패 — 보통 타입 에러 | 로컬에서 `pnpm tsc --noEmit` 통과시키고 다시 push |
| Preview에서 prod 데이터가 보임 | Vercel 환경 변수 Preview/Production 동시 체크 | §3 절차로 분리 재등록 |
| `auth/unauthorized-domain` (Preview URL) | Firebase Authorized Domains 에 `vercel.app` 누락 | [`docs/ENVIRONMENT_SETUP.md` §3.1](./ENVIRONMENT_SETUP.md#31-dev-프로젝트) 참조 |

---

## 8. 변경 이력

| 날짜 | 변경 | 담당 |
| --- | --- | --- |
| 2026-05-10 | 초기 작성. `vercel.ts` + `ci.yml` + `firebase-rules.yml` 산출과 함께 도입 | DevOps |
