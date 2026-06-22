# Attendance / 근태 Workflow

Status: design slice (2026-06-17) **now backed for clock-in/out — Step 3 wired GPS + QR clock-in/out to
the real backend** (`submitAttendanceScan`; home shows the live open session; capture does camera QR +
GPS). The remaining target scope — breaks, live timer beyond elapsed, corrections, payroll, history — is
still deferred. The session/site/QR backend is the refined session-first model; see
`docs/product/21-attendance-payroll-workflow.md` and
`docs/engineering/11-attendance-payroll-technical-design.md` (As-built Steps 1–3) for the authoritative
spec. Note: this slice's UI strings are hardcoded Korean (1:1 design port); a ko/ja/en i18n pass is a
separate task.

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
  remains unbuilt. The home topline has small **이력** + **급여** links.
  - **Amount privacy toggle (eye icon):** the pay card amounts (예상 총 급여, 근무 인정 시간 / 근무일, and
    the daily 일급 column) can be hidden via the eye button. The hide effect uses **transparent text +
    `text-shadow` blur**, NOT `filter: blur()` — on iOS Safari a `filter: blur()` on text inside the
    `overflow: hidden` pay card clips its blur halo into a hard rectangle / white hairline (reported
    artifact). The text-shadow approach obscures cleanly with no edge box. Shadow color follows the card
    variant (ink on the light `--expected` card, white on the dark `--final` card). See
    `src/components/attendance/attendance.css` (`.entryrow__val.masked`, `.paycard.hide .pc__amt`,
    `.paycard.hide .pc__v`). (2026-06-22)

Screens:

- `/mobile/attendance` — **home (ring hero)** → `attendance-home.tsx`. Renders the four designed
  states: **출근 전 (idle)** · **근무 중 (open)** · **휴게 중 (break)** · **로딩 (skeleton)**. The live
  ring (navy = working, amber = break), info strip (장소/시각, 휴게 합계/횟수), clock-in/out + break
  buttons, and method chips (GPS+QR / Wi-Fi 준비중). User name + today's date are real (from the
  session); clock data is static placeholder. The clock button links to the capture flow.
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
