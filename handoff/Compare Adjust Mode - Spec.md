# Compare Adjust Mode — Design Spec

버전 1.0 · 2026-05-10 · 적용 범위: Compare 화면의 사진 위치/크기 조정 흐름.
1차 진실원: 본 문서. Frontend 구현 및 QA 시나리오 단일 참조점.

---

## §0 개요

### 0.1 목적
Compare 화면에서 두 사진의 위치/크기를 사용자가 의도적으로 맞춰 비교할 수 있도록, **명시적이고 학습 가능한 "조정 모드"(Adjust Mode)** 를 추가한다. 기존 인라인 제스처(핀치, long-press pan, Shift+drag)는 숙련 사용자 경험으로 보존하되, 처음 만나는 사용자도 버튼 → 모드 → 적용 흐름으로 조작을 발견할 수 있게 한다.

### 0.2 적용 화면
- `app/(app)/compare/page.tsx` 의 `<CompareView>` (`components/compare/CompareView.tsx`)
- 본 spec은 Compare 외 다른 화면 (Today / Calendar / Settings) 에 영향 없음.

### 0.3 전제 조건
- 이미지 규격은 CLAUDE.md §1 의 1024×1024 정사각 / EXIF 제거 / 1:1 규격을 따른다. 본 모드는 표시 변환(`scale`, `ox`, `oy`)만 다루며 원본 픽셀을 변경하지 않는다.
- 미래 날짜 진입 차단은 CLAUDE.md §5.5 정책을 따르며, Compare 진입 시점에서 이미 보장된다. 본 모드는 추가 가드 책임 없음.
- 동일 angle 비교 가드(`splitHidden` 등)는 현행 Compare 로직을 따른다.

### 0.4 기준 기기
- 모바일: 375pt 폭 (iPhone 14 기준), 컨텐츠 영역 정사각 375pt.
- 데스크톱: 1280pt 폭, 비교 영역 중앙 정렬, 모드 활성 시 동일한 4단 구성을 480pt 폭의 우측 패널 또는 중앙 카드로 표시.

### 0.5 톤
- 진단/의료 인상 회피. "정밀 조정", "측정" 같은 단어 사용 금지.
- 색상은 본문 톤(부드러운 surface 위주). 빨간/주황 위험 색은 비활성/오류에도 사용하지 않는다.
- 모션은 짧고 부드럽게 (180ms 이하), reduced-motion 환경에서는 즉시 전환.

---

## §1 진입

### 1.1 트리거
Compare 하단 컨트롤 바, 현 `A / Reset / B` 그룹의 우측에 **"조정"** 버튼을 추가한다.
- 아이콘 + 라벨 ("✥" 또는 4방향 화살표 아이콘 + "조정")
- 단일 탭 → Adjust Mode 진입

### 1.2 가시성·활성 조건
- `splitHidden === true` (동일 날짜 비교) → 버튼 자체를 렌더하지 않는다.
- 두 측 모두 사진 없음 → 버튼 비활성 (`aria-disabled="true"`).
- 한 측만 사진 있음 → 버튼은 활성, 진입 시 사진 있는 측이 기본 활성 측.
- 미래 날짜 시나리오는 Compare 진입 시 이미 차단되므로 본 모드는 무관.

### 1.3 기본 활성 측
진입 시 활성 측 결정 순서:
1. 직전 세션에서 마지막으로 조정한 측(`activeSide`)이 있고 그 측에 사진이 있으면 그 측.
2. 없으면 A (`fromDate` 측).
3. A에 사진이 없으면 B.

### 1.4 ASCII 와이어 (Compare 하단 바)

```
모바일 375pt — Compare 하단 컨트롤 바
┌───────────────────────────────────────────┐
│  [ A ]   [ ↺ Reset ]   [ B ]   [ ✥ 조정 ] │
└───────────────────────────────────────────┘
```

---

## §2 모드 UI

### 2.1 진입 형태
**모달이 아닌 in-place 컨테이너 변형.**
- Compare 영역 자체가 모드로 전환된다.
- 미리보기 좌표·확대 상태는 모드 진입 시점의 값을 그대로 유지한다 (연속성 보존).

### 2.2 4단 수직 구성

| 영역 | 높이 | 구성 |
|---|---|---|
| 헤더 | 56pt | ← 취소  ·  "조정 중 · A 사진"  ·  적용 |
| 측 세그먼트 | 44pt | `[ A ]   [ B ]` 토글 (Pill segmented control) |
| 미리보기 | 375pt 정사각 | 분할선 숨김, 활성 측 100% / 비활성 측 30% opacity |
| 컨트롤 패널 | ~200pt | 확대 슬라이더 + 방향 패드 + 리셋 |

비활성 측은 미리보기에 함께 표시되어 정렬 비교가 가능해야 한다. 단, 입력은 활성 측에만 적용된다.

### 2.3 모바일 와이어 (375pt)

```
┌─────────────────────────────────────────────┐
│ ←  조정 중 · A 사진               적용      │  56pt 헤더
├─────────────────────────────────────────────┤
│           [   A   ]   [   B   ]             │  44pt 세그먼트
├─────────────────────────────────────────────┤
│                                             │
│                                             │
│            (미리보기 정사각 375pt)            │
│         분할선 숨김, 비활성 측 30% dim         │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│  확대  ●─────────────●──────────────  100%  │
│        0.5×        1.0×          3.0×       │
│                                             │
│              ┌─────┐                        │
│              │  ↑  │                        │
│        ┌─────┼─────┼─────┐                  │
│        │  ←  │     │  →  │                  │
│        └─────┼─────┼─────┘                  │
│              │  ↓  │                        │
│              └─────┘                        │
│                                             │
│           [  ↺  원래대로 (이 측)  ]           │
└─────────────────────────────────────────────┘
```

### 2.4 데스크톱 와이어 (1280pt)

```
1280pt 컨테이너 — 비교 영역 좌측 768pt, 컨트롤 패널 우측 480pt
┌─────────────────────────────────┬───────────────────────────┐
│                                 │ ←  조정 중 · A    적용     │
│                                 ├───────────────────────────┤
│                                 │   [   A   ]   [   B   ]   │
│                                 ├───────────────────────────┤
│       미리보기 (정사각)           │ 확대                       │
│       768pt × 768pt              │ ●────────●──────  100%    │
│       비활성 측 30% dim           │                           │
│                                 │         ↑                 │
│                                 │      ←  ●  →               │
│                                 │         ↓                 │
│                                 │                           │
│                                 │   [  ↺  원래대로 (이 측) ]  │
└─────────────────────────────────┴───────────────────────────┘
```

데스크톱에서도 4단 수직 구성은 동일하지만, 미리보기와 컨트롤이 좌우로 배치된다. 폭이 768pt 미만이면 모바일 레이아웃으로 폴백.

### 2.5 전이
- 진입: 헤더 슬라이드인 200ms ease-out, 컨트롤 패널 페이드 인 150ms.
- 이탈(적용/취소): 같은 시간, 역방향.
- `prefers-reduced-motion: reduce` 시 즉시 전환 (애니메이션 0ms).
- 측 세그먼트 전환: 비활성 측 dim 토글은 120ms crossfade, reduced-motion 시 즉시.

---

## §3 컨트롤 명세

### 3.1 확대 슬라이더
- 범위: **0.5× ~ 3×**
- thumb: 24×24, `--radius-full`, `--color-accent`
- track: 4pt, `--color-surface-2`, 진행 부분은 `--color-accent` 50% 톤
- **1.0× magnet ±0.05**: 사용자가 0.95~1.05 구간에 들어오면 1.00에 스냅. 스냅 시 라벨 "100%"로 즉시 표시.
- 라벨: 슬라이더 우측에 현재 배율 "100%" 형식, 정수 % 반올림.
- 키보드 이동: `←/→` = ±0.1×, `Shift + ←/→` = ±0.5×.

### 3.2 위치 방향 패드
- 4개 버튼 ↑ ↓ ← →, 각 **56×56pt**, 2×2 배치 (정확히는 위/아래는 가운데 열, 좌/우는 중간 행 — 십자 모양).
- **홀드 가속 곡선**:
  - 0~250ms: 1px / tick
  - 250~500ms: 4px / tick
  - 500ms 이후: 8px / tick
  - tick 간격: 120ms
- 단일 탭: 1px 이동.
- **클램프**: `|ox| ≤ (s − 1) × halfSize`, `|oy| ≤ (s − 1) × halfSize`. `s < 1` 인 경우 `ox = oy = 0` 강제 (이미지가 컨테이너보다 작아 이동 의미 없음).
- 클램프 경계에 닿으면 해당 버튼은 시각적으로 살짝 비활성 (`opacity 0.5`)하고 햅틱 1회.

### 3.3 리셋(이 측)
- 단일 탭 → `scale = 1.0`, `ox = 0`, `oy = 0`.
- 활성 측에만 적용. 다른 측은 영향 없음.
- 확인 모달 없음 (실수해도 취소로 되돌릴 수 있으므로).

### 3.4 회전
- 본 모드에 **포함하지 않는다.**
- 회전은 기존 `RotateButton` (사진 별 90° 단위) 책임. 책임 중복 방지.
- Adjust Mode 진입 시점에 이미 적용된 회전값은 그대로 유지된다 (변환 파이프라인은 외부 상태).

### 3.5 현재값 라이브 라벨
- 컨트롤 패널 상단 또는 슬라이더 옆에 현재 변환값 표시.
- 형식: `확대 100% · 위치 X +12 · Y −4`
- `aria-live="polite"`, 1초 throttle로 발화. 연속 조작 중 과도한 발화 방지.

---

## §4 상태 관리

### 4.1 entrySnapshot
- 모드 진입 시 `tFrom`, `tTo` 두 측의 변환값을 스냅샷으로 저장한다.
  ```ts
  type Transform = { scale: number; ox: number; oy: number };
  type EntrySnapshot = { A: Transform; B: Transform };
  ```

### 4.2 적용
- 헤더의 "적용" 탭 → 현재 변환값을 그대로 유지하고 모드를 종료한다.
- 별도 저장 호출 없음 (Compare는 현재 변환값을 세션 메모리에만 들고 있으므로).

### 4.3 취소
다음 트리거는 모두 entrySnapshot 복원으로 통일된다.
- 헤더 ← 버튼
- 키보드 `Esc`
- 외부 라우트 이탈 시도 (Compare 페이지 떠나기)
- Android 하드웨어 백 버튼
- 외부에서 angle 변경

복원 동작: `setTFrom(entrySnapshot.A)`, `setTTo(entrySnapshot.B)` → 모드 종료. 토스트 "조정 취소됨" 1회 표시 (외부 라우트 이탈 시에만; 명시적 ← 클릭이나 Esc는 토스트 생략).

### 4.4 제스처 라우팅
모드 활성 동안:
- 미리보기 컨테이너의 `pointerdown / touchstart / wheel` 이벤트는 **모드 내부 입력으로만 처리**된다.
- 외부 split drag 핸들과 long-press pan 게이트는 일시 비활성.
- 모드 종료 시 외부 제스처 복귀.

### 4.5 세션 메모리
- 현행 정책 유지: 같은 `fromDate + toDate + angle` 조합 내에서만 변환값 유지. 조합이 바뀌면 변환값은 초기화.
- Adjust Mode 적용으로 갱신된 변환값도 동일 정책을 따른다 (영구 저장 없음).

---

## §5 A11y

### 5.1 키보드
| 키 | 동작 |
|---|---|
| `Esc` | 취소 (entrySnapshot 복원 후 종료) |
| `Enter` | 적용 |
| `Tab` / `Shift+Tab` | 헤더 → 세그먼트 → 슬라이더 → 패드 ↑→→→↓→← 순환 |
| `1` | A 측으로 전환 |
| `2` | B 측으로 전환 |
| `←/→` (슬라이더 포커스) | ±0.1× |
| `Shift + ←/→` (슬라이더 포커스) | ±0.5× |
| `↑/↓/←/→` (패드 포커스 외 모드 전체) | 활성 측 위치 1px 이동 |
| `Shift + 화살표` | 활성 측 위치 10px 이동 |

### 5.2 ARIA
- 슬라이더: `role="slider"`, `aria-valuemin="0.5"`, `aria-valuemax="3"`, `aria-valuenow="{scale}"`, `aria-valuetext="확대 100%"`.
- 측 세그먼트: `role="tablist"` + 각 버튼 `role="tab"`, `aria-selected="true|false"`.
- 방향 패드 각 버튼: `aria-label="위로 이동" / "아래로 이동" / "왼쪽으로 이동" / "오른쪽으로 이동"`.
- 헤더 취소: `aria-label="조정 취소"`.
- 헤더 적용: `aria-label="조정 적용"`.
- 리셋: `aria-label="이 측 원래대로"`.

### 5.3 라이브 리전
- 컨트롤 패널 내 `aria-live="polite"` 영역에 현재값 라벨 발화.
- 1초 throttle로 "확대 100% 위치 X 12 Y −4" 형태.
- 측 전환 시에는 즉시 "B 사진 조정 중" 발화 (throttle 우회).

### 5.4 포커스 트랩
- 모드 활성 동안 포커스는 미리보기 + 컨트롤 영역 내에서만 순환한다.
- 외부 라우트 링크, 하단 탭 바 등은 포커스에서 제외.
- 모드 종료 시 포커스는 "조정" 버튼으로 복귀.

### 5.5 색 대비
- 비활성 측 30% opacity는 이미지에만 적용. 측 라벨/세그먼트 텍스트는 100% opacity 유지.
- 슬라이더 라벨, 라이브 라벨은 `--color-fg` (또는 `--color-fg-muted`) 위 `--color-surface`로 충분한 대비 확보.

---

## §6 엣지 케이스

### 6.1 한 측 사진 없음
- 해당 측 세그먼트 비활성 (`aria-disabled="true"`, opacity 0.5).
- 활성 시도 시 컨트롤 영역 자리에 안내 메시지: "이 날짜에는 {angle} 사진이 없어요."
- 슬라이더/패드/리셋은 미표시.

### 6.2 외부 라우트 이탈
- 모드 활성 중 다른 라우트로 이탈 시도 → 자동 취소 (entrySnapshot 복원).
- 토스트 1회: "조정 취소됨".
- "이탈 확인" 모달은 도입하지 않는다 (다크 패턴 방지, 흐름 차단 금지 원칙).

### 6.3 외부 angle 변경
- 모드 활성 중 angle 컨트롤이 외부에서 바뀌면 → 자동 취소.
- 변환값 자체는 angle 조합 변경으로 어차피 초기화되므로 entrySnapshot 복원 후 모드 종료만 수행.

### 6.4 미래 날짜
- Compare 진입 자체가 차단되므로 본 모드는 추가 가드 불필요.

### 6.5 reduced-motion
- 모드 전이 애니메이션 즉시.
- 슬라이더 magnet은 **유지** (시각 효과가 아닌 입력 보정 로직이므로).

### 6.6 Android 하드웨어 백
- 시스템 백 이벤트 → 취소로 매핑.
- Compare 페이지 자체를 떠나지 않도록 모드 활성 중에는 이벤트를 가로채 모드 종료에만 사용.

### 6.7 동시 두 측 사진 있음 + 한쪽만 회전된 상태
- 본 모드는 회전을 다루지 않으므로 회전값은 그대로 유지된다. 변환 파이프라인 상 회전 → 스케일 → 평행이동 순서를 가정한다.

---

## §7 토큰 · 스타일

기존 토큰만 사용한다. 신규 토큰 도입 금지.

| 용도 | 토큰 / 값 |
|---|---|
| 헤더 배경 | `var(--color-surface)` |
| 헤더 텍스트 | `var(--color-fg)` |
| 측 세그먼트 컨테이너 | `var(--color-surface-2)` + `--radius-full` |
| 측 세그먼트 active | `var(--color-accent)` 배경 + `var(--color-surface)` 텍스트 |
| 측 세그먼트 inactive | 투명 배경 + `var(--color-fg-muted)` 텍스트 |
| 컨트롤 패널 배경 | `var(--color-surface-2)` + `--radius-lg` + `var(--shadow-sm)` |
| 슬라이더 thumb | `var(--color-accent)` + `--radius-full` |
| 슬라이더 track | `var(--color-surface-2)` |
| 슬라이더 진행부 | `var(--color-accent)` (50% 톤) |
| 방향 패드 버튼 기본 | 투명 + 1pt `var(--color-border)` + `--radius-md` |
| 방향 패드 버튼 hover/press | `var(--color-surface-2)` |
| 방향 패드 클램프 경계 | `opacity 0.5` |
| 비활성 측 dim | `opacity: 0.3` |
| 라이브 라벨 | `var(--color-fg-muted)` |
| 미리보기 배경 | `var(--color-surface)` (현행 그대로) |

라운드: 버튼/슬라이더는 `--radius-md` (12pt), 컨트롤 패널 컨테이너는 `--radius-lg` (16pt), 측 세그먼트는 `--radius-full`. 그림자는 컨트롤 패널만 `--shadow-sm` 적용, 그 외는 평면.

---

## §8 구현 노트 (Frontend 위임 시 참고)

### 8.1 컴포넌트 분리 제안
- `<AdjustModeShell>`: Compare 컨테이너 내부에서 모드 전환을 감싸는 래퍼. `adjustOpen` 상태에 따라 4단 레이아웃 노출.
- `<AdjustHeader>`: 취소 / 타이틀 / 적용.
- `<SideSegment>`: A/B 토글, `activeSide` 제어.
- `<ZoomSlider>`: scale 0.5~3, magnet ±0.05.
- `<MoveDPad>`: 4방향 버튼 + 홀드 가속.
- `<ResetThisSide>`: 활성 측만 리셋.

### 8.2 상태 추가
`CompareView` 내부에 다음 상태 추가:
```ts
const [adjustOpen, setAdjustOpen] = useState(false);
const [adjustSide, setAdjustSide] = useState<'A' | 'B'>('A');
const [entrySnapshot, setEntrySnapshot] = useState<EntrySnapshot | null>(null);
```

적용 / 취소 동작은 모두 `setTFrom` / `setTTo` 통합 호출로 처리한다. 별도 저장 API 없음.

### 8.3 인라인 제스처와의 관계
- 모드 활성 동안 컨테이너 `onPointerDown` 등은 모드 내부 입력으로 라우트.
- 외부 split 드래그 핸들 (`SplitHandle`)은 모드 활성 시 렌더하되 `pointer-events: none` 처리 또는 분기.
- long-press pan 게이트 제거 여부는 본 spec 범위 밖. 모드가 사용자에게 정착된 이후 제거 검토 (아래 부록 B에서 미결로 표시).

### 8.4 i18n
- 키 명세는 부록 C 참조.
- 본 spec은 구현 단계의 JSON 파일 수정을 포함하지 않는다.
- 신규 키 도입 시 기존 `compare.*` 네임스페이스 컨벤션을 따른다.

### 8.5 테스트 우선순위 제안 (QA 위임)
1. 모드 진입 → 적용 → 변환값 보존
2. 모드 진입 → 취소 → entrySnapshot 복원
3. 외부 라우트 이탈 → 자동 취소 + 토스트
4. 슬라이더 magnet (0.95~1.05 → 1.00)
5. 방향 패드 홀드 가속 곡선 (1px → 4px → 8px)
6. 클램프 (`|o| ≤ (s−1)×halfSize`, `s<1`이면 0)
7. 한 측 사진 없음 → 세그먼트 비활성 + 안내
8. 키보드 전체 흐름 (Tab/Enter/Esc/1/2/화살표)
9. reduced-motion 환경에서 전이 즉시
10. 라이브 리전 1초 throttle

---

## 부록 A — 토큰 인벤토리

| 용도 | 토큰 |
|---|---|
| 헤더 배경 | `--color-surface` |
| 측 세그먼트 active | `--color-accent` |
| 슬라이더 thumb | `--color-accent` |
| 슬라이더 track | `--color-surface-2` |
| 컨트롤 패널 배경 | `--color-surface-2` |
| 비활성 dim | `opacity 0.3` |
| 패드 버튼 hover | `--color-surface-2` |
| 텍스트 라벨 | `--color-fg-muted` |
| 컨트롤 패널 그림자 | `--shadow-sm` |
| 라운드 (버튼·슬라이더) | `--radius-md` |
| 라운드 (패널) | `--radius-lg` |
| 라운드 (세그먼트) | `--radius-full` |

신규 토큰 도입 없음.

---

## 부록 B — 결정·기각

- ✅ **in-place 모드 (모달 아님)** — 미리보기 좌표/확대 연속성 보존, 비교 컨텍스트 단절 방지.
- ✅ **A/B 동시 표시 + 활성 측 토글** — 비교 본연의 의도 유지, 비활성 측을 dim으로 시각 구분.
- ✅ **확대 1.0× magnet** — 사용자가 "원본 크기"를 의도하는 경우가 잦음. 0.05 폭은 손가락 정밀도 한계와 일치.
- ✅ **방향 패드 홀드 가속** — 같은 버튼을 길게 누르면 빨라지는 패턴이 학습 비용 낮음.
- ❌ **풀스크린 모달** — 비교 컨텍스트가 끊겨 정렬 의도 상실.
- ❌ **핀치/드래그만으로 모드 진입** — 본 모드 도입의 출발점이 "사용자가 인라인 제스처를 학습하지 못한다"는 보고. 명시적 버튼이 핵심.
- ❌ **회전 포함** — `RotateButton`과 책임 중복. 본 모드는 위치·크기에만 집중.
- ❌ **자유 회전 슬라이더** — 90° 단위가 아닌 자유 회전은 정렬 일관성과 1024×1024 규격 의도(CLAUDE.md §1.3)를 약화시킨다.
- ❌ **두 측 동시 조정** — 인지 부담이 크고, 한 측씩 맞추는 흐름이 자연스럽다.
- ❌ **저장 후 영구 변환값 유지** — 본 앱은 기록 도구. 변환은 비교 세션의 표시 보정일 뿐, 원본을 건드리지 않는다는 §0.3 전제와 일치.
- ⚠️ **long-press pan 제거** — 본 spec 범위 밖. 모드 정착 후 후속 결정 (미결).
- ⚠️ **확대 라벨 단위 (배율 vs 퍼센트)** — 본 spec은 퍼센트로 통일. 배율("1.2×")을 병기할지 여부는 카피 단계에서 재검토 (미결).

---

## 부록 C — i18n 키 명세

구현 단계에서 추가. 본 spec은 키와 라벨 정의만 제공한다.

| 키 | 한국어 | English |
|---|---|---|
| `compare.adjust.enter` | 조정 | Adjust |
| `compare.adjust.title` | 조정 중 | Adjusting |
| `compare.adjust.titleSide` | 조정 중 · {side} 사진 | Adjusting · Photo {side} |
| `compare.adjust.apply` | 적용 | Apply |
| `compare.adjust.cancel` | 취소 | Cancel |
| `compare.adjust.reset` | 원래대로 | Reset |
| `compare.adjust.sideA` | A 사진 | Photo A |
| `compare.adjust.sideB` | B 사진 | Photo B |
| `compare.adjust.zoom` | 확대 | Zoom |
| `compare.adjust.position` | 위치 | Position |
| `compare.adjust.up` | 위로 이동 | Move up |
| `compare.adjust.down` | 아래로 이동 | Move down |
| `compare.adjust.left` | 왼쪽으로 이동 | Move left |
| `compare.adjust.right` | 오른쪽으로 이동 | Move right |
| `compare.adjust.missingPhoto` | 이 날짜에는 {angle} 사진이 없어요 | No {angle} photo on this date |
| `compare.adjust.toastCanceled` | 조정 취소됨 | Adjustment canceled |
| `compare.adjust.liveLabel` | 확대 {percent}% · 위치 X {ox} · Y {oy} | Zoom {percent}% · Position X {ox} · Y {oy} |
| `compare.adjust.resetThisSide` | 이 측 원래대로 | Reset this side |

---

## 부록 D — 변경 이력

- **1.0 · 2026-05-10** — 초안. 인라인 제스처(핀치/long-press pan/Shift+drag)의 학습 실패 보고를 받아, 명시적 Adjust Mode 도입. in-place 4단 레이아웃, A/B 토글, 1.0× magnet, 홀드 가속 패드, entrySnapshot 기반 적용/취소, 회전은 범위 외 명시.
