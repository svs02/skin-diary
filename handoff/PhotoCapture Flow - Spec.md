# PhotoCapture Flow — Design Spec

버전 1.0 · 2026-05-09
적용 범위: AddPhotoSheet · CaptureShell · PhotoCapture 그리드 · 토스트/엣지케이스
1차 진실원: 본 문서. (Handover.md 부재 — 본 Spec.md가 단일 소스)

---

## §0. 개요

### 0.1 목적
Skin Diary 사진 추가 플로우의 디자인 결정사항을 디스크에 형식화한다. 신규 디자인이 아니라 **이미 확정된 결정의 명세화**다. 후속 구현(Frontend Agent) 및 QA 시나리오 작성의 단일 참조점.

### 0.2 적용 화면
1. **AddPhotoSheet** — 사진 추가 진입 시트 (각도 선택 + 카메라/갤러리 분기)
2. **CaptureShell** — 한 angle씩 촬영하는 카메라 셸 (권한 4상태 + AngleGuide)
3. **PhotoCapture 그리드** — 3슬롯 (front/left/right) 빈/채워진 상태 + ⋯ 메뉴
4. **엣지 케이스** — 카메라 권한, 미래 날짜 가드, 업로드 토스트

### 0.3 전제 조건 (CLAUDE.md 인용)
- §1 — 모든 사진은 클라이언트에서 **1024×1024 정사각 JPG, 품질 80~85%, EXIF 제거** 후 저장
- §2 — 파일 경로 `/{uid}/{yyyy-mm-dd}/{angle}.jpg`, angle ∈ {front, left, right}
- §5.5 — 미래 날짜 작성·수정 불가 (셀 비활성 + 라우트 가드 + 업로드 가드 3중)

### 0.4 기준 기기
- 모바일: 375pt 폭 (iPhone 12/13 mini 기준), safe-area inset 적용
- 데스크톱: 1280pt 폭 fallback (modal centered 480pt)
- 다크모드: 토큰 자동 전환 (colors.css `[data-theme="dark"]`)

### 0.5 톤 가이드 (재확인)
- 의료/진단 인상 회피 — 빨강·주황은 카메라 정렬 경고 외 사용 금지
- 마이크로카피는 초대형 ("기록을 남겨주세요" ❌ → "오늘 어땠어요?" ✅)
- 모든 화면에서 저장/스킵 동선이 항상 보여야 함

---

## §1. AddPhotoSheet

### 1.1 의도
한 줄 — "오늘의 사진을 추가하기 위한 진입 시트. 카메라/갤러리 선택과 각도 안내를 한 번에 처리한다."

선행 트리거: PhotoCapture 그리드의 **빈 슬롯 탭** 또는 채워진 슬롯의 **⋯ → 다시 촬영** / **⋯ → 갤러리에서 교체**.

### 1.2 모바일 와이어 (텍스트)

```
┌─────────────────────────────────────────┐ 375 × auto
│            ▬▬▬▬   (handle, 4×40)        │  radius-lg(16) 상단만
│                                         │
│   사진을 추가해요              (title)   │  text-title 22/600
│   정면 · 좌 · 우, 한 장씩 천천히 (subtitle) text-body 16/400 muted
│                                         │
│   ┌──────┐  ┌──────┐  ┌──────┐          │  angle chip 3개
│   │ 정면 │  │  좌  │  │  우  │          │  radius-full, accent-dim bg
│   └──────┘  └──────┘  └──────┘          │  active = accent solid
│                                         │
│   ┌─────────────────────────────────┐   │  primary CTA
│   │       카메라로 찍기              │   │  bg-accent, fg surface
│   └─────────────────────────────────┘   │  height 52, radius-md
│                                         │
│   ┌─────────────────────────────────┐   │  secondary CTA
│   │     갤러리에서 고르기             │   │  bg-surface-2, fg
│   └─────────────────────────────────┘   │  height 52, radius-md
│                                         │
│   어떤 각도부터 시작할까요? (helper)     │  text-caption 13 muted
│                                         │
│              (safe-area inset bottom)   │
└─────────────────────────────────────────┘
```

- 시트 높이 자동 (대략 380~420pt)
- backdrop: `rgba(0,0,0,.32)`, tap-to-dismiss
- handle bar는 시각적 어포던스 — 실제 swipe-down은 시트 전체에서 동작

### 1.3 데스크톱 와이어 (텍스트)

```
┌────────────────────────────────────────┐ 480 × auto, modal centered
│  사진을 추가해요               × close │  radius-xl(20)
│  정면 · 좌 · 우, 한 장씩 천천히          │
│                                        │
│   [정면]  [좌]  [우]                    │
│                                        │
│   ┌────────────┐  ┌────────────┐       │  데스크톱: 갤러리 우선
│   │ 갤러리에서  │  │ 카메라로    │       │  (left = primary)
│   │  고르기    │  │   찍기      │       │
│   └────────────┘  └────────────┘       │
│                                        │
│   어떤 각도부터 시작할까요?              │
└────────────────────────────────────────┘
```

데스크톱은 카메라 접근성이 낮으므로 **갤러리 CTA를 좌측 primary**로 둔다. 모바일과 거울 배치.

### 1.4 상태표

| 상태 | 트리거 | 결과 | 모션 |
|---|---|---|---|
| closed | 초기 / 마지막 dismiss 후 | invisible | — |
| opening | 슬롯 tap, 메뉴 tap | enter 280ms | --duration-enter / --ease-emphasis |
| open | enter 완료 | tap-target enabled | — |
| selecting-angle | 각도 칩 tap | 칩 active 상태로 전환 | --duration-micro |
| dismissing | swipe down / backdrop tap / close X | exit 200ms | --duration-exit / --ease-exit |

### 1.5 카피 (ko/en + i18n 키)

| 키 | ko | en |
|---|---|---|
| record.photos.sheet.title | 사진을 추가해요 | Add a photo |
| record.photos.sheet.subtitle | 정면·좌·우, 한 장씩 천천히 | Front · Left · Right, one at a time |
| record.photos.sheet.cta.camera | 카메라로 찍기 | Use camera |
| record.photos.sheet.cta.gallery | 갤러리에서 고르기 | Choose from gallery |
| record.photos.sheet.cancel | 닫기 | Close |
| record.photos.sheet.angle.helper | 어떤 각도부터 시작할까요? | Which angle first? |

> 본 표는 명세이며 **`messages/ko.json` / `messages/en.json`은 본 작업에서 수정하지 않는다**. 실제 키 추가는 후속 frontend 구현 PR에서 처리.

### 1.6 사용 토큰

| 요소 | 토큰 |
|---|---|
| 시트 배경 | `--color-surface` |
| 모서리 (모바일 상단만) | `--radius-lg` (16) |
| 모서리 (데스크톱 전체) | `--radius-xl` (20) |
| handle | `--color-fg-subtle` |
| 그림자 | `--shadow-lg` |
| 진입 모션 | `--duration-enter` / `--ease-emphasis` |
| 퇴출 모션 | `--duration-exit` / `--ease-exit` |
| primary CTA bg | `--color-accent` |
| primary CTA fg | `--color-surface` |
| secondary CTA bg | `--color-surface-2` |
| chip active bg | `--color-accent` |
| chip inactive bg | `--color-accent-dim` |
| backdrop | `rgba(0,0,0,.32)` (토큰 미할당, 부록 A 참조) |

---

## §2. CaptureShell

### 2.1 의도
한 줄 — "한 angle씩 촬영하는 카메라 셸. 권한 4상태 처리 + AngleGuide 오버레이 + 셔터·사이드레일."

CaptureShell은 AddPhotoSheet에서 **카메라 CTA 선택 시** 풀스크린 진입한다. 갤러리 선택 시에는 OS 파일 피커로 직행 (CaptureShell 미진입).

### 2.2 권한 4상태 와이어 (텍스트)

#### 2.2.a prompt (초기)
```
┌─────────────────────────────────────────┐ fullscreen, camera-bg
│            (조용한 illustration)         │
│                                         │
│        카메라를 잠깐 쓸게요              │  text-title 22/600 surface
│                                         │
│  사진을 정사각으로 정리해서 저장해요      │  text-body 16/400 fg-subtle
│                                         │
│   ┌─────────────────────────────────┐   │
│   │            허용                  │   │  bg-accent, fg surface
│   └─────────────────────────────────┘   │
│                                         │
│         갤러리에서 고르기                │  text button, accent
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.b allowed (라이브)
```
┌─────────────────────────────────────────┐ fullscreen
│  ←       정면 · 1/3        [⏻ 토치]    │  top bar: dismiss + label + tools
│                                         │
│        ┌─────────────────────┐          │
│        │                     │          │  AngleGuide overlay
│        │   (라이브 프리뷰)     │          │  (oval / line, see §2.3)
│        │                     │          │
│        └─────────────────────┘          │
│                                         │
│              ●  ●  ○                    │  진행 도트 (front filled, left active, right empty)
│                                         │
│   ┌──┐                            ┌──┐  │
│   │↻ │            ◯               │ ⇄ │  │  사이드레일 (좌: 토치, 우: 카메라 전환)
│   └──┘          (셔터)             └──┘  │  셔터: 72 ring, 64 fill surface
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.c denied-once (한 번 거부)
```
┌─────────────────────────────────────────┐
│        다시 한 번 허용해 주세요          │  text-title surface
│                                         │
│   카메라 없이도 갤러리에서 고를 수       │  text-body fg-subtle
│   있어요.                                │
│                                         │
│   [ 다시 시도 ]   [ 갤러리에서 고르기 ]  │  retry primary, gallery secondary
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2.d denied-permanent (영구 거부)
```
┌─────────────────────────────────────────┐
│   브라우저 설정에서 권한을 켜주세요      │
│                                         │
│   1. 주소창 좌측 자물쇠 아이콘을 눌러요 │  step list
│   2. "카메라" 항목을 "허용"으로 바꿔요  │
│   3. 페이지를 새로고침해요              │
│                                         │
│   (iOS Safari / Android Chrome /        │  플랫폼별 분기 (UA 기반)
│    데스크톱 — 분기 라벨 변경)           │
│                                         │
│         갤러리에서 고르기                │
│                                         │
└─────────────────────────────────────────┘
```

권한 4상태는 **navigator.permissions.query({ name: 'camera' })** 결과 또는 `getUserMedia` reject NotAllowedError + 재시도 카운트로 분기:

| state | 분기 |
|---|---|
| `prompt` | §2.2.a |
| `granted` | §2.2.b |
| `denied` (deniedCount=1) | §2.2.c |
| `denied` (deniedCount≥2 또는 dismiss=permanent) | §2.2.d |

### 2.3 AngleGuide 형상 (인라인 SVG)

viewBox 0 0 200 200, stroke 2.

#### 2.3.a front
타원 중앙 정렬, 가로 78% / 세로 88%.
```xml
<svg viewBox="0 0 200 200">
  <ellipse cx="100" cy="100" rx="78" ry="88"
           stroke="var(--color-camera-guide-oval)"
           fill="none" stroke-width="2"/>
</svg>
```

#### 2.3.b left
타원 우측 50% 클립 + 코끝 가이드 라인 (수직, 중앙 약간 우측).
```xml
<svg viewBox="0 0 200 200">
  <defs>
    <clipPath id="leftClip"><rect x="0" y="0" width="100" height="200"/></clipPath>
  </defs>
  <ellipse cx="100" cy="100" rx="78" ry="88"
           stroke="var(--color-camera-guide-oval)"
           fill="none" stroke-width="2" clip-path="url(#leftClip)"/>
  <line x1="115" y1="60" x2="115" y2="140"
        stroke="var(--color-camera-guide-line)" stroke-width="2"
        stroke-dasharray="4 4"/>
</svg>
```

#### 2.3.c right
front 미러 + 좌측 50% 클립 + 코끝 가이드 (좌측 약간 좌측).
```xml
<svg viewBox="0 0 200 200">
  <defs>
    <clipPath id="rightClip"><rect x="100" y="0" width="100" height="200"/></clipPath>
  </defs>
  <ellipse cx="100" cy="100" rx="78" ry="88"
           stroke="var(--color-camera-guide-oval)"
           fill="none" stroke-width="2" clip-path="url(#rightClip)"/>
  <line x1="85" y1="60" x2="85" y2="140"
        stroke="var(--color-camera-guide-line)" stroke-width="2"
        stroke-dasharray="4 4"/>
</svg>
```

정렬 OK 시 stroke 색 → `--color-camera-check-ok`. 정렬 fail (얼굴이 가이드 밖) → `--color-camera-check-warn` + 미세 진동 (`scale(0.99→1)` 100ms loop).

### 2.4 진행 도트

3 dot, 좌→우 = front / left / right.

| 상태 | 시각 | 토큰 |
|---|---|---|
| 미촬영 | 8px outline | `--color-fg-subtle` 1px ring |
| 현재 | 10px ring | `--color-accent` 2px ring |
| 채워짐 | 8px solid | `--color-accent-dim` fill |

### 2.5 셔터 + 사이드레일

#### 2.5.a 셔터
- 외곽 ring 72px, stroke 3px `--color-surface`
- 내부 fill 64px, `--color-surface`, `--shadow-raised`
- press: scale(0.94) 80ms, release: scale(1) 120ms easing standard

#### 2.5.b 사이드레일 (좌측 세로 스택)
- 토치 on/off (`Zap` icon, 24)
- 카메라 전환 (`SwitchCamera` icon, 24)
- angle prev / next (`ChevronUp` / `ChevronDown`)
- 각 버튼: 44 hit area, radius-full, bg `rgba(0,0,0,.32)`, fg `--color-surface`

#### 2.5.c 미리보기 분기
셔터 → 200ms freeze (현재 프레임 정지) → bottom sheet 진입:

```
┌─────────────────────────────────────────┐
│         (캡처된 정사각 미리보기)         │  1024×1024 다운스케일
│                                         │
│   [ 다시 찍기 ]      [ 사용 ]           │  retake secondary, use primary
└─────────────────────────────────────────┘
```

"사용" → 클라이언트 EXIF strip + 1024 리사이즈 + JPG 80% → upload → 다음 angle로 진행 도트 이동.
"다시 찍기" → freeze 해제, allowed 상태로 복귀.

### 2.6 에러 fallback (카메라 하드웨어/충돌)

| MediaError | 화면 | CTA |
|---|---|---|
| `NotFoundError` (카메라 미존재) | 전용 카드 | 갤러리 |
| `NotReadableError` (다른 앱 점유) | 전용 카드 | retry + 갤러리 |
| `OverconstrainedError` | allowed로 fallback (제약 완화) | — |

### 2.7 카피 (ko/en + i18n 키)

| 키 | ko | en |
|---|---|---|
| record.capture.permission.prompt.title | 카메라를 잠깐 쓸게요 | Allow camera |
| record.capture.permission.prompt.body | 사진을 정사각으로 정리해서 저장해요 | Photos save as 1:1 squares |
| record.capture.permission.allow | 허용 | Allow |
| record.capture.permission.gallery | 갤러리에서 고르기 | Choose from gallery |
| record.capture.permission.deniedOnce.title | 다시 한 번 허용해 주세요 | Try once more |
| record.capture.permission.deniedOnce.body | 카메라 없이도 갤러리에서 고를 수 있어요 | You can pick from gallery instead |
| record.capture.permission.deniedPermanent.title | 브라우저 설정에서 권한을 켜주세요 | Open browser settings |
| record.capture.permission.deniedPermanent.body | 주소창 좌측 자물쇠 → 카메라 → 허용 | Lock icon · Camera · Allow |
| record.capture.angle.front | 정면 | Front |
| record.capture.angle.left | 좌측 | Left |
| record.capture.angle.right | 우측 | Right |
| record.capture.shutter | 촬영 | Capture |
| record.capture.preview.use | 사용 | Use |
| record.capture.preview.retake | 다시 찍기 | Retake |

(14 keys)

### 2.8 사용 토큰

| 요소 | 토큰 |
|---|---|
| 셸 배경 | `--color-camera-bg` |
| AngleGuide oval | `--color-camera-guide-oval` |
| AngleGuide nose line | `--color-camera-guide-line` |
| 정렬 OK | `--color-camera-check-ok` |
| 정렬 warn | `--color-camera-check-warn` |
| 진행 도트 active | `--color-accent` |
| 진행 도트 filled | `--color-accent-dim` |
| 셔터 fill | `--color-surface` |
| 사이드레일 bg | `rgba(0,0,0,.32)` |
| 미리보기 시트 모서리 | `--radius-lg` |

---

## §3. PhotoCapture 그리드 변경

### 3.1 의도
한 줄 — "3슬롯 그리드. 빈/채워진 시각 명세 + ⋯ 메뉴 도입."

오늘 화면(/today)에서 `<PhotoCapture />` 컴포넌트가 렌더하는 3개 정사각 슬롯. 좌→우 순서 = front / left / right (CLAUDE.md §2.2).

### 3.2 빈 슬롯

```
┌─────────────────┐
│                 │   1:1, radius-md(12)
│       +         │   점선 1px --color-border-strong
│                 │   중앙 + 아이콘 (Plus, 24, --color-fg-muted)
│      정면        │   하단 라벨 (text-caption, --color-fg-muted)
│                 │
└─────────────────┘
```

- tap → AddPhotoSheet open with `defaultAngle = <slot.angle>`
- hover (데스크톱): `--color-accent-dim` 1px solid border 전환
- focus visible: `--color-accent` 2px ring offset 2

### 3.3 채워진 슬롯

```
┌─────────────────┐
│         ┌───┐   │   imageUrl, object-fit: cover
│         │ ⋯ │   │   ⋯ 버튼: 28 ring, --color-surface bg, --shadow-raised
│         └───┘   │   우상단 8px inset
│                 │
│      정면        │   라벨은 하단 배지(optional, accent-dim bg, accent-text)
│                 │
└─────────────────┘
```

- 슬롯 자체 tap → ⋯ 메뉴 열기는 **하지 않음** (미리보기 라이트박스로 분기 가능, MVP에선 보류)
- ⋯ 버튼 tap → 액션 시트 / 팝오버 (모바일 = bottom sheet, 데스크톱 = popover)
- transient state (uploading / error) 오버레이는 §4.3 토스트와 분리되어 슬롯 내부에 표시 (loader spinner 또는 ! 배지)

### 3.4 long-press 보조 (모바일 한정)

채워진 슬롯 long-press 400ms → ⋯ 메뉴와 동등한 액션 시트 노출.
- 햅틱 없음 (모바일 웹 한정 — Web Vibration API는 신뢰성 낮음)
- press 진행 visual: scale(0.98) + opacity(0.8) 250ms

### 3.5 ⋯ 메뉴 항목

```
┌─────────────────────┐
│ 다시 촬영            │  → CaptureShell open with angle
│ 갤러리에서 교체       │  → file picker direct
│ ─────────────       │
│ 삭제                 │  → optimistic remove + 토스트(undo 5s)
└─────────────────────┘
```

삭제는 **즉시 UI 반영(optimistic)** + 토스트 undo. 5초 내 undo 미선택 시 서버 commit. (다크 패턴 회피 — 별도 confirm 모달 없음.)

### 3.6 카피 (ko/en + i18n 키)

| 키 | ko | en |
|---|---|---|
| record.photos.menu.retake | 다시 촬영 | Retake |
| record.photos.menu.replace | 갤러리에서 교체 | Replace from gallery |
| record.photos.menu.delete | 삭제 | Delete |
| record.photos.menu.deletedToast | 삭제했어요 | Deleted |
| record.photos.menu.undo | 되돌리기 | Undo |

(5 keys)

### 3.7 사용 토큰

| 요소 | 토큰 |
|---|---|
| 슬롯 모서리 | `--radius-md` (현재) — 부록 A 권고: `--radius-photoslot: 14px` 도입 검토 |
| 빈 슬롯 점선 | `--color-border-strong` |
| 채움 슬롯 그림자 | `--shadow-raised` |
| ⋯ 버튼 bg | `--color-surface` |
| 메뉴 시트 bg | `--color-surface` |
| 메뉴 항목 hover | `--color-surface-2` |
| 삭제 항목 fg | `--color-fg` (빨간색 사용 금지 — 다크 패턴 회피 일환) |

---

## §4. 엣지 케이스

### 4.1 카메라 권한
§2.2 와이어 재참조. denied-permanent에서 **OS별 단계 안내**는 UA 기반 분기:
- iOS Safari: "설정 → Safari → 카메라 → 허용"
- Android Chrome: "주소창 자물쇠 → 권한 → 카메라"
- 데스크톱 Chrome/Safari/Firefox: "주소창 좌측 사이트 정보 → 카메라 → 허용"

본 분기 카피는 §2.7 `record.capture.permission.deniedPermanent.body` 1줄로 통합, 상세 단계는 expandable list로 노출 (3 step 인라인).

### 4.2 미래 날짜 가드 (CLAUDE.md §5.5)

3중 가드 (UI / 라우트 / 업로드):

| 레이어 | 동작 |
|---|---|
| 캘린더 셀 | `aria-disabled="true"`, `opacity: 40%`, `pointer-events: none`, tap 시 carousel 무반응 |
| 라우트 가드 | route handler에서 `isFuture(date)` true → 403 + 토스트 트리거 |
| 업로드 가드 | `uploadAnglePhoto({ date, angle })` 진입 시 동일 체크 → reject |

미래 날짜 셀을 사용자가 어떻게든 직접 URL로 진입한 경우 (라우트 가드 폴백): 빈 상태 페이지 + 안내 모달 표시.

#### 카피

| 키 | ko | en |
|---|---|---|
| record.calendar.future.title | 아직 오지 않은 날이에요 | Not yet |
| record.calendar.future.body | 오늘이나 지난 날만 기록할 수 있어요 | Only today or past dates |
| record.calendar.future.dismiss | 알겠어요 | Got it |

(3 keys)

### 4.3 업로드 진행 / 실패 / 재시도 토스트 (single-stack)

#### 4.3.a 정책
- **single-stack**: 한 번에 1 토스트만. 새 토스트가 트리거되면 직전 토스트가 즉시 dismiss.
- **250ms grace**: 새 토스트 진입 전 직전 토스트의 자연 dismiss 애니메이션을 보장하기 위한 대기. 즉시 교체로 인한 깜빡임 방지.
- ARIA: 진행/완료 = `role="status"`, 실패 = `role="alert"`.

#### 4.3.b 위치
- 모바일: 하단, safe-area-inset-bottom + 80px above (탭바 위)
- 데스크톱: 우하단, 24px inset

#### 4.3.c 4종 토스트

| 종류 | 아이콘 | 배경 | 텍스트 | 버튼 | role |
|---|---|---|---|---|---|
| uploading | spinner (animated) | `--color-surface` | "올리는 중..." | — | status |
| uploaded | check | `--color-accent-dim` | "저장됐어요" | — | status |
| failed | ! | `--color-surface` (warn fg) | "잠깐 멈췄어요. 다시 시도할게요" | "다시 시도" | alert |
| retry-pending | spinner | `--color-surface` | "올리는 중..." | — | status |

#### 4.3.d 카피

| 키 | ko | en |
|---|---|---|
| record.photos.toast.uploading | 올리는 중... | Uploading... |
| record.photos.toast.uploaded | 저장됐어요 | Saved |
| record.photos.toast.failed | 잠깐 멈췄어요. 다시 시도할게요 | Hold on, retrying |
| record.photos.toast.retry | 다시 시도 | Retry |

(4 keys)

### 4.4 외 엣지
- **네트워크 오프라인**: 업로드 실패 → failed 토스트 + 자동 재시도 큐 (background sync). 큐 진입 카피는 별도 i18n 키 후속 추가.
- **이미지 EXIF orientation 비정상**: 클라이언트에서 strip + 회전 정규화 (CLAUDE.md §1.4 강제).
- **angle mismatch (비교 시)**: 본 Spec 범위 외. CompareView Spec 별도.

---

## 부록 A. 디자인 토큰 참조표

### A.1 현재 사용 토큰 (handoff/tokens/colors.css 기준)

| 용도 | 현재값 | 출처 라인 |
|---|---|---|
| accent | #2C6ECB | colors.css:20 |
| accent-dim | #E8F0FB | colors.css:21 |
| accent-text | #1F4E94 | colors.css:22 |
| surface | #FFFFFF | colors.css:10 |
| surface-2 | #F5F5F7 | colors.css:11 |
| fg | #1D1D1F | colors.css:15 |
| fg-muted | #6E6E73 | colors.css:16 |
| fg-subtle | #A1A1A6 | colors.css:17 |
| border | rgba(0,0,0,.08) | colors.css:25 |
| border-strong | rgba(0,0,0,.14) | colors.css:26 |
| camera-bg | #0A0A0F | colors.css:30 |
| camera-guide-oval | rgba(44,110,203,.70) | colors.css:31 |
| camera-guide-line | rgba(255,210,50,.50) | colors.css:32 |
| camera-check-ok | #2C6ECB | colors.css:33 |
| camera-check-warn | rgba(255,160,40,.90) | colors.css:34 |
| radius-md | 12px | colors.css:49 |
| radius-lg | 16px | colors.css:50 |
| radius-xl | 20px | colors.css:51 |
| shadow-raised | 0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.06) | colors.css:85 |
| shadow-lg | 0 20px 48px rgba(0,0,0,.18) | colors.css:86 |
| duration-enter | 280ms | colors.css:95 |
| duration-exit | 200ms | colors.css:96 |
| ease-emphasis | cubic-bezier(0.2, 0, 0, 1) | colors.css:90 |
| ease-exit | cubic-bezier(0.4, 0, 1, 1) | colors.css:91 |

### A.2 신규 토큰 권고 (직접 반영 X — 부록 기록만)

본 Spec 작성 시점에 **새 토큰을 colors.css에 추가하지 않는다**. 후속 협의 시 채택 여부 결정.

1. **`--radius-photoslot: 14px`** — md(12)와 lg(16) 사이 미세값. 슬롯 모서리 전용. 현재 md(12) 그대로 사용해도 무방하나, 슬롯이 시각적으로 약간 더 부드럽길 원한다면 도입.
2. **`--color-backdrop: rgba(0, 0, 0, 0.32)`** — 시트/모달 backdrop 전용 토큰. 현재 inline value로 흩어져 있음. 다크모드 대응 시 자동 처리 가능.
3. **`--toast-offset-bottom-mobile: 80px`** — 토스트 위치 통일을 위한 토큰. 탭바 높이 + 여유 공간 합계. 탭바 높이 변경 시 1곳만 수정.

이 3건은 부록 B 결정/기각 표에 "보류" 행으로 기록.

### A.3 폰트 정책 (handoff visual용)
- handoff/photocapture-visual/index.html은 **외부 CDN 로드 금지**.
- `--font-display` / `--font-body` CSS 변수 정의 + fallback `system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif`만 사용.
- 실제 앱(`app/globals.css`)에서는 Pretendard Variable을 self-host (`public/fonts/`)으로 로드. handoff visual은 폰트 미러링 없이 fallback으로 충분.

---

## 부록 B. 결정 / 기각 표

| # | 결정 | 채택 | 기각 후보 | 근거 |
|---|---|---|---|---|
| B-01 | 갤러리 차단 정책 | 차단하지 않음 | "카메라 권한 거부 시 진입 차단" | UX §5.3 "안 해도 된다" 인상 유지 |
| B-02 | AngleGuide 정렬 fail 색 | accent-dim 유지 + warn 색은 카메라 한정 | red 강한 경고 톤 | 진단/의료 톤 회피 |
| B-03 | 미래 날짜 가드 위치 | 셀 + 라우트 + 업로드 3중 | 셀만 비활성 | CLAUDE.md §5.5 강제 — 단일 가드는 우회 가능 |
| B-04 | 토스트 stack 정책 | single-stack + 250ms grace | multi-stack | 모바일 화면 점유 최소 + 인지 부담 ↓ |
| B-05 | ⋯ 메뉴 위치 | 우상단 inset | 슬롯 하단 텍스트 라벨 | 터치 hit 영역 + 시각 노이즈 ↓ |
| B-06 | 삭제 confirm | optimistic + undo 토스트 | confirm 모달 차단 | 다크 패턴 회피 + UX §5.4 저장 흐름 차단 금지 |
| B-07 | long-press 햅틱 | 사용 안 함 | Web Vibration API | 모바일 웹에서 신뢰성 낮음 |
| B-08 | 데스크톱 시트 CTA 순서 | 갤러리 좌(primary) / 카메라 우 | 모바일과 동일 순서 | 데스크톱 카메라 접근성 낮음 |
| B-09 | 미래 날짜 안내 톤 | "아직 오지 않은 날이에요" | "미래는 작성 불가" | 친근 톤 + 도메인(개인 일기) 존중 |
| B-10 | 진행 도트 형태 | 8/10px ring + dim fill | 숫자 라벨 (1/3, 2/3...) | 시각적 단순성 + 글 줄임 |
| B-11 | radius-photoslot 신규 토큰 | **보류** (부록 A.2 #1) | 즉시 도입 | 본 작업 범위 — frontend Agent 협의 |
| B-12 | color-backdrop 신규 토큰 | **보류** (부록 A.2 #2) | 즉시 도입 | 동일 |
| B-13 | toast-offset 신규 토큰 | **보류** (부록 A.2 #3) | 즉시 도입 | 동일 |
| B-14 | i18n 키 실제 추가 | 본 Spec에서 명세만, JSON 미수정 | 즉시 추가 | 사용자 확정 — frontend 후속 PR에서 처리 |
| B-15 | handoff visual 폰트 로드 | 외부 CDN 금지, fallback만 | Pretendard CDN 링크 | 사용자 확정 + 오프라인 핸드오프 보장 |

---

## 부록 C. i18n 키 인벤토리 (요약)

| 섹션 | 네임스페이스 | 키 수 |
|---|---|---|
| §1 AddPhotoSheet | `record.photos.sheet.*` | 6 |
| §2 CaptureShell | `record.capture.*` | 14 |
| §3 ⋯ 메뉴 | `record.photos.menu.*` | 5 |
| §4.2 미래 날짜 | `record.calendar.future.*` | 3 |
| §4.3 토스트 | `record.photos.toast.*` | 4 |
| **총합** | | **32** |

본 32개 키는 **`messages/ko.json` / `messages/en.json`에 자동 추가되지 않는다**. 후속 frontend 구현 PR에서 동일 키/카피로 등록할 것.

---

## 부록 D. 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 1.0 | 2026-05-09 | 초안 — design Agent 작성. 3 산출물(Spec.md / index.html / tokens.css) 동시 생성. |
