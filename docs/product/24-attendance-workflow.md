# Attendance / 근태 Workflow

Status: live multi-slice attendance domain. The original 2026-06-17 design port is now backed by real
GPS + QR clock-in/out, breaks, self history, correction requests/status, self pay view, notifications,
transport-reimbursement backend, roster, and the admin attendance/payroll/transport dashboard slices.
The authoritative technical as-built log is
`docs/engineering/11-attendance-payroll-technical-design.md`. UI copy for the shipped surfaces is
dictionary-backed in ko/ja/en; new attendance UI must keep that contract.

Annual leave is being planned as a separate attendance-adjacent workflow for salary-based regular
employees. The source-of-truth draft is `docs/product/26-annual-leave-workflow.md`.

**출근자 명단(`/mobile/attendance/roster`) 구현 완료 (2026-06-24):** 관리자 역할이 당일(혹은 과거 날짜)의
실제 출근자를 실시간으로 조회할 수 있으며, 전화 연결 기능 포함.

**관리자 근태 대시보드 구현/하드닝 (2026-07-02):** `/admin/attendance` overview, review queue,
payroll, transport, wage management, and staff detail slices are wired to real server data. Overview KPI
counts are sourced from the same queue/payroll/transport helpers as the detail pages; the correction
card renders recent open requests instead of an empty state; correction approval preserves separate
clock-in and clock-out site values; future hourly-rate replacements keep the client history consistent
with server-side delete/replace behavior. The admin console now uses one shared top month picker in the
attendance subnav; overview, queue, payroll, transport, wage management, and staff detail share the same
`?ym=YYYY-MM` context instead of rendering separate page-level month controls.

**관리자 근태 정산 안전 하드닝 (2026-07-03):** manual session create/update, correction approval,
invalidate/restore now validate `clock_out_at > clock_in_at`, handle overnight sessions by anchoring
clock-out to the next Tokyo day when needed, and block edits against finalized user-months. Session-less
exception approvals now create the missing completed attendance session instead of only approving the
request. Correction approve/reject and transport review updates are guarded by current status to prevent
two-admin race conditions. Payroll/transport admin lists include active members plus inactive members who
have month sessions, snapshots, or transport reports, so resigned staff do not disappear from accounting
views. Review queue and date-picker labels are locale/Tokyo-timezone based.

**수기 근무 입력 UI (2026-07-10):** the review queue (`/admin/attendance/queue`) toolbar has a **"근무 추가"**
button opening a manual work-session modal (`ManualSessionModal`): staff · date · clock-in · optional
clock-out · **free-text work location** · reason. This covers off-site work and forgotten clock-ins —
`createManualAttendanceSession` now accepts a free-text `manual_location` instead of requiring a registered
site (a site is no longer mandatory; a location or a site is). The typed location is stored on the session
(`attendance_sessions.manual_location`) and shows in the "근무 위치" column of per-user payroll PDF/Excel
exports (falling back to the registered site name). Once the manual session exists, base pay and any
attendance allowances for that date apply automatically. A `daily_fixed` attendance allowance also applies
to an hourly worker even on a date with **no** session at all (off-site / unrecorded shift); `hourly_extra`
still needs recognized minutes, so it requires a session (clocked or manually entered).

**관리자 근태 배지/집계 경량화 (2026-07-03):** attendance subnav badges now use a dedicated lightweight
stats helper instead of calling the full overview aggregation from every attendance subpage. Overview
still loads detailed KPI/sample data, but queue/payroll/transport/wages/roster/staff-detail pages no
longer trigger the payroll/transport full fanout just to render badges. Correction request site labels are
batch-loaded once per request list instead of doing per-row site lookups.

**관리자 근태 상태/URL 정합성 보강 (2026-07-03):** overview → queue links now preserve the selected
`?ym=YYYY-MM`, including direct session deep links, so past-month rows open in the matching queue month.
The correction queue only loads open requests (`requested` / `in_review`) and removes a request from the
client list after approval/rejection. Transport submitted-total KPI excludes draft/rejected/
changes-requested reports and recalculates from the current client rows after review actions.
Transport `changes_requested` is treated as a worker-owned correction state: desktop admin panels no
longer expose approve/reject/request-fix buttons until the worker resubmits the report, while staff
detail labels show the same `보완 요청` status instead of falling back to `미제출`.
Follow-up hardening keeps the selected month context on overview → payroll/transport links, staff-day
→ queue links, and wage-panel → staff-detail links. The overview transport card now shows the real
missing-receipt count from reimbursement items instead of a placeholder `0`, and its note uses that
same count. Bulk queue actions run in parallel; if some rows fail, the toast stays open until dismissed
and lists the first failed staff/date targets. Payroll finalization uses the shared admin reason modal
with finalization-specific copy, while reopen keeps the required-reason flow.

**관리자 근태 패널 접근성 보강 (2026-07-03):** the attendance console side panels keep their existing
visual design, but now share an accessibility hook for behavior: `Esc` closes the open panel, body scroll
is locked while a panel is open, focus moves into the panel on open, and focus returns to the previously
focused element on close. Nested reason modals/lightboxes keep priority so pressing `Esc` does not close
the parent panel underneath them.
Close/previous/next aria labels in attendance admin panels and receipt focus view are dictionary-backed
in ko/ja/en; urgency chips use the dedicated localized `tagUrgent` label instead of parsing a KPI
sentence.

**관리자 출근자 명단 추가 (2026-07-02):** `/admin/attendance/roster`는 첨부된 desktop roster handoff의
상단 일자 선택기, 캘린더 팝오버, 요약 카운트, 상태별 그룹 테이블, 빈 상태 구조를 관리자 콘솔 안에 포팅한
일 단위 명단 화면이다. 데이터는 모바일 `/mobile/attendance/roster`와 같은 `getAttendanceRoster`
헬퍼를 사용하므로 모바일 출퇴근/휴게 기록과 100% 같은 출처를 본다. URL은
`/admin/attendance/roster?date=YYYY-MM-DD`이며 Tokyo 오늘, 미래 날짜, 90일 이전 날짜 clamp 규칙을
모바일과 맞춘다. 오늘 날짜 조회 중에는 클라이언트가 10초마다 조용히 재조회해 실시간 감지에 가깝게
현재 출근자/휴게자 변화를 반영하고, 상단 갱신 시각 표시는 1초 단위로 현재 Tokyo 시각을 갱신한다.
열린 휴게가 있는 직원은 휴게 컬럼에 `휴게 N분` 형태의 현재 휴게 경과 시간을 1초 tick 기준으로
재계산해 보여주며, 상태 컬럼의 `휴게 중` 칩은 별도로 유지한다.
정정·무효·급여 반영 변경은 여전히 검토 큐에서 처리하고,
명단은 조회 중심의 운영 표면이다. 날짜 선택은 근태 subnav 우측의 상단 일자 선택기 하나로
통합하고, 명단 본문 내부에는 별도 캘린더를 두지 않는다.
단, 전화 연결 버튼은 모바일 roster에서만 제공한다. PC 관리자 콘솔의 `/admin/attendance/roster`는
전화 컬럼/`tel:` 버튼을 노출하지 않는다.

## Design source

Ported from `Attendance Module v2.html` (high-fidelity handoff). Same ivory + deep-ink-navy tokens as
the rest of the app, plus attendance status hues (open / done / warn / info / invalid / danger) and a
monospace face for the live timer.

## Implementation (2026-06-17)

The first implementation began as a frontend design port, but the current attendance product is no
longer frontend-only. Routes are gated like every mobile route (auth + org context), and the shipped
clock, break, correction, payroll, roster, transport, and admin-review flows use server-side
organization-scoped data.

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
  comment, and 다시 요청. Data-driven from `?id=` (or latest), self-scoped; admin approve/reject now
  updates the request status and, for linked sessions, applies approved authoritative values to the
  session with an audit row.
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

**Back buttons were removed from all attendance screens** (the global shell owns navigation). A
design-phase preview index existed during review and was **removed on completion**. Any remaining
`?state=` / `?result=` affordances are development-preview compatibility only and must not be treated as
the source of operational state.

## Current Product Scope

Implemented scope: GPS + QR clock-in/out, break start/stop with clock-out blocked during an open break,
session review states, correction request lifecycle, self history, expected hourly pay, monthly
finalization/reopen/export foundations, notifications, roster, transportation reimbursement backend,
and admin dashboard review/payroll/transport/wage/staff slices.

Admin payroll export refinement (2026-07-03): the payroll side panel can export one staff member's
monthly Excel/PDF detail sheet. It combines daily attendance/pay, approved transport items, and completed
cleaning rooms for the same staff/date. Cleaning room labels currently use the user-confirmed summaries
AA/AB/KK/T2 while Okubo and Sky remain as stored labels. For Arakicho duplicate account room keys
such as `501` / `501_2`, the export now follows the same display-room rule as the cleaning UI and
collapses them to one visible room label (`AA501`, `AB501`).
The personal Excel/PDF totals row also carries the work-day count next to `합계`/`Total` and counts only
dates with recognized paid minutes, so transport-only dates do not inflate attendance days. The personal
export includes a cleaning memo column sourced from `cleaning_sessions.notes`; when multiple completed
cleaning sessions on the same date have notes, they are joined as room-summary-prefixed memo entries.
The staff monthly detail page no longer exposes a separate daily-ledger CSV button; accounting hand-off
exports are kept in the payroll panel's Excel/PDF actions to avoid duplicate document paths.
The monthly payroll toolbar also includes a `시급제만` export switch next to the PDF/Excel actions. When
enabled, both monthly PDF and Excel exports include only hourly/mixed payroll rows with an active hourly
rate, excluding salaried/staff rows whose hourly-rate cell is blank.
Payroll calculation consistency hardening (2026-07-03): admin payroll lists, staff detail, and monthly
Excel/PDF exports now prefer finalized snapshot amounts once a user-month is closed, so later hourly-rate
edits cannot alter locked payroll. Personal Excel/PDF daily rows are reconciled to the official monthly
payroll total, keeping the visible daily-pay sum and the finalized/expected monthly amount aligned to the
yen.
Payroll review document alignment (2026-07-03): monthly payroll Excel/PDF and personal staff Excel/PDF
exports keep the existing green ledger format, but all title/meta/table/total text is center-aligned for
visual consistency across the four document paths.

Remaining/explicitly limited scope: Wi-Fi attendance stays inactive; QR scanning itself remains
mobile-only due to physical device constraints; payroll premiums (overtime/holiday/night) remain out of
scope; broader automated midnight sweep and advanced export/reporting refinements are handled in the
technical roadmap.
