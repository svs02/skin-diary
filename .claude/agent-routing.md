# Agent Routing Rules (Skin Diary)

이 파일은 라우팅 규칙의 **단일 소스**다. CLAUDE.md와 UserPromptSubmit 훅이 모두 이 파일을 참조하므로, 변경 시 두 곳에 따로 손대지 않는다.

## 등록된 에이전트

`.claude/agents/` 에 정의된 7개:
`backend` · `frontend` · `design` · `qa` · `security` · `devops` · `system-design`

## 트리거 → 에이전트 (단독 호출)

| 사용자 요청에 다음 키워드/맥락이 보이면 | 호출할 에이전트 |
|---|---|
| Firestore 스키마/Security Rules/Storage Rules/Vercel Function/쿼리·인덱스 | **backend** |
| Next.js / React / TypeScript UI / 이미지 클라이언트 처리 / PWA / Firebase Web SDK 연동 | **frontend** |
| 사용자 플로우 / 와이어프레임 / 디자인 시스템(컬러·타이포·스페이싱) / 컴포넌트 시각 명세 | **design** |
| 테스트 전략 / Unit·Integration·E2E / edge case / Firebase 에뮬레이터 | **qa** |
| Auth flow 검증 / XSS·CSRF·Injection / Secret·env 검토 / OWASP | **security** |
| Vercel 배포 / GitHub Actions / 환경 분리(dev·prod) / 모니터링·로깅 | **devops** |
| 전체 아키텍처 조율 / 새 라이브러리·서비스 검토 / CLAUDE.md 결정사항 변경 | **system-design** |

## 트리거 → 에이전트 (병렬 호출, 한 메시지에 묶어 발사)

| 상황 | 동시 호출 |
|---|---|
| 신규 화면·컴포넌트 도입 | **design + frontend** |
| PR 직전 / "끝났다 / 마무리하자" 신호 | **qa + security** |
| 새 라이브러리·서비스 도입 | **system-design + security** (배포 영향 시 + devops) |
| Firestore 스키마 변경 | **backend + security** |

## 자기검열 규칙 (의무)

실질 작업(코드 편집, 플랜 작성, 아키텍처 결정, 의존성 추가) 시 위 트리거 중 하나라도 해당하면 **반드시 Agent 도구를 먼저 호출**한다. 호출하지 않을 거면 응답 첫 줄에 다음 형식으로 사유를 명시한다:

> 에이전트 미호출 사유: <구체적 이유 — 예: "단순 typo 수정, 아키텍처 영향 없음">

미호출이 정당한 예외:
- 단일 변수명/오타 수정
- 사용자가 명시적으로 "에이전트 쓰지 마"라고 한 경우
- 순수 질의응답 (코드 변경/결정 없음)

## 호출 시 원칙

- 병렬 후보가 둘 이상이면 **한 어시스턴트 메시지 안에 여러 Agent 호출**을 묶어 동시 실행한다 (직렬 호출 금지)
- 각 에이전트에는 자체 컨텍스트를 전달한다 — "현 대화에서 X를 결정했다"는 식의 암시적 참조 금지
- 에이전트 결과는 사용자에게 요약 전달 (raw 출력 노출 금지)
