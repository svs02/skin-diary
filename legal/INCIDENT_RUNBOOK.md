# Skin Diary 개인정보 침해사고 대응 런북(Incident Runbook)

- **시행일**: 2026년 5월 15일
- **최종 변경일**: 2026년 5월 15일
- **소유자**: 운영자(svs02po@gmail.com)
- **목적**: 사고 발생 시 운영자가 시간 압박 하에서도 누락 없이
  단계별 대응을 수행할 수 있도록, 체크리스트와 템플릿을 사전에
  구비한다.

본 문서는 `legal/PRIVACY_POLICY.md` 및 `legal/INTERNAL_POLICY.md`와
함께 읽어야 합니다.

---

## 1. 사고 정의 및 범위

다음 중 하나에 해당하면 본 런북을 가동합니다.

- 이용자 사진·계정 정보 등 개인정보의 외부 유출
- 데이터 훼손(임의 수정·삭제)
- 운영자 또는 제3자의 접근 권한 남용
- Firebase·Vercel 등 인프라에 대한 침입·계정 탈취 정황
- Storage Rules / Firestore Rules 우회로 의심되는 접근 패턴

판단이 모호한 경우에도 **일단 가동**합니다(보수적 운영 원칙).

---

## 2. 법적 기준 — 모든 사고에 72시간 적용

| 근거 | 통지 의무 발생 기준 | 본 서비스 적용 |
|---|---|---|
| PIPA §34 | 영향 정보주체 1천명 이상 → 72시간 내 통지·신고 | **규모 무관 72시간** |
| GDPR Art.33 | 규모 무관 → 72시간 내 감독기관 통지 | 동일 적용 |

PIPA가 1천명 이상으로 한정하더라도, 본 서비스는 **모든 사고에
72시간 기준을 동일 적용**합니다. 보수적 운영을 위한 자기 구속
규칙입니다.

---

## 3. 타임라인 체크리스트

### T+0 — 감지 즉시 (타이머 시작)
트리거 예시:
- GCP Security Command Center 알림
- Firestore audit log의 비정상 패턴(다수 uid 동시 read 등)
- 외부 제보(이용자, 보안 연구자, 언론)
- 운영자 본인 발견(INTERNAL_POLICY.md 위반 자각 포함)

수행:
- [ ] Firestore `incidents/{yyyy-mm-dd-slug}` 문서 생성
  - 필드: `detectedAt`(UTC), `trigger`, `initialScope`,
    `currentPhase: "T+0"`, `notifiedAt: null`
- [ ] **이 문서 생성 시각이 72시간 카운트다운의 시작점입니다.**
- [ ] 비상 연락 채널 확보(개인 핸드폰 충전 상태 확인)
- [ ] 본 런북 §3의 각 단계 진행 시점을 위 incident 문서에 갱신

### T+0 ~ T+24h — 봉쇄(Containment)
- [ ] Firebase API 키 회전(Firebase 콘솔 → Project Settings →
      Web API Key, 필요 시 OAuth client 재발급)
- [ ] 의심 세션 강제 로그아웃: Firebase Admin SDK
      `revokeRefreshTokens(uid)` 적용
- [ ] 침해 의심 IAM 계정의 권한 즉시 회수(개인 계정·SA 모두)
- [ ] 의심 객체·문서에 대한 추가 접근 차단(Storage Rules·Firestore
      Rules 임시 강화)
- [ ] 영향 범위 1차 추정 — 다음을 incident 문서에 기록
  - 영향 uid 리스트(또는 추정 건수)
  - 영향 항목(사진/생활기록/이메일/uid 등)
  - 노출·훼손 추정 시점 범위

### T+24h ~ T+48h — 조사(Investigation)
- [ ] 원인 확정(취약 코드, Rules 누락, 자격 증명 유출 등)
- [ ] 침해 경로 확정
- [ ] 노출 항목·파일·문서 목록 확정(가능한 한 정확하게)
- [ ] 외부 유포 흔적 조사(공개 인덱싱 여부 등)
- [ ] 보존 명령에 대비해 관련 로그를 별도 보관 영역으로 복사

### T+48h ~ T+72h — 통지 및 신고(Notification)
- [ ] 정보주체(영향 받은 이용자) 이메일 통지 — §4 템플릿 사용
- [ ] 개인정보보호위원회 신고 — https://privacy.go.kr
- [ ] KISA 신고 — 국번 없이 **118** 또는
      https://privacy.kisa.or.kr
- [ ] EU 거주 이용자 포함 시 해당 감독기관에 통지
  - 예: 아일랜드 DPC(Google 본사 소재지 영향),
    https://www.dataprotection.ie
- [ ] 통지 시각을 incident 문서에 기록(`notifiedAt`)

### T+72h 이후 — 사후 조치(Post-Incident)
- [ ] 사후 분석 보고서(post-mortem) 작성
- [ ] 재발 방지책을 Firestore Rules / Storage Rules / 코드에
      실제로 반영(PR 링크를 incident 문서에 기록)
- [ ] `INTERNAL_POLICY.md` §8 위반 기록 갱신(운영자 위반에서 비롯
      된 경우)
- [ ] 영향 이용자 대상 후속 안내(필요 시)

---

## 4. 정보주체 통지 메일 템플릿

> 본 템플릿은 그대로 복사·편집해 사용합니다. 6개 항목은 모두
> 채워야 합니다.

```
제목: [Skin Diary] 개인정보 침해사고 안내드립니다

안녕하세요, Skin Diary 운영자입니다.

다음과 같이 회원님의 개인정보가 영향을 받은 사고가 발생하여
사실관계를 안내드립니다.

1) 유출(또는 훼손) 일시
   - 발생 추정: YYYY-MM-DD HH:MM (UTC)
   - 인지: YYYY-MM-DD HH:MM (UTC)

2) 영향을 받은 항목
   - 예) 얼굴 사진(전면/좌측/우측), 가입 이메일, 생활 기록 등
     해당 항목을 구체적으로 명시

3) 사고 경위 및 원인
   - 확인된 사실 위주로 간결하게 기술

4) 회원님께서 할 수 있는 조치
   - 비밀번호 재설정 안내
   - 의심 활동 모니터링 안내
   - 필요한 경우 계정 삭제 절차 안내

5) 운영자가 취한 조치 및 향후 계획
   - 봉쇄·조사·재발 방지 조치 요약
   - 감독기관 신고 여부

6) 문의처
   - 운영자 이메일: svs02po@gmail.com
   - 회신은 영업일 기준 1~2일 내 드립니다.

불편을 끼쳐 진심으로 사과드립니다.
Skin Diary 운영자 드림.
```

---

## 5. 감독기관 신고 안내

| 기관 | 채널 | 비고 |
|---|---|---|
| 개인정보보호위원회 | https://privacy.go.kr | 침해사고 신고 메뉴 |
| KISA 개인정보침해신고센터 | 118 / https://privacy.kisa.or.kr | 전화·웹 동시 가능 |
| 경찰청 사이버수사국 | 182 / https://ecrm.police.go.kr | 형사 사안 의심 시 |
| 아일랜드 DPC(EU) | https://www.dataprotection.ie | EU 사용자 영향 시 |

신고 시 첨부 권장:
- incident 문서 PDF 또는 요약본
- 영향 범위 추정 근거 자료
- 봉쇄·재발 방지 조치 내역

---

## 6. 사후 분석 보고서(post-mortem) 권장 구조

1. 요약(한 단락)
2. 타임라인(T+0부터 분 단위)
3. 영향 범위(uid·항목·건수)
4. 근본 원인
5. 봉쇄 조치 및 효과
6. 재발 방지책(코드·Rules·정책 변경 PR 링크)
7. 운영자 자기 평가(절차 준수 여부)

본 보고서는 가능한 범위에서 리포지토리(`legal/postmortems/`)에
공개합니다. 단, 영향 이용자가 식별 가능한 정보는 마스킹합니다.

---

## 7. 역할 — 1인 운영 단계

현재 모든 역할을 운영자 1인이 수행합니다.

| 역할 | 담당 | 비고 |
|---|---|---|
| 감지자(Detector) | 운영자 | 알림·로그·제보 수신 |
| 조사자(Investigator) | 운영자 | 원인·범위 확정 |
| 통지자(Notifier) | 운영자 | 이용자 메일 발송 |
| 대외 창구(External liaison) | 운영자 | 감독기관·언론 응대 |

향후 팀 합류 시 위 역할을 분리하고 본 표를 갱신합니다.

---

## 8. 연락처 및 참고 자료

- 운영자: svs02po@gmail.com
- KISA: 국번 없이 118 / https://privacy.kisa.or.kr
- 개인정보보호위원회: https://privacy.go.kr
- PIPA 전문: https://www.law.go.kr (개인정보 보호법 검색)
- GDPR 전문: https://gdpr-info.eu

---

## 9. 개정 이력

| 버전 | 일자 | 변경 내용 |
|---|---|---|
| 1.0 | 2026-05-15 | 최초 작성 — 72시간 보수 운영 기준 채택 |
