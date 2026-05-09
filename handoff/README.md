# 피부일기 (Skin Diary) — 디자인 핸드오프 패키지

버전 1.0 · 2026-05-06

---

## 패키지 구성

```
handoff/
├── README.md                        ← 이 파일
├── Skin Diary — Design Spec.html    ← 컬러·타이포·컴포넌트·화면 스펙 문서
├── Skin Diary Hi-Fi.html            ← Hi-Fi 목업 (9개 화면, 다크모드 토글)
├── Skin Diary Wireframes.html       ← 와이어프레임 + IA 다이어그램
└── tokens/
    ├── colors.json                  ← Design Token (W3C 포맷)
    └── colors.css                   ← CSS Custom Properties (바로 import 가능)
```

---

## 빠른 시작

### 1. 토큰 적용 (CSS)

```html
<!-- index.html -->
<link rel="stylesheet" href="tokens/colors.css">
```

```css
/* 사용 예 */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.btn-primary {
  background: var(--color-accent);
  color: #fff;
  border-radius: var(--radius-md);
  height: 48px;
}
```

### 2. 다크 모드 전환

```js
// data-theme 속성으로 전환
document.documentElement.setAttribute('data-theme', 'dark');
// 또는 .dark 클래스
document.documentElement.classList.toggle('dark');
```

### 3. 폰트 로드

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

---

## 핵심 디자인 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 배경 | Cool Gray `#F2F5FA` | 따뜻함보다 깔끔함, 의료 신뢰감 |
| 액센트 | Sage Green `#6DBF8A` | 건강·자연·비압박 |
| 빈 슬롯 | 점선 테두리 | 에러처럼 보이지 않게 |
| 완료 표시 | 조용한 초록 체크 | 과도한 칭찬·진동 없음 |
| 날짜 강조 | 58px Bold 숫자 | 홈 진입점 명확화 |
| 카메라 | 항상 다크 | 뷰파인더 집중도 |

---

## UX 금지 항목

- ❌ 빨간색·주황색 에러 표시 (빈 슬롯, 미기록 상태)
- ❌ "아직 안 했어요" 압박 문구
- ❌ 완료 시 과도한 애니메이션·사운드
- ❌ 필수 입력 항목 (모든 항목은 선택)
- ❌ 한 화면에 CTA 2개 이상

---

## 화면 플로우 요약

```
홈 (미기록)
  └─► 카메라 가이드 [정면]
        └─► 카메라 각도 전환 [좌/우]
              └─► 생활 기록 입력
                    └─► 홈 (완료)
                          └─► 기록 상세
                                └─► 비교 Step1 날짜 선택
                                      └─► 비교 Step2 각도 선택
                                            └─► 비교 Step3 드래그 슬라이더
```

전체 기록 플로우 **1분 이내** 완료 목표.

---

## 안드로이드 확장

`tokens/colors.css` 의 CSS 변수 → `res/values/colors.xml` 1:1 매핑  
자세한 내용은 `Skin Diary — Design Spec.html` 의 "안드로이드 확장" 섹션 참고.

---

## 문의

디자인 관련 질문은 Design Spec 문서 내 주석 참고.  
컴포넌트 단위 구현 질문은 Hi-Fi HTML 소스 코드 참고.
