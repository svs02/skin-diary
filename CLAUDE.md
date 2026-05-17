# Skin Diary – Core Architecture Decision Document

본 문서는 Skin Diary 프로젝트에서
**웹 / Android / iOS 공통으로 절대 변경하지 않는 핵심 결정 사항**을 정의한다.

이 문서의 목적은:
- 플랫폼 확장 시 리팩토링 방지
- 데이터 일관성 유지
- 이미지/인증/UX 관련 치명적 실수 예방

---

## 1. 이미지 규격 결정

### 1.1 기본 원칙
- 모든 이미지는 업로드 전에 **클라이언트에서 규격 통일**
- 서버는 원본을 신뢰하지 않는다

### 1.2 최종 저장 규격
- 비율: **1:1 (정사각형)**
- 해상도: **1024 x 1024**
- 포맷: JPG
- 품질: 80~85%
- EXIF 방향 정보: **제거 필수**

### 1.3 이유
- 얼굴 비교 UI 정렬 안정성
- Web / Android / iOS 간 결과 동일
- 스토리지 비용 예측 가능
- 슬라이더 비교 시 픽셀 오차 제거

### 1.4 금지 사항
- 기기 원본 해상도 그대로 저장 ❌
- 비율 혼합 허용 ❌
- EXIF 방향 정보 유지 ❌

---

## 2. 이미지 파일 네이밍 규칙

### 2.1 기본 구조

```
/{uid}/{yyyy-mm-dd}/{angle}.jpg
```

### 2.2 angle 값 (고정)
- front
- left
- right

### 2.3 예시

```
/u_8x92k/2026-04-29/front.jpg
/u_8x92k/2026-04-29/left.jpg
/u_8x92k/2026-04-29/right.jpg
```

### 2.4 이유
- DB 없이도 이미지 의미 복원 가능
- 특정 사용자/날짜 단위 복구 가능
- 백업, 마이그레이션, 감사 대응 용이

### 2.5 금지 사항
- UUID 단독 파일명 ❌
- 날짜 없는 구조 ❌
- 사용자 구분 불가 구조 ❌

---

## 3. 사용자 식별 방식

### 3.1 단일 식별자
- **Firebase Auth에서 발급한 uid만 사용**

### 3.2 원칙
- uid는 모든 데이터의 최상위 키
- 이메일은 참고 정보
- provider(Google, password)는 상태값

### 3.3 사용자 데이터 예시

```json
{
  "uid": "u_8x92k",
  "email": "user@gmail.com",
  "provider": "google",
  "createdAt": "2026-04-29T10:12:00Z"
}
```

### 3.4 금지 사항
- 이메일을 PK로 사용 ❌
- 자체 userId 생성 ❌
- 플랫폼별 ID 분리 ❌

---

## 4. 날짜 단위 데이터 구조

### 4.1 기본 원칙
- 1 사용자 + 1 날짜 = 1 Record
- 하루 기록은 하나의 문서로 관리

### 4.2 경로 구조 (Firestore 기준)

```
users/{uid}/dailyRecords/{yyyy-mm-dd}
```

### 4.3 Record 예시

```json
{
  "date": "2026-04-29",
  "photos": {
    "front": true,
    "left": false,
    "right": true
  },
  "water": 6,
  "food": "라면",
  "cosmetic": "토너",
  "exercise": false,
  "memo": ""
}
```

### 4.4 이유
- 도메인(하루 1회 기록)에 정확히 부합
- 날짜 슬라이더 및 비교 기능 구현 용이
- 범위 조회, 정렬 단순

### 4.5 금지 사항
- 사진 단위 document 분리 ❌
- timestamp 기반 단일 컬렉션 ❌
- 날짜 필드만 있는 flat 구조 ❌

---

## 5. 모바일 기준 UX 흐름

### 5.1 기준 선언
- 모바일 앱 UX가 기준
- 웹은 동일한 흐름을 따른다

### 5.2 고정 사용자 플로우
1. 앱 실행
2. 오늘 날짜 자동 선택
3. 사진 촬영 또는 스킵
4. 생활 기록 입력 또는 스킵
5. 저장 → 종료

### 5.3 UX 원칙
- 모든 입력은 선택 사항
- "안 해도 된다"는 인상 유지
- 한 화면 = 한 행동
- 중간 이탈 시 데이터 보존

### 5.4 필수 요구
- 저장 버튼은 항상 활성
- 앱 종료 후 재진입 시 작성 중 데이터 복원

### 5.5 날짜 편집 정책
- 기본 진입은 **오늘 날짜 자동 선택** (5.2 흐름 유지)
- 사용자는 **캘린더에서 과거 날짜를 선택해 신규 작성·수정 가능** (개인 기록의 사용 패턴 존중)
- **미래 날짜는 작성·수정 불가** — 캘린더 셀에서 비활성화하고, 라우트/업로드 호출부에서도 가드한다

### 5.6 금지 사항
- 필수 입력 강제 ❌
- 웹 URL 중심 네비게이션 ❌
- 한 화면에 모든 입력 배치 ❌
- 미래 날짜 기록 작성 ❌ (개인 일기 도메인 위반)

---

## 6. 변경 불가 선언

본 문서에 정의된 항목은:

- 웹
- Android
- iOS

모든 플랫폼에서 공통으로 유지되어야 하며,
변경 시에는 전체 데이터 마이그레이션 비용을 고려한 의사결정이 필요하다.

---

## 7. 문서 목적 요약

이 문서는:
- 빠른 개발을 위한 문서가 아니다
- **나중에 후회하지 않기 위한 문서다**

이 규칙을 지키면:
- 플랫폼 확장 비용 감소
- 데이터/이미지 관련 버그 최소화
- 백업 및 복구 안정성 확보

---

## 8. Agent Routing Policy (필수)

### 8.1 단일 소스
- 라우팅 규칙의 단일 소스는 **`.claude/agent-routing.md`**
- UserPromptSubmit 훅(`.claude/scripts/agent-router.sh`)이 매 턴 위 파일을 system reminder로 주입한다
- 표 변경 시 `.claude/agent-routing.md` 한 곳만 수정한다

### 8.2 등록된 에이전트
`.claude/agents/`: backend · frontend · design · qa · security · devops · system-design

### 8.3 호출 의무 (요약)
- **단독 호출**: Firestore→backend / UI 구현→frontend / 시각 설계→design / 테스트→qa / Auth·Secret→security / Vercel·CI→devops / 아키텍처 변경→system-design
- **병렬 호출 (한 메시지에 묶기)**:
  - 신규 화면·컴포넌트 → design + frontend
  - PR 직전·마무리 → qa + security
  - 새 라이브러리·서비스 도입 → system-design + security (+ devops)
  - Firestore 스키마 변경 → backend + security

### 8.4 자기검열
실질 작업 시 트리거가 해당하면 Agent 도구 호출이 우선이다. 호출하지 않으면 응답 첫 줄에 `에이전트 미호출 사유: <이유>` 명시. 정당한 예외: 단일 typo 수정, 사용자의 명시적 비활성 지시, 순수 질의응답.

---

## 9. 사진 접근 보호 정책 (Phase 1 — 권장 수준)

### 9.1 원칙
- 사진은 PIPA §23 **민감정보(신체 특징·건강 정보)**, GDPR Art.9 **special category data**로 취급
- E2E 암호화는 Phase 2 로드맵 — 현재는 정책적 통제 + 외부 URL 노출 차단 + 감사 로깅의 다중 방어

### 9.2 클라이언트 SDK read 차단
- `storage.rules`에서 `allow read: if false` — 클라이언트 SDK로 사진 객체 직접 read 불가
- 모든 사진 read는 서버 함수 `POST /api/photo/signed-url` 경유
- 발급된 Signed URL은 **10분 TTL**, V4 서명, 클라이언트 인메모리 캐시만(localStorage 금지)

### 9.3 운영자 접근 제한
- 운영자 개인 GCP 계정에 Storage·Firestore 직접 접근 Role을 **두지 않는다**
- 정당 사유 발생 시 GCP Privileged Access Manager(PAM)의 `emergency-storage-read` grant로 **최대 2시간 한정** 일시 부여
- 모든 grant 생성·사용은 Cloud Audit Log에 자동 기록

### 9.4 감사 로깅 (이중 운영)
- 애플리케이션: Firestore `audit/{autoId}` (사용자가 본인 이력 조회 가능)
- 인프라: GCP Cloud Audit Logs Data Access Log (Storage·Firestore DATA_READ/WRITE)
- 보존 최소 3년 (PIPA 안전성확보조치 고시 §8 권고)

### 9.5 서비스 계정 분리 (prod)
- `sa-signed-url@…`: Signed URL 발급 hot path. `roles/iam.serviceAccountTokenCreator` 자기 자신 한정. Storage 객체 직접 권한 **없음**
- `sa-user-deletion@…`: 회원 탈퇴 cold path. `roles/storage.objectAdmin` + `roles/datastore.user` (버킷 prefix Condition)
- 키 분리로 한쪽 노출 시 영향 범위 격리

### 9.6 금지 사항
- 클라이언트 SDK `getDownloadURL()` 호출 ❌ (Storage Rules로 원천 차단)
- 운영자 개인계정에 Storage Role 상시 부여 ❌
- Signed URL을 localStorage/sessionStorage 저장 ❌ (자격증명 취급)
- 감사 로그 비활성화 ❌

---

## 10. 가입 동의 정책

### 10.1 원칙
- 사진 수집은 본 서비스 **핵심 기능(피부 변화 기록·비교)**의 필수 항목이므로, 민감정보 동의를 **필수 동의 항목**으로 묶는다 (PIPA §22·§39의2 정당화 근거)
- 동의 완료 전까지 서비스 사용 불가 — 사진 외 기능(메모·식습관)도 동일하게 차단
- CLAUDE.md §5.3 "모든 입력은 선택 사항"은 **기록 입력 단계** 원칙으로, 가입 동의와 별개

### 10.2 동의 항목 (4개, 필수 3 + 선택 1)
1. `[필수]` 서비스 이용약관
2. `[필수]` 개인정보 수집·이용 (이메일·uid)
3. `[필수]` 민감정보(얼굴 사진) 수집·이용 (E2E 미적용 한계 고지 포함)
4. `[선택]` 마케팅 알림

체크박스는 **모두 기본 비체크**. 필수 미체크 시 가입 버튼 비활성.

### 10.3 이메일·비밀번호 가입
- 회원가입 화면 자체에 4개 체크박스 노출
- 모두(또는 필수만) 체크 후 가입 → `users/{uid}.consentStatus = 'agreed'`

### 10.4 Google OAuth 가입
- OAuth 인증 직후 `consentStatus = 'pending'` 상태로 Firestore 생성
- AuthContext가 `pending` 감지 시 **즉시 `/signup/consent`로 강제 라우팅**
- 동의 페이지 이탈(뒤로가기·창 닫기·취소) 시 `signOut()` + `POST /api/account/abandon-signup` 호출 → Auth 사용자 + Firestore 문서 즉시 삭제

### 10.5 동의 상태 스키마
- `users/{uid}.consentStatus: 'pending' | 'agreed' | 'withdrawn'`
- `users/{uid}/consents/{policyVersion}` 서브컬렉션에 동의 시점·항목·채널 기록
- 향후 처리방침 개정 시 `consentStatus = 'pending'`으로 일괄 전환 → 재로그인 시 재동의

### 10.6 미들웨어 가드
- `consentStatus !== 'agreed'`인 사용자는 `/signup/consent`·`/login`·`/signup` 외 모든 경로 차단
- Signed URL Function도 토큰 검증 후 `consentStatus` 확인 → `pending`이면 403

### 10.7 동의 철회
- 마이페이지 "민감정보 동의 철회" = 사실상 탈퇴 (사진이 핵심 기능)
- 기존 `/api/account/delete` 흐름 재사용, 경고 모달 후 재확인

### 10.8 금지 사항
- 일괄 "전체 동의" 한 번 클릭으로 필수·선택 구분 없이 처리 ❌
- 기본 체크된 상태로 노출 ❌
- 동의 거부 후 일부 기능만 사용 가능하게 우회 ❌ (현 정책에서는 모든 기능 차단)
- 동의 기록 누락 ❌ (감사 추적 필수)
