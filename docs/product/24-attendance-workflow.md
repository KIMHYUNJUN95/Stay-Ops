# Attendance / 근태 Workflow

Status: design slice (2026-06-17) **now backed for clock-in/out — Step 3 wired GPS + QR clock-in/out to
the real backend** (`submitAttendanceScan`; home shows the live open session; capture does camera QR +
GPS). The remaining target scope — breaks, live timer beyond elapsed, corrections, payroll, history — is
still deferred. The session/site/QR backend is the refined session-first model; see
`docs/product/21-attendance-payroll-workflow.md` and
`docs/engineering/11-attendance-payroll-technical-design.md` (As-built Steps 1–3) for the authoritative
spec. Note: this slice's UI strings are hardcoded Korean (1:1 design port); a ko/ja/en i18n pass is a
separate task. **출근자 명단(`/mobile/attendance/roster`) 구현 완료 (2026-06-24):** 관리자 역할이
당일(혹은 과거 날짜)의 실제 출근자를 실시간으로 조회할 수 있으며, 전화 연결 기능 포함.

## Design source

Ported from `Attendance Module v2.html` (high-fidelity handoff). Same ivory + deep-ink-navy tokens as
the rest of the app, plus attendance status hues (open / done / warn / info / invalid / danger) and a
monospace face for the live timer.

## Implementation (2026-06-17)

Frontend-only slice — **no backend** (no real clock state, GPS/QR, or persistence). Routes are gated
like every mobile route (auth + org context).

- Scope under `.att` in `src/components/attendance/attendance.css` (1:1 CSS port); icons in
  `att-icons.tsx`; the live-timer ring gradients in `AttRingDefs`.
- Nav entry `attendance` (`근태` / `勤怠` / `Attendance`, `Clock` icon) added to
  `mobileSidebarNavigation` (side menu + bottom-bar editor pool), `routeAccess`, and the shell
  launcher (`LAUNCHER_META.attendance`). Reached from the side menu / "추가" launcher / a pinned tab.
- **Integration choice:** the design's own 5-tab bottom bar (홈/이력/출퇴근/급여/내정보) is **not**
  rendered — it would clash with the app's global bottom nav. The home content's large clock button is
  the primary action instead, so no designed element is lost. **이력 is now built (Step 5, 2026-06-17)**
  as new UI in the existing `.att` token language (the v2 handoff had no 이력 frame). **급여 is now built
  (Step 10, 2026-06-18)** as new UI too (self monthly hourly expected-pay, `/mobile/attendance/pay`); 내정보
  remains unbuilt. The home shows **이력** + **급여** shortcut entry rows (`entryList`) in **all three
  states (idle / open / break)** — placed below the primary clock-in/out + break action buttons so the
  main action is always visually dominant. (2026-06-23)
  - **Transportation reimbursement entry (implemented 2026-06-26):** **교통비 제출** 백엔드 구현 완료. DB schema (3개 테이블), query layer, server actions, storage policy 적용됨. 진입 경로는 attendance-home quick-entry 목록 내 **`시급 급여` 바로 아래 행**으로 확정. 프론트엔드 UI 연결(transport-statement.tsx mock 제거 및 실데이터 props 주입)은 진행 중. 상세 구현: `docs/engineering/11-attendance-payroll-technical-design.md` "As-built — Transport Reimbursement Backend (2026-06-26)".
  - **Amount privacy toggle (eye icon):** the pay card amounts (예상 총 급여, 근무 인정 시간 / 근무일, and
    the daily 일급 column) can be hidden via the eye button. The hide effect uses **transparent text +
    `text-shadow` blur**, NOT `filter: blur()` — on iOS Safari a `filter: blur()` on text inside the
    `overflow: hidden` pay card clips its blur halo into a hard rectangle / white hairline (reported
    artifact). The text-shadow approach obscures cleanly with no edge box. Shadow color follows the card
    variant (ink on the light `--expected` card, white on the dark `--final` card). See
    `src/components/attendance/attendance.css` (`.entryrow__val.masked`, `.paycard.hide .pc__amt`,
    `.paycard.hide .pc__v`). (2026-06-22) **기본값은 가려진 상태(hidden)이며 사용자의 마지막 선택을
    `localStorage` (`stayops:attendance:pay-amount-visible`, `"1"` = shown / `"0"` = hidden) 에
    영속화한다 — 탭을 닫았다 다시 열어도 마지막 상태가 복원된다. `attendance-home`의 시급 급여 행과
    `/mobile/attendance/pay` 페이지가 같은 localStorage 키를 공유하므로, 한쪽에서 풀면 다른 쪽도 풀린
    채로 진입한다. SSR 안전: 첫 렌더는 항상 hidden으로 고정되고, `useEffect` 이후에 클라이언트에서
    저장된 값을 읽어 갱신한다 (hydration mismatch 없음). 구현 훅: `src/lib/use-persistent-toggle.ts`.
    (2026-06-23)

Screens:

- `/mobile/attendance` — **home (ring hero)** → `attendance-home.tsx`. Renders the four designed
  states: **출근 전 (idle)** · **근무 중 (open)** · **휴게 중 (break)** · **로딩 (skeleton)**. The live
  ring (navy = working, amber = break), info strip (장소/시각, 휴게 합계/횟수), clock-in/out + break
  buttons, and method chips (GPS+QR / Wi-Fi 준비중). User name + today's date are real (from the
  session); clock data is static placeholder. The clock button links to the capture flow. The **이력
  (history)** and **급여 (pay)** shortcut entry rows appear below the primary action buttons in **all
  three active states** (idle, open, break) so users can navigate to those screens without clocking
  out. **교통비 제출** 백엔드 구현 완료 (2026-06-26) — DB schema, query layer, server actions, storage policy. UI 연결 진행 중.
- `/mobile/attendance/history` — **own attendance history (Step 5, 2026-06-17)** → `attendance-history.tsx`.
  New self-view screen: today summary (세션/근무/휴게) + the user's own session list (date, 출근/퇴근
  time + site, status/검토/수동 chips, 근무·휴게 totals); a card opens a **detail bottom sheet** (shared
  drag-dismiss) with in/out detail, methods, break rows, and an abnormal/review marker. Data is
  strictly self-scoped server-side (`src/lib/attendance-history.ts`).
- `/mobile/attendance/capture` — **clock-in capture** → `attendance-capture.tsx`. QR scan view (corner
  frame, scan line, GPS chip) + the three **result sheets**: **성공 (출근 완료 + recap)**, **반경 밖
  (거리 게이지 138m)**, **위치 권한 거부** (`?result=`). Result sheets are portaled to `<body>` (the
  shell scroll container's `transform` traps `position: fixed`). **Scope (2026-06-22 fix):** because the
  sheet is portaled out of the page tree, its `BottomSheet` carries the `att` class (`className="att
  att__result-sheet"`) — all attendance result-sheet CSS is scoped under `.att`, so without it the
  portaled content rendered unstyled (giant intrinsic-size SVG icons, no recap layout). Tapping the
  scanner simulates a successful scan (prototype).
- `/mobile/attendance/correction` — **correction request form** → `attendance-correction-form.tsx`
  (reason chips · desired in/out time · site · memo · photos, fixed submit bar). From `Attendance
  Correction Request.html`. **Wired (Step 6, 2026-06-17):** controlled form → `createAttendanceCorrectionRequest`
  (self-only, current/previous Tokyo month only, ≤5 photos via `attendance-corrections/`); optional
  `?sessionId=` ties it to a session, else it's a session-less exception request (capture failures reach
  it). Desired-site uses a shared drag-dismiss picker.
- `/mobile/attendance/correction/status` — **request status** → `attendance-correction-status.tsx`,
  four states (**요청됨 / 검토 중 / 승인 / 반려**) with a 3-step timeline, request recap, reviewer
  comment, and 다시 요청. **Wired (Step 6):** data-driven from `?id=` (or latest), self-scoped; admin
  approve/reject is Step 7, so requests are `requested` for now (all four states render so Step 7 lights
  up without redesign).
- `/mobile/attendance/roster` — **출근자 명단 (Wired, 2026-06-24)** → `attendance-roster.tsx`. 관리자
  전용 실시간 출근자 현황 화면. 접근 권한: `cleaningRecordViewerRoles` (owner, office_admin, cs_staff,
  field_manager) — 일반 staff / part_time_staff는 접근 불가이며, 권한 없으면 `/mobile/attendance`로
  리다이렉트. 진입 경로: `attendance-home.tsx` 홈 바로가기 목록 하단(시급 급여 아래)에 `출근자 명단`
  버튼이 표시되며 권한 없는 역할에게는 미표시.
  - **화면 구성** ①주간 스트립(가로 스와이프, 출근 기록 있는 날 하단 점 표시, 미래 날짜 비활성)
    ②선택 날짜 + "오늘" 태그 + 출근/퇴근 카운트 메타 ③캘린더 BottomSheet 날짜 선택 버튼
    ④요약 카운트(근무 중 / 퇴근 완료 / 검토 필요 / 무효) ⑤직원 카드 리스트(출근 시각 순)
    ⑥빈 상태(해당 날짜 기록 없음).
  - **직원 카드**: 아바타 + 이름 + 역할, 상태 chip, 사이트명, 출근/퇴근/휴게 타임 스트립, 전화 버튼.
  - **URL**: `/mobile/attendance/roster?date=YYYY-MM-DD`. `date` 없으면 Tokyo 오늘 날짜.
    미래 및 90일 이전은 오늘로 clamp.
  - **데이터 소스**: `attendance_sessions` JOIN `profiles` JOIN `memberships` JOIN `attendance_sites`
    JOIN `attendance_breaks`. 서버 컴포넌트가 렌더 시 실시간 로드.
  - **세션 상태 정의**:
    | statusKey | 조건 | 표시 색상 |
    |---|---|---|
    | `working` | clock_in ✓, clock_out ✗, 오픈 브레이크 없음 | green |
    | `on_break` | clock_in ✓, clock_out ✗, 오픈 브레이크 ✓ | amber |
    | `done` | clock_in ✓, clock_out ✓ | slate |
    | `needs_review` | review_state = `needs_review` | orange |
    | `void` | invalidated_at not null | red |

### 전화 기능 (출근자 명단)

출근자 명단의 직원 카드에는 전화 연결 버튼이 포함된다.

- **데이터 소스**: `profiles.phone_number` (가입 시 등록한 번호).
- **링크 방식**: `<a href="tel:{phone_number}">` — 네이티브 전화 앱 연결 (PWA 포함).
- **표시 조건**: 세션 상태가 `working` 또는 `on_break` **이며** `profiles.phone_number` 가 존재하는
  경우에만 카드에 전화 버튼을 렌더링.
- **숨김 조건**: `done` / `needs_review` / `void` 상태이거나 phone_number 가 null / 빈 문자열인
  경우에는 전화 버튼을 표시하지 않음. 퇴근 후 직원에게 업무 목적으로 전화하는 혼선을 방지하기 위한
  의도적 설계.
- **권한**: 전화 버튼은 출근자 명단 접근 권한(`cleaningRecordViewerRoles`)을 가진 관리자만 볼 수 있음
  (화면 자체가 권한 게이트됨).

**Prototype flow (no backend):** the screens are click-navigable — 출근하기 → capture → (tap scanner)
성공 → 근무 중 → 휴게 시작 → 휴게 중 → 휴게 종료 → 근무 중 → 퇴근하기 → 출근 전; the home shows a
brief loading skeleton on entry; capture's 정정 요청 buttons open the correction form → 보내기 → 요청됨.
**Back buttons were removed from all attendance screens** (the global shell owns navigation). A
design-phase preview index existed during review and was **removed on completion**.

**Preview switchers:** because there is no backend yet, both screens carry a small top **preview
switcher** (Home: 출근 전/근무 중/휴게 중/로딩; Capture: 스캔/성공/반경 밖/위치 권한) so every designed
state is viewable. These are **design-phase scaffolding** — they (and the `?state=` / `?result=` query
params they mirror) get replaced by real attendance state when the backend lands. Copy is Korean-only
for the slice (nav label is ko/ja/en).

## Target product scope (for the eventual backend)

Clock in/out with method = GPS + QR (Wi-Fi later); break start/stop (clock-out blocked while on
break); session statuses (진행 중 / 완료 / 검토 필요 / 정정 대기 / 무효); correction requests
(요청됨 / 검토 중 / 승인 / 반려); radius/permission failure handling; history; payroll (예상 / 확정 /
대체됨 / 재오픈). All deferred — see the chip legend in the design for the full status vocabulary.
