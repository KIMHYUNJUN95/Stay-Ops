# Attendance / 근태 Workflow

Status: live multi-slice attendance domain. The original 2026-06-17 design port is now backed by real
GPS + QR clock-in/out, breaks, self history, correction requests/status, self pay view, notifications,
transport-reimbursement backend, roster, and the admin attendance/payroll/transport dashboard slices.
The authoritative technical as-built log is
`docs/engineering/11-attendance-payroll-technical-design.md`. UI copy for the shipped surfaces is
dictionary-backed in ko/ja/en; new attendance UI must keep that contract.

Annual leave is implemented as a separate attendance-adjacent workflow for salary-based regular
employees. The source-of-truth contract is `docs/product/26-annual-leave-workflow.md`.

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

**수당(시급) 화면 Excel/PDF 내보내기 구현 (2026-07-14):** `/admin/attendance/wages` 사이드 패널의
비활성(disabled) 스텁 내보내기 버튼을 제거하고, 툴바에 공용 `<AdminExportButtons>`
(`src/components/admin/shared/admin-export-buttons.tsx`)를 신설했다. 신규 서버 액션
`exportAttendanceWagesWorkbook()` / `exportAttendanceWagesReport()`(`src/app/admin/attendance/actions.ts`)는
기존 급여(payroll) export와 동일한 `attendance_payroll_admin`/`owner` 권한 게이트를 쓴다. 산출물은
2시트 구성: (1) 직원별 요약 — 직원/고용형태/현재 시급/적용 시작일/이력 단계 수, (2) 시급 이력 상세 —
직원/시급/적용 시작일/적용 종료일/사유. 어드민 콘솔 공용 그린 렛저 템플릿
(`src/lib/admin-table-workbook.ts` / `admin-table-report.ts`)을 통해 렌더링되며, 근태 급여·교통비
내보내기는 이번 변경 이전에 이미 같은 공용 톤을 쓰고 있어 변경 없음. i18n: `attendanceConsole.wageColTo`
신규 추가(ko/ja/en).

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

## 打刻 검증 순서 — 위치보다 세션 상태를 먼저 (2026-07-31)

`submitAttendanceScan` 의 검증 순서를 바꿨다.

```txt
1) QR 토큰 (활성 + 동일 조직)
2) 사이트 (동일 조직 + 활성)
3) 세션 상태  ← 여기로 앞당김
     출근: 열린 근무가 있으면 → open_session
     퇴근: 열린 근무가 없으면 → no_session / 휴게가 열려 있으면 → open_break
4) GPS 필수
5) 사이트 반경 이내
6) 기록
```

**이유.** 열린 근무의 유무는 위치와 무관한 사실이다. 예전 순서(GPS·반경 먼저)에서는 이미 출근한
사람이 **다른 현장 QR** 을 찍으면 "허용 범위 밖입니다" 가 떴다. 그 안내를 믿고 그 현장 안으로
걸어 들어가 다시 찍어도 결과는 같다 — 이미 출근 중이라 어차피 실패한다. 사용자를 헛걸음시키는
안내였다. 위치와 무관하게 이미 결정된 실패는 먼저 알려준다.

부수 효과로 `attendance_attempt_logs` 의 `outside_radius` 는 이제 "정말 위치 때문에 실패한 시도"만
담는다. 세션 상태 때문에 실패한 시도는 `open_session_exists` / `open_break_blocks_clock_out` 으로
분리돼 진단이 정확해진다.

## QR Deep Link — 휴대폰 기본 카메라로 바로 인증 (2026-07-31)

### 배경

QR 에는 토큰 문자열(`att_…`)만 들어 있었다. 휴대폰 기본 카메라로 찍으면 "열 수 있는 것"이 없어
아무 반응이 없었고, 직원은 반드시 앱을 열어 → 근태 → 출근/퇴근 → 스캔 순서를 밟아야 했다.

### 인코딩

QR 은 이제 **절대 URL** 을 담는다. **토큰 값 자체는 바뀌지 않았다.**

```txt
https://<앱주소>/mobile/attendance/capture?token=att_…
```

- 기준 주소는 **`NEXT_PUBLIC_APP_URL`** 이다(요청 호스트가 아니다). QR 은 인쇄물이라, 관리자가
  LAN IP 로 접속한 상태에서 뽑으면 현장에서 열리지 않는 QR 이 인쇄된다. 주소가 비어 있으면 예전처럼
  토큰만 담는다.
- **하위호환은 필수다.** 이미 붙어 있는 인쇄물은 토큰만 담고 있으므로 앱 내 스캐너는 두 형식을 모두
  받는다(`extractAttendanceToken`). 기존 QR 은 앱에서 계속 동작하지만, **카메라 기능을 쓰려면 건물별
  QR 을 새로 출력해 교체해야 한다.**

### 현장 정리 — 삭제 vs 비활성화 (2026-07-31)

출퇴근 현장을 목록에서 치울 수 있어야 한다는 요구가 있었지만, **삭제 범위는 스키마가 이미 정해
두었다.**

| 참조 | on delete |
| --- | --- |
| `attendance_qr_tokens.site_id` | `cascade` — QR 은 현장과 함께 사라진다 |
| `attendance_sessions.clock_in/out_site_id` | **`restrict`** — 출퇴근 기록이 있으면 삭제 거부 |
| `attendance_attempt_logs.resolved_site_id` | `set null` |
| `attendance_correction_requests.desired_*_site_id` | `set null` |

즉 **근태 기록이 한 건이라도 있는 현장은 삭제할 수 없다.** 급여 근거가 되는 기록을 지우지 않기
위한 설계이며 그대로 유지한다. 그래서 UI 는 두 갈래로 나눈다.

- **완전 삭제** — 기록이 한 번도 없는 현장만. 인라인 확인을 거치고, QR 토큰은 cascade 로 함께
  삭제된다. 그 현장에 붙여둔 인쇄 QR 은 즉시 죽는다(확인 문구에 명시).
- **비활성화** — 기록이 있는 현장은 `is_active = false` 로 운영에서만 뺀다. 기록은 보존되고,
  비활성 현장의 출퇴근은 이미 `submitAttendanceScan` 이 거부한다. 다시 활성화할 수 있다.

**비활성화해도 삭제할 수 있게 되지는 않는다.** 비활성화는 `is_active` 플래그만 끄고 근태 세션은
그대로 남으므로 FK restrict 가 계속 삭제를 막는다. 즉 실제로 사용된 현장의 최종 상태는 "비활성"이다.
삭제를 열어주려면 근태 기록을 지우거나 현장 연결을 끊어야 하는데, 둘 다 급여 근거를 훼손하므로
제공하지 않는다.

기록 유무는 `attendanceSiteHasHistory()` 로 미리 확인해, 삭제할 수 없는 현장에는 삭제 버튼 대신
안내를 띄운다(눌러도 실패만 하는 버튼을 두지 않는다). 이 판단은 `is_active` 를 보지 않고 세션 존재
여부만 본다.

목록에서 비활성 현장은 **기본으로 숨긴다.** 비활성 현장이 있으면 목록 상단에 「비활성 포함」 토글
(`?inactive=1`)이 개수와 함께 나타난다. 선택 중인 현장이 비활성이면 토글과 무관하게 항상 보인다
(상세 패널이 목록에 없는 현장을 가리키지 않도록).

**카운트·경고에서도 비활성 현장은 빠진다** — 설정 인덱스의 현장/QR 카운트, QR 화면 상단의
"QR 없는 현장" 경고 모두 활성 현장만 센다. 그러지 않으면 비활성화해도 경고가 남아 비활성화가
무의미해진다. 삭제·활성/비활성 전환은 `audit_logs` 에 남는다
(`attendance_site_delete` / `attendance_site_activate` / `attendance_site_deactivate`).

### QR 인쇄 (2026-07-31)

현장 벽에 붙일 물건을 뽑는 화면. `/admin/settings/attendance/print`.

- **카드 80×80mm 정사각**, QR 약 55mm. A4 한 장에 6장이 들어가고 점선 자르기 안내선이 있다.
  A4 한 장을 통째로 쓰는 안은 "현장에 붙이기엔 너무 크고 보기 안 좋다"는 이유로 채택하지 않았다.
- **담는 것은 QR 과 현장 이름뿐이다.** 설명 문구를 넣지 않는다 — 벽에 붙는 종이가 지저분해지고,
  어차피 찍으면 앱이 안내한다.
- 어드민 셸(사이드바·헤더)을 쓰지 않는 독립 라우트다. 인쇄물에 화면 요소가 섞이면 안 된다.
- 범위: 목록 상단 「전체 인쇄」(활성 현장 전부) / QR 카드의 「이 현장 인쇄」(`?site=`).
- **카메라로 열리지 않는 QR 은 인쇄 대상에서 제외한다.** 붙여도 동작하지 않는 종이를 뽑는 것이
  이 화면의 최악의 실패다. 대신 화면 상단(인쇄에는 안 나감)에 어느 현장이 왜 빠졌는지 알린다.
- 자동으로 인쇄 대화상자를 띄우지 않는다. 몇 장이 나오는지·제외된 현장이 있는지 먼저 확인한 뒤
  사용자가 누른다.

#### 인쇄용 이름 — `attendance_sites.print_name`

인쇄물의 현장 이름은 영문이어야 하는데, `attendance_sites.name` 은 한글이고 이 조직의 현장은
전부 `property_id` 가 비어 있어 `properties.display_name_en` 을 끌어올 수도 없었다.

한글 이름을 영문으로 바꾸는 대신 **인쇄 전용 이름 컬럼을 따로 두었다**(마이그레이션
`202607310002`). 어드민 화면·근태 기록은 계속 한글 이름을 쓰고, 인쇄물만 이 값을 쓴다.
비어 있으면 `name` 으로 폴백하므로 채우지 않아도 인쇄는 된다. 현장 설정 폼의
「인쇄용 이름 (영문)」 칸에서 입력한다.

### 미가입자가 QR 을 찍으면 (2026-07-31)

벽에 붙은 인쇄물이라 **지나가던 사람도 찍을 수 있다.** 방어선은 네 겹이고 전부 서버에서 판정한다.

| 검증 | 위치 |
| --- | --- |
| 로그인 필요 | `/mobile/attendance/capture` 진입 |
| 조직 소속 필요 (초대코드) | 온보딩 |
| **동일 조직 토큰** | `submitAttendanceScan` / 진입 화면의 사이트 조회 |
| GPS 필수 + 사이트 반경 | `submitAttendanceScan` |

- **로그아웃 상태** → 로그인 화면. 계정을 만들어도 온보딩에서 초대코드를 요구하므로 조직에 들어갈 수 없다.
- **다른 조직 직원** → 화면은 열리지만 토큰의 `organization_id` 가 달라 「사용할 수 없는 QR」이 뜨고,
  제출해도 서버가 거부한다. **토큰을 알아도 다른 조직에서는 무의미하다.**

로그아웃 상태로 QR 을 찍고 들어오면 로그인 화면에 **「출퇴근 QR을 읽었어요 · 직원 전용」** 안내를
띄운다(`auth.entry.qrNotice*`). 아무 설명 없이 로그인 화면만 뜨면 지나가던 사람이 무엇을 찍었는지
알 수 없기 때문이다. 안내 언어는 `?lang=` → `stayops_locale` 쿠키 → **Accept-Language** 순으로
정해지므로, 처음 방문한 일본어 단말에는 일본어로 뜬다.

**함께 고친 것:** 로그인 페이지가 모바일에서 `next` 를 무조건 `/mobile` 로 덮어쓰고 있었다.
`/admin/...` 목적지를 앱으로 돌리려는 의도였는데 모바일 경로까지 함께 버려서, 로그아웃 상태로 QR 을
찍은 직원이 로그인 후 인증 화면이 아니라 홈으로 떨어졌다(토큰이 사라졌다). 이제 이미 모바일 경로인
`next` 는 그대로 지킨다.

### 인쇄 전 안전장치 (2026-07-31, 실제 사고 후 추가)

`NEXT_PUBLIC_APP_URL` 이 비어 있으면 QR 은 **조용히 예전 형식(토큰만)** 으로 그려진다. 화면상으로는
멀쩡해 보이지만 카메라로 찍으면 그냥 검색어로 읽힌다 — 실제로 이 상태로 확인하다 한 번 겪었다.
QR 은 인쇄물이라 잘못 뽑으면 전 건물을 다시 붙여야 하므로, 관리자 화면이 출력 전에 판정해서 알린다.

| 상태 | 화면 표시 | 조치 |
| --- | --- | --- |
| `ok` (공개 https 주소) | 초록 "휴대폰 카메라로 열립니다. 출력해도 됩니다." | 출력 진행 |
| `local` (localhost·사설망) | 노랑 경고 | 운영 사이트에서 다시 확인 후 출력 |
| `missing` (URL 아님 = 토큰만) | 노랑 경고 | `NEXT_PUBLIC_APP_URL` 설정 → 재배포 후 재확인 |

판정 로직은 `attendanceQrLinkState()` (`src/lib/attendance-qr.ts`), 테스트는
`src/lib/__tests__/attendance-qr.test.ts`. **QR 은 반드시 운영 사이트에서 뽑는다** — 로컬 개발 서버에서
뽑으면 `http://localhost:3000` 이 박혀 현장 휴대폰에서 열리지 않는다.

### 기기별 동작 (확인된 제약)

| 기기 | 카메라로 QR 촬영 시 |
| --- | --- |
| Android | 링크 배너 → URL 이 PWA scope(`/`) 안이라 **설치된 앱 창으로 열린다.** 의도한 동작. |
| iOS | **Safari 로만 열린다.** 홈 화면 PWA 로 넘기는 방법이 iOS 에 없다(Universal Links 는 네이티브 앱 필요). iOS 16.4+ 는 standalone PWA 와 Safari 의 저장소가 분리돼 있어 Safari 에서 재로그인이 필요할 수 있다. |

iOS 사용자는 기존처럼 앱에서 스캔하는 동선이 여전히 가장 빠르다. 두 동선 모두 유지한다.

### 진입 화면

건물 QR 에는 **방향(출근/퇴근) 정보가 없다.** 그래서 링크로 들어오면 카메라를 켜지 않고 진입
화면을 보여준다.

- 어느 건물의 QR 인지(토큰 → 사이트 이름 조회)와 GPS 상태를 먼저 보여준다.
- 직원이 **「출근 인증」 / 「퇴근 인증」** 을 고르면 그 토큰으로 바로 제출한다.
- 토큰이 더 이상 유효하지 않으면(재발급·폐기) "사용할 수 없는 QR" 안내와 앱 스캔 경로를 준다.
- 로그아웃 상태면 로그인으로 보내되 **토큰을 `next` 에 실어** 인증 후 같은 화면으로 돌아온다.

### 보안 — 바뀐 것 없음

토큰이 URL 로 노출돼도 판정은 전부 서버(`submitAttendanceScan`)가 그대로 한다: 동일 조직의 **활성**
토큰 + **활성** 사이트 + **GPS 필수** + **사이트 반경 이내**. 링크를 받아도 현장에 있지 않으면
인증되지 않으므로 대리 출근 위험은 이전과 동일하다. 진입 화면의 사이트 이름 조회는 **표시용**이며
인증이 아니다.

관련 파일: `src/lib/attendance-qr.ts`(인코딩/파싱, 테스트
`src/lib/__tests__/attendance-qr.test.ts`), `src/lib/attendance-sites.ts`
(`getSiteNameByActiveQrToken`), `src/app/mobile/attendance/capture/page.tsx`,
`src/components/attendance/attendance-capture.tsx`, `src/app/admin/settings/attendance/page.tsx`.

## Trusted Device — 재로그인 없이 打刻 (2026-07-31)

### 왜 필요한가

위 QR 딥링크에서 아이폰은 **Safari 로만** 열린다. iOS 는 홈 화면 PWA 와 Safari 의 저장소가 분리돼
있어 로그인 세션을 공유하지 않는다. 그래서 QR 로 들어올 때마다 재로그인을 요구받는 상황이 생긴다.
로그인 수단(구글/이메일)을 바꿔도 이 구조는 그대로다.

### 방식

**한 번 로그인해 실제로 打刻에 성공한 기기**를 기억한다. 그 다음부터는 인증 세션이 없어도 그
기기에서 出退勤만 바로 된다.

- 발급 시점: 打刻 **성공 직후**(출근 또는 퇴근). 화면만 열어서는 발급되지 않는다 — 실제로 현장에서
  쓴 기기라는 증거가 있는 셈이다.
- 저장: `attendance_trusted_devices` (조직·사용자·**토큰 sha256 해시**·기기 라벨·최종 사용·만료·폐기).
  **원문 토큰은 DB 에 없다.** 쿠키에만 있다.
- 쿠키: `stayops_att_device` — HttpOnly · Secure · SameSite=Lax · **`Path=/mobile/attendance`**
  (근태 경로 요청에만 실린다).
- 만료: **180일 슬라이딩.** 쓸 때마다 다시 180일로 밀린다. 반년간 한 번도 안 쓰면 자동으로 죽는다.
- 기기 라벨은 UA 에서 "iPhone · Safari" 수준만 뽑아 저장한다. 원본 UA 는 보관하지 않는다.

### 권한 경계 (이 기능의 핵심 — 넓히지 말 것)

이 자격증명이 허용하는 것은 **출근/퇴근 打刻 두 가지뿐**이다.

- 근무 이력 · 급여 · 정정 요청 · 프로필 · 다른 모듈 · 어드민 = **전부 불가.** 그 화면들은 여전히
  정상 인증 세션을 요구한다.
- `middleware.ts` 의 보호 경로는 이 기능 때문에 넓히지 않는다.
- 신원 대체는 `submitAttendanceScan` 과 QR 진입 화면 렌더링에서만 일어난다
  (`resolveTrustedDevice()`). 다른 어떤 권한 판단에도 쓰지 않는다.
- **GPS 필수 + 사이트 반경 검증은 그대로다.** 쿠키만으로 현장 밖에서 打刻할 수 없다.
- 조직 멤버십이 `active` 가 아니면 즉시 무효 — 퇴사·정지 처리하면 그 기기도 같이 죽는다.
- 진입 화면에 **"○○○님으로 기록됩니다"** 를 명시해 다른 사람으로 잘못 찍히는 걸 막는다.

### 폐기 경로

- **로그아웃**: 쿠키 삭제 + DB 폐기. 명시적 로그아웃은 "이 기기에서 나가겠다"는 뜻이므로 기억도 함께 끊는다.
- **기기 주인 변경**: 같은 기기에서 다른 사람이 로그인해 打刻하면 이전 자격증명을 폐기하고 새로 발급한다.
- **관리자 해지**: 어드민 → 설정 → 근태의 **「기억된 기기」** 목록에서 해지. 휴대폰 분실·퇴사 시 사용한다.
  해지는 `audit_logs`(`attendance_trusted_device_revoke`)에 기록된다.
- **만료**: 180일 미사용 시 자동.

### 부수 효과

iOS 전용 대책이 아니다. 안드로이드·PWA 에서도 세션이 만료된 사람은 같은 혜택을 받는다.

관련 파일: `src/lib/attendance-trusted-device.ts`,
`supabase/migrations/202607310001_attendance_trusted_devices.sql`,
`src/app/mobile/attendance/actions.ts`(打刻 시 신원 대체 + 기억),
`src/app/mobile/attendance/capture/page.tsx`, `src/app/auth/actions.ts`(로그아웃 폐기),
`src/app/admin/settings/attendance/*`(목록·해지).

Remaining/explicitly limited scope: Wi-Fi attendance stays inactive; QR **scanning inside the app**
remains mobile-only due to physical device constraints (the camera deep link above does not change
that — it only removes the manual navigation before the scan); payroll premiums
(overtime/holiday/night) remain out of scope; broader automated midnight sweep and advanced
export/reporting refinements are handled in the technical roadmap.

## 2026-08-03 정정 요청 · 로스터 · 연차 승인 — 3건 수정

### 정정 요청 재제출은 기존 pending 을 갱신한다 (supersede)

예전에는 재제출이 무조건 INSERT 였다. 화면(`getCorrectionRequestView`)은 최신 1건만 보여주는데
마감 판정(`getFinalizationEligibility`)은 `requested|in_review` **전 건**을 세므로, 같은 날
재요청하면 **화면엔 1건인데 마감은 2건으로 막혔고** 관리자 큐에도 서로 모순되는 요청이 2건 떴다.

→ 같은 대상(같은 `session_id`, 세션 없는 예외 요청은 `session_id is null` + 같은 `target_month`)의
본인 pending 요청이 있으면 **그 행을 갱신**한다. 갱신 시 `status` 를 `requested` 로 되돌리고
`review_comment` / `reviewed_at` / `reviewed_by_user_id` 를 비운다 — 관리자가 보던 값이 이미
사라졌으므로 재검토가 맞다. UPDATE 에 상태 가드를 걸어 **읽기~쓰기 사이에 관리자가 처리해버린
레이스**에도 안전하고, 0행 갱신되면 새 INSERT 로 폴백한다.

- **미완**: 이미 쌓인 legacy 중복 pending 행은 이 변경으로 정리되지 않는다(관리자 큐에서 개별 처리).
### 정정 요청 철회 (2026-08-03, 마이그레이션 `202608030001`)

요청자가 **아직 처리되지 않은 요청(`requested` / `in_review`)을 스스로 거둘 수 있다.** 예전에는
잘못 낸 요청을 되돌릴 방법이 없어, 관리자가 반려해 줄 때까지 대기 큐에 남고
`getFinalizationEligibility` 가 그 요청을 세므로 **그 달의 근태 마감까지 막혔다.**

- 상태 `cancelled` + `cancelled_at` 추가. 하드 삭제가 아니라 상태인 이유: 관리자가 이미 검토를
  시작했을 수 있고, 마감 판정과 감사 흐름이 요청 이력을 근거로 삼는다. 연차 요청도 같은 이유로
  `cancelled` 상태를 쓴다 — 그 선례를 따랐다.
- 행위자는 항상 요청자 본인이라 `cancelled_by` 컬럼은 두지 않았다.
- **강제는 서버에서.** service-role 쓰기라 RLS 가 막지 않으므로 UPDATE 의
  `organization_id` / `requested_by_user_id` / `status in (requested, in_review)` 조건이 유일한
  경계다. 관리자가 그 사이에 승인/반려하면 0행이 갱신되고 `not_pending` 으로 떨어진다(레이스 안전).
- 대기 큐와 마감 판정은 `requested|in_review` 만 세므로 `cancelled` 는 두 곳에서 자동으로 빠진다.
- UI: 상태 화면의 철회 버튼 → 공용 `BottomSheet` 확인. 상태 칩은 반려와 달리 **중립색**
  (스스로 거둔 것이지 거절당한 게 아니다).

### 어드민 정정 큐에 증빙 사진 표시

모바일은 정정 요청에 사진을 첨부하는데(`image_urls`) 어드민 조회·패널이 그 필드를 아예 읽지 않아
**관리자가 사진 없이 승인/반려**하고 있었다. `AdminCorrectionRow.imageUrls` 를 추가하고, 교통비
패널과 **동일한 썸네일 + 공용 `ImageLightbox`** 를 재사용해 표시한다(사진 0장이면 누락 표시).

### 로스터 상태 판정 — DB enum 과 표시용 키를 구분

`deriveStatus()` 가 raw `review_state`(DB 값 `review_required`)를 **표시용 키**(`needs_review`)와
비교하고 있었다. 그래서 `needs_review` 가 절대 생성되지 않았고 어드민 로스터의 **danger dot · flag
행 · 카운트 타일이 전부 dead code** 였다. 타입에서 상수를 가져와 비교하도록 고쳐 **오타 시 컴파일
에러**가 나게 했고, `RosterStatusKey` 에 "DB enum 이 아니라 표시용 키" 주석을 남겼다.

### 연차 승인 잔여 계산 — 기사용분 차감

`poolRemainingFor()` 가 `computeAnnualLeaveSummary()` 를 호출하면서 `usedDays` /
`specialUsedDays` 를 넘기지 않았다. 두 파라미터의 기본값이 `0` 이라 **조용히 통과**했고, 그 결과
승인 모달의 "잔여 영향" 이 총 부여일수 기준으로 나오고 **잔여 초과 경고가 발화 자체를 하지
않았다**(`remaining - daysCount < 0` 이 성립 불가).

→ 모바일 잔여 화면이 쓰는 정본 `getMyAnnualLeaveSummary()` 에 **위임**한다. 승인 화면용 별도
계산을 만들지 않는다 — 같은 숫자를 두 화면이 보여줘야 한다.

- 부수: `balanceAfter` 가 음수가 될 수 있어 잔여 막대 `width` 를 0–100% 로 클램프했다.
- **경고만, 차단 없음** 이라는 기존 설계는 유지했다. 다만 **승인 모달 자체에는 초과 경고 UI 가
  없어** 승인자가 모달만 보고 초과를 알아채기 어렵다 — 설계 변경이라 별도 결정 사항.
- **확인 필요**: 경고가 그동안 발화하지 않았으므로 **잔여를 초과해 승인된 건이 남아 있을 수 있다.**
  계산 엔진이 초과분을 0 에서 클램프해 화면상 드러나지 않는다.

### 출근자 명단 권한 — 현황 기록 (변경 없음)

`canViewRoster()` 는 **무조건 `true`** 이고 모바일 로스터는 근무 중인 동료의 **전화번호 + `tel:`
통화 링크**를 전 조직원(파트타임 포함)에게 노출한다. 어드민 로스터는 콘솔 세션 게이트가 있고
전화번호를 표시하지 않는다. `src/config/roles.ts` 주석("roster is not a privileged view")상
**의도된 결정**으로 보이나, `src/app/mobile/attendance/roster/page.tsx` 최상단 주석은 아직
"매니저/오피스 역할만 접근 가능"이라 **코드와 모순**이다. 권한을 좁히기로 한다면 UI 숨김이 아니라
`getAttendanceRoster` 에서 **서버 측으로 `phoneNumber` 를 null 처리**해야 한다(CLAUDE.md §6).

**판정(2026-08-03): 개방은 의도된 것, 주석이 거짓이었다.** `roles.ts` 의
"roster is not a privileged view" 가 확정 결정이고, 페이지 주석이 말하던
"cleaningRecordViewerRoles 로 리다이렉트" 하는 코드는 **존재한 적이 없다**(청소 기록 열람 권한과
혼동한 서술). 권한은 그대로 두고 **주석만 실제 동작으로 정정**했다. 전화번호 + `tel:` 링크 노출도
"현장에서 서로 연락하라"는 이 화면의 목적에 부합하므로 유지한다.
