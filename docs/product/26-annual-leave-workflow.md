# Annual Leave / 연차 Workflow

> **2026-07-13 — 승인자 관리 sub-tab removed.** Approver granting is being unified onto the **Users
> screen** (`/admin/users`), where all role/permission granting will be managed together. The former
> 연차 콘솔 **승인자 관리** sub-tab (`leave-approvers-view.tsx`) was removed and the leave section now has
> **5 sub-tabs** (승인 심사 / 팀 캘린더 / 직원 잔여·부여 / 문서 / 이력). The backend helpers
> (`listAdminApprovers` / `setLeaveApprover` in `annual-leave-admin-server.ts`) are **retained** for the
> upcoming Users permission backend. Until that Users backend is wired (after design confirmation),
> `memberships.leave_approver_role` can only be changed directly in the DB. Historical entries below
> that describe the 승인자 관리 tab record its prior state and are kept for provenance. See
> `docs/product/27-permission-override-workflow.md` and `docs/product/05-admin-web-ia.md`.

Status: the mobile employee-facing experience is done — hire-date/balance backend, request
submission/self-cancel/draft-resume, and the real team calendar are all implemented and applied
(Phase 1 + Phase 2 stage 1, see below). The admin-dashboard **approval review** (Phase 2 stage 2,
approve/reject action + approval queue at `/admin/attendance/leave`) is now **implemented
(2026-07-07)** — see "Backend — Phase 2, stage 2 (implemented 2026-07-07)" below. Of the remaining four
admin sub-tabs, **팀 캘린더 / 직원 잔여·부여 / 승인자 관리 are now backend-wired (2026-07-08)** — see
"Admin sub-tabs — backend wiring (implemented 2026-07-08)" below. The **문서 (休暇届)** sub-tab is now
backend-wired too (2026-07-08): each approved request gets an `AL-YYYY-MM-NNN` document number and the
休暇届 is rendered from the real approved request — see "문서 (休暇届) — backend wiring (2026-07-08)". This is
the target annual-leave workflow
for salary-based regular employees. Hourly staff are excluded. The goal is to remove paper approvals
while keeping the current company form (photographed 2026-07-06, see "Paper form reference" below) as
the visual and document reference.

## Goal

- employee submits annual-leave request from either mobile or admin dashboard
- one approver out of two company approvers can approve it
- approval automatically generates the official company leave document
- electronic signature is supported
- staff and admins can review leave history through a calendar

## Confirmed policy

- target users are salary-based regular employees only
- hourly staff are excluded
- leave becomes available exactly 6 months after hire date
- first grant at eligibility is 10 days
- after that, the accrual increases by tenure year
- basic accrual tops out at 20 days
- 4-year bonus leave is separate from the accrual cap and adds 4 more days
- leave type includes full-day leave plus morning and afternoon half-day leave
- date calculation is based exactly on the hire date
- either the VP or the CEO can approve the request
- one approval is enough to complete approval

### Paper form reference (photographed 2026-07-06)

The actual company form is titled 休暇届 (leave notification). Fields: 申請日 (application date), 氏名
(name), 期間 (period), 休暇区分 (leave category — 有給休暇/paid, 慶弔休暇/bereavement, 特別休暇/special,
その他/other, exactly the four types already implemented), 事由 (reason), 緊急連絡先 (emergency
contact). Bottom approval row has three stamp boxes: **本人**(applicant) / **部署長**(department
head) / **専務**(senior managing director). Confirmed: 部署長 on this form is the company's 대표/CEO,
so the two stamp boxes map to "either VP or CEO approves" above — not a 3-step sequential chain.

### Approval workflow policy (confirmed 2026-07-06)

- Approver = any member flagged as an approver; either the department-head/대표(CEO)-flagged member
  or the senior-managing-director/전무-flagged member approving completes the request (one approval).
- Attachments are optional (not required to submit).
- Electronic signature is an approval **stamp**: clicking "approve" records the approver's name and
  timestamp, filling the corresponding stamp box on the eventual printed document. Not a drawn/canvas
  signature.
- Document output (stage 3, not built) will replicate the paper form's exact layout. No PDF-generation
  library exists in this project yet — the interim plan is a print-optimized HTML view (browser
  print-to-PDF) rather than server-generated PDF, until a real need for the latter appears.
- Rejecting a request does NOT require a reason (confirmed 2026-07-06) — unlike attendance-correction
  rejection, which does. Any future reject action/UI for leave should make the reason field optional,
  not mandatory.

### Where approval happens (confirmed 2026-07-06; approval queue implemented 2026-07-07)

The approval queue and approve/reject action are an **admin web dashboard** feature
(`/admin/attendance/leave`, mirroring the existing correction-review queue at
`/admin/attendance/queue`), not a mobile screen. Mobile is the employee-facing surface (submit/view
own requests); the PC dashboard is the manager-facing surface (review/approve org-wide). Document
output (stage 3) remains not started.

### Leave types (confirmed 2026-07-06)

There are four request types, each with different balance/payment behavior — they are NOT four
labels on the same pool:

| Type (code key) | Label | Behavior |
| --- | --- | --- |
| `annual` | 경조 휴가 (bereavement) | Fixed 3 paid days per request, company-granted, independent of the
  hire-date accrual pool below. Any days beyond 3 for the same occasion must come from the
  employee's own 유급 휴가 (paid-leave) balance. |
| `paid` | 유급 휴가 (paid leave) | Draws from the hire-date accrual pool (the accrual table below). |
| `special` | 특별휴가 (special leave) | Draws only from the one-time 4-year +4-day bonus pool — never
  mixed with the 유급 휴가 pool. |
| `other` | 기타 (other) | Unpaid. No balance is deducted. |

Implemented in `src/components/attendance/leave-form.tsx`: selecting 경조 휴가 auto-fills a fixed
3-day range and hides the half-day toggle (bereavement isn't taken as a half day); selecting 기타
shows an "unpaid" hint. Implemented in `src/lib/annual-leave.ts`: `computeAnnualLeaveSummary` returns
`baseRemaining` (유급 휴가 pool) and `bonusRemaining` (특별휴가 pool) as two separate numbers, with
independent `usedDays`/`specialUsedDays` inputs so usage from one type can never draw down the other.

### Accrual table (confirmed 2026-07-06)

Grants are calculated purely from hire date, as a sequence of dated events:

| Timing from hire date | Grant |
| --- | --- |
| +6 months | 10 days (first grant) |
| +1y6m | 11 days |
| +2y6m | 12 days |
| +3y6m | 14 days |
| +4y6m | 16 days |
| +5y6m | 18 days |
| +6y6m onward, yearly | 20 days (cap, repeats every year after) |
| +4 years (one-time, separate) | +4 bonus days (outside the 20-day cap) |

Reference implementation: `src/lib/annual-leave.ts` (`getScheduledGrants`), covered by
`src/lib/__tests__/annual-leave.test.ts`.

### Carryover / expiration (partially confirmed 2026-07-06)

- Unused leave from a given grant lapses **2 years** after that grant's date — confirmed.
- What happens to leave older than 2 years (e.g., whether some categories are exempt, or whether
  the 2-year window itself may later change) is **still unconfirmed** — pending an internal company
  check. `LEAVE_EXPIRY_YEARS` in `src/lib/annual-leave.ts` is kept as a single named constant so this
  can be adjusted later without touching the grant schedule.
- The employee's self-entered starting balance (see below) is treated as opaque — the engine does not
  apply the 2-year expiration to it, since its underlying grant history/dates aren't known. Only
  automatic grants issued after that entry point are tracked with a 2-year expiry.

### Backend — Phase 1 only (implemented 2026-07-06)

Scope is intentionally narrow: only `profiles.hire_date` + the self-entered balance baseline are
real. Migration `202607060001_annual_leave_hire_date_baseline.sql`. The request-submission / approval
/ e-signature / document-generation workflow described elsewhere in this doc is still **not
implemented** — it remains a planning draft pending the open questions below.

- The employee enters their own hire date **and** current remaining leave balance directly (no
  admin-mediated request), from the "hire date missing" screen (`leave-exception.tsx`, `missing`
  variant). Saved via `setAnnualLeaveBaselineAction` (`src/app/mobile/attendance/leave/actions.ts`,
  service-role) into `profiles.hire_date` + the `annual_leave_baselines` table (see
  `docs/engineering/04-data-model.md`). No admin edit UI yet, and hourly-staff exclusion is not
  enforced at this layer yet — both still open work.
- `leave-home.tsx` now receives the computed summary (`computeAnnualLeaveSummary`) as a prop from the
  server page (`src/app/mobile/attendance/leave/page.tsx`, which reads the DB via
  `getMyAnnualLeaveSummary`) instead of reading `localStorage` — the earlier localStorage bridge has
  been removed. Recent-requests list and accrual rule copy are still static mock data — usage-day
  deduction is not wired to real submitted/approved leave requests yet (there is no leave-request
  table; that's part of the not-yet-designed approval workflow above).
- Hire-date selection uses the canonical bottom-sheet pattern (`src/components/attendance/hire-date-picker.tsx`),
  not a native `<input type="date">` — the native control's own calendar chrome isn't localized by this
  app and was rendering Korean regardless of the selected language, violating the ko/ja/en rule. This
  picker does real month/year navigation (any past date is selectable; future dates are disabled).
  Tapping the month/year label switches to a year-stepper + 12-month grid (jump straight to a given
  year instead of paging month-by-month, since hire dates can be many years back).

### Backend — Phase 2, stage 1 only (implemented 2026-07-06)

Request submission + self-cancel only. Migration `202607060002_annual_leave_requests.sql` adds
`annual_leave_requests` and `memberships.leave_approver_role` (see
`docs/engineering/04-data-model.md`). The approve/reject action, approval queue UI, and document
output are **not implemented** — stage 2/3.

- `leave-form.tsx` submits/saves-draft via `submitLeaveRequestAction`
  (`src/app/mobile/attendance/leave/actions.ts`); its date pickers were converted from a hardcoded
  July-2026 mock calendar to a real month/year-navigating one (`leave-date-picker.tsx`, mirroring
  `hire-date-picker.tsx`) — necessary, since submitting fake hardcoded dates to a real backend would
  have been actively wrong.
- `leave-home.tsx`'s recent-requests list and pending-count mini-stat, and `leave-history.tsx`'s full
  list + status filter + self-cancel, all read real data now — no more `RECENT`/`REQS` mock arrays.
- `leave-done.tsx` and `leave-cancel-done.tsx` show the actual submitted/cancelled request's real
  data (via `?id=`/`?start=&end=&days=` query params) instead of hardcoded `MOCK` constants. The
  approval-timeline display on the done screen still always shows "step 2 of 4" as current, since
  every request that reaches this screen is freshly `requested` (no approval action exists yet to
  move it further).
- Usage deduction (approved requests reducing `computeAnnualLeaveSummary`'s `usedDays`/
  `specialUsedDays`) is still not wired — there's no way for a request to reach `approved` status yet.

### Backend — Phase 2, stage 2 (implemented 2026-07-07)

Approval review only — document output (stage 3) is still not built. No new migration was needed;
this stage reuses the approval/reject columns already added by `202607060002_annual_leave_requests.sql`
(`approved_by_user_id`/`approved_role`/`approved_at`/`rejected_by_user_id`/`rejected_reason`/
`rejected_at`) and `is_leave_approver()` / `memberships.leave_approver_role`.

- New route `/admin/attendance/leave` with a new "연차"/"年次"/"Leave" tab in the attendance console
  subnav (`src/components/admin/attendance/attendance-subnav.tsx`). Server page
  (`src/app/admin/attendance/leave/page.tsx`) gates on `requireAdminPageSession` + `is_leave_approver`
  — non-approvers see a permission-denied card instead of the queue.
- Backend: `src/lib/annual-leave-approvals-server.ts` — `getAdminLeaveQueue` (org-wide request queue +
  summary), `getAdminLeaveApprovalDetail` (request detail + computed balance impact + same-period
  overlapping leave), `approveLeaveRequestForApprover` (the approval "stamp": `status` → `approved`,
  records `approved_by_user_id`/`approved_role`/`approved_at`, only from `requested`),
  `rejectLeaveRequestForApprover` (`status` → `rejected`, reason optional, per confirmed policy). All
  four are service-role, organization-isolated, and re-verify the caller is an approver (platform admin
  or a membership with `leave_approver_role` set). Server actions:
  `src/app/admin/attendance/leave/actions.ts` (approve/reject), `detail-actions.ts` (detail wrapper).
- Frontend: `src/components/admin/attendance/leave-queue-client.tsx` — 3 summary cards (승인 대기 건수·
  일수 / 이번 주 승인 휴가자 / 잔여 부족·미도래 경고), status-group tabs (승인 대기/승인 완료/반려·취소/
  전체, client-side filter), leave-type filter (유급/경조/특별/기타), search, table, right-side detail
  panel (request info · balance impact · same-period overlap · approval timeline · approve-stamp/reject
  actions). i18n: `admin.leaveConsole.*` + `attendanceConsole.tabLeave` added ko/ja/en.
- **Toolbar refinements (2026-07-07):** summary card 1 counts requests in 건/件/cases (not 명/people);
  the sort control is a real dropdown (신청 순 / 일수 많은 순); the type & sort chip popovers drop
  straight down under their trigger (`ChipDropdown` gained `align`/`fitTrigger` props, defaults keep the
  attendance queue's existing right-align). Branch/building filter was intentionally dropped (StayOps
  has no user↔building association in the schema; confirmed not needed 2026-07-07).
- **Pixel-fidelity pass, Phase 1 (implemented 2026-07-07):** sort now has all 4 handoff options (신청
  순/기간 임박순/일수 많은 순/이름순, client-side). Pending requests whose start date is within 5 days
  get a left-edge orange row indicator (`.qtbl tr.urgent`, Tokyo-date based). The detail drawer's "잔여
  영향" (balance impact) block now renders the handoff's visual before→after progress bar
  (`.limpact`/`.limpact__bar`, added to `admin-console.css`) instead of a plain text line. The 5-view
  sub-tab bar (승인 심사/팀 캘린더/직원 잔여·부여/승인자 관리/문서) is now clickable — the 4
  not-yet-built views render a shared "곧 제공됩니다" (`lvsoon`) placeholder card instead of doing
  nothing when clicked.
- **Admin request creation — proxy + self (implemented 2026-07-07):** the toolbar has two buttons —
  **대리 신청** (file a request on behalf of an active employee, employee picker) and **내 연차 신청**
  (the admin's own request). Both open `leave-request-modal.tsx` and submit through
  `createAdminLeaveRequestAction` → `createAdminLeaveRequest` (`src/lib/annual-leave-admin-server.ts`),
  which reuses `createLeaveRequest`, snapshots the target's `profiles.name` as `applicant_name`, and
  normalizes day count exactly like the mobile form (경조=fixed 3 full days, half-day=0.5 single day,
  else inclusive range). The request enters the queue as `requested`. Target must be an **active** org
  member (`listLeaveApplicants` returns active-only). Any admin-web user may create for self or proxy
  (the console is a management surface; the page gate already restricts to admin-web roles).
- **Not implemented in this stage (explicit follow-up):**
  - Branch/building filter and queue export: excluded.
  - Approval does **not** yet feed back into `computeAnnualLeaveSummary`'s `usedDays`/
    `specialUsedDays` — the detail panel's "잔여 영향" (balance impact) is a **display-only**
    projection computed at review time; wiring approved usage into the actual balance calculation is
    separate follow-up work.
  - No notification is sent to the applicant on approve/reject in this slice.

### Admin sub-tabs — design-only views (implemented 2026-07-08)

The remaining four leave sub-tabs are now visually complete but run entirely on **static mock data**
(no Supabase reads/writes) — a real backend wiring pass is separate follow-up work:

- **팀 캘린더** (`leave-team-calendar.tsx`): TimeTree-style month grid, continuous multi-day bars,
  greedy lane packing for overlaps, AM/PM half-day badges, arbitrary year/month navigation.
- **직원 잔여·부여** (`leave-balance-view.tsx`): balance table + staff detail drawer with grant-schedule
  timeline and an inline hire-date/grant editor (mock only — no recalculation persisted).
- **승인자 관리** (`leave-approvers-view.tsx`): approver summary banner + member table with toggle
  switches; the current admin's own row is locked; minimum-one-approver guard is UI-only here.
- **문서 (休暇届)** (`leave-documents-view.tsx`): 296px staff list (approved-document holders only) →
  document row list (문서번호/유형/기간/일수/승인자) → an A4 (210mm×297mm) form viewer that
  auto-scales to the stage width and reproduces the actual company 休暇届 form (title with double
  underline, 申請日 fill-in date, 氏名/期間/休暇区分/事由/緊急連絡先 table, 本人/部署長/専務 stamp
  row with a red circular seal on the deciding approver's box). "인쇄/PDF" calls `window.print()`;
  `@media print` (global, not `.adm`-scoped) hides everything except `#docSheet` and forces
  `@page { size: A4; margin: 0 }`. The 休暇届 form text itself (title, field labels, 上記の通り…) is the
  actual Japanese company form wording, not app UI copy, so it is hardcoded rather than run through
  `dictionary.*` — only the surrounding screen chrome (staff-list header, buttons, meta line) is
  translated ko/ja/en via `admin.leaveConsole.docs*`.
  - Uses the existing `--font-noto-jp` (Noto Sans JP, already loaded in `src/app/layout.tsx`) rather
    than adding a new Noto Serif JP font load; letter-spacing/size were matched to the handoff instead.
  - Document output as a **real, backend-generated** artifact is now built — see "문서 (休暇届) — backend
    wiring (2026-07-08)" below.

### 문서 (休暇届) — backend wiring (2026-07-08)

The 休暇届 is now generated from the real approved request (no separate documents table — the printable
form is derived from the `annual_leave_requests` row; only the number is persisted):

- **Document number `AL-YYYY-MM-NNN`** — `YYYY-MM` is the approval month (Asia/Tokyo), `NNN` a zero-padded
  per-organization/month sequence. Assigned when a request is approved, in `approveLeaveRequestForApprover`
  (`src/lib/annual-leave-approvals-server.ts`) as a **best-effort** step: it never blocks the approval, and
  on a unique-violation race with a concurrent approval it recomputes and retries. Migration
  `202607080001_annual_leave_document_number.sql` adds `annual_leave_requests.document_number` + a partial
  unique index `(organization_id, document_number)` and **backfills** existing approved requests. **This
  migration must be applied** for numbers to appear; until then `listLeaveDocuments` returns `[]` and the
  approval still succeeds (numberless).
- **View data** — `listLeaveDocuments` (`src/lib/annual-leave-admin-server.ts`) returns approved requests
  that have a document number, joined with the applicant's org role and the approver's name; the client
  (`leave-documents-view.tsx`) groups by employee and renders the A4 休暇届. The stamp box is filled by the
  approver's `approved_role`: `department_head` → 部署長, `senior_managing_director` → 専務; 本人 shows the
  applicant's initial. 申請日 = submitted_at (Tokyo). "인쇄/PDF" still calls `window.print()`.
- Empty state (`docsEmptyTitle`/`docsEmptyBody`) shown when there are no approved documents yet.
- Not carried over: the mock's "원본 신청 보기" button (would deep-link to the request detail) was dropped;
  a real print/PDF **template** beyond the on-screen A4 form is still a possible follow-up.

### Admin sub-tabs — backend wiring (implemented 2026-07-08)

Three of the four sub-tabs are now wired to real Supabase data (문서 is covered separately above).
No new migration was needed for these three — this reuses `annual_leave_requests`,
`annual_leave_baselines`, `profiles.hire_date`, and `memberships.leave_approver_role`.

- **팀 캘린더** (`leave-team-calendar.tsx`): now driven by the org-wide **approved** requests the queue
  client already holds (`initialItems.filter(status === "approved")`) — no separate fetch. Each bar
  carries its real request id; clicking a bar opens the **same request detail drawer** as the review
  queue (`LeavePanel`, keyed by request id), reused read-only for approved requests (its
  approve/reject actions are hidden when `status !== "requested"`). This mirrors the handoff, where a
  calendar bar's `data-panel` points at `req:<id>`.
  - **Empty day cell → new request (2026-07-08):** clicking an empty day cell opens a small popover
    (대리 신청 / 내 연차 신청) that launches `leave-request-modal.tsx` with that date pre-filled
    (`prefillDate`). Bars and empty cells never conflict — `.ttbars` is `pointer-events:none` with only
    `.ttbar` clickable, so bar clicks open the detail drawer and empty-space clicks fall through to the
    cell handler. A hover "+" affordance on cells signals the action; the popover closes on scrim-click
    or Esc.
- **직원 잔여·부여** (`leave-balance-view.tsx`): server `listAdminLeaveBalances`
  (`src/lib/annual-leave-admin-server.ts`) returns one row per active salary-based employee
  (`memberships.role !== 'part_time_staff'`), with balances from `computeAnnualLeaveSummary`.
  **Approved** 유급 leave is deducted from the base pool and **approved** 특별 leave from the bonus
  pool (경조/기타 draw from neither) — this is the point where approved usage finally feeds the balance
  calc for the admin view. `grant` is reported as `remaining + used` so "remaining / grant" always
  reconciles; 소멸 예정 surfaces the earliest bucket lapsing within 180 days; 미도래 = no baseline yet.
  The drawer's hire-date/grant editor persists via `saveEmployeeLeaveBaseline` →
  `setAnnualLeaveBaselineForUser` (writes `profiles.hire_date` + upserts `annual_leave_baselines`),
  behind `saveEmployeeLeaveBaselineAction` (approver-gated). Employee role labels come from
  `dictionary.roles`.
- **승인자 관리** (`leave-approvers-view.tsx`): server `listAdminApprovers` lists active non-hourly
  members (current approvers first), `isApprover = leave_approver_role is not null`. The toggle grants
  /revokes via `setLeaveApprover` → `setLeaveApproverAction` (approver-gated) writing
  `memberships.leave_approver_role`. **Confirmed 2026-07-08:** the mock's plain on/off toggle is kept;
  enabling stores `'department_head'` by default (the `'department_head'`=部署長 vs
  `'senior_managing_director'`=専務 distinction only affects the eventual stage-3 document stamp box —
  `is_leave_approver()` only checks for a non-null value, so either grants approval today). Server-side
  guards: the current admin can't remove their own right (their row shows a 잠금 chip, `locked`), and
  the org must always keep **at least one** approver (`min_one_approver`). The **소속** column has no
  data source — StayOps has no user↔building association (same reason the queue's branch filter was
  dropped 2026-07-07) — so it renders "—".
- Management writes (`saveEmployeeLeaveBaselineAction`, `setLeaveApproverAction`) re-verify the caller
  is a leave approver server-side via `isSessionLeaveApprover` (exported from
  `annual-leave-approvals-server.ts`), on top of the page-level `requireAdminPageSession` gate.
- **Still not built:** applicant notification on approve/reject; and hourly-staff exclusion is currently
  by membership role only (`part_time_staff`), not by `employment_type_history`. (문서 real generation is
  now built — see "문서 (休暇届) — backend wiring".)

## Recommended user entry flow

### Mobile

1. New employee signs up with an employee code.
2. The signup flow asks for hire date if it is missing.
3. Existing users who do not have a hire date yet are prompted the first time they open annual leave.
4. The mobile home shows a clear annual-leave entry card.
5. The request form opens from that card.

### Admin

1. Admins can open the same annual-leave request form from the dashboard.
2. Admins can edit missing hire dates from the employee detail screen.
3. Admins can review requests in an approval queue.
4. Approved requests automatically generate the signed document.

## Screens to build

- annual leave home / shortcut card — **built**
- annual leave request form — **built**
- annual leave history — **built** (list + filter + self-cancel + resume/continue/swipe-delete drafts)
- annual leave history calendar — **built** (mobile L5, real month navigation + real approved-only,
  org-wide data)
- request detail / approval status — **built** (read-only detail sheet in history)
- hire-date missing prompt — **built**
- approval queue (`/admin/attendance/leave`) — **built** (2026-07-07)
- request detail drawer (approver-facing, with approve/reject) — **built** (2026-07-07, right-side
  panel in `leave-queue-client.tsx`); an approved request also has a **승인 취소(revoke)** action
  (2026-07-09) that sets it to `cancelled` (balance auto-restored, dropped from calendar/documents)
- backdated requests — leave can be filed for **past dates** on both mobile and dashboard (2026-07-09;
  e.g. urgent leave taken first, paperwork filed after). Only the mobile picker had blocked past days.
- admin dashboard team calendar / employee balance-grant management / approver management sub-tabs —
  **built + backend-wired** (2026-07-08); team calendar bar → read-only request detail drawer
- admin dashboard 문서 (休暇届) sub-tab — **built + backend-wired** (2026-07-08): AL-YYYY-MM-NNN number on
  approval, 休暇届 rendered from the real approved request
- admin dashboard 이력 (승인 장부) sub-tab — **built** (2026-07-09): read-only ledger of every request
  (draft excluded) with 신청자·유형·기간·일수·상태·처리자·처리일시·문서번호·사유, status filter, search,
  and client-side CSV export. Server: `listLeaveLedger`.
- employee leave balance / grant history — balance built; a full grant-history ledger view is not
- document preview / print — **built** (on-screen A4 + `window.print()`); a dedicated PDF export template
  beyond browser print is a possible follow-up

### Mobile UX notes

- All typing fields on the mobile leave forms (reason `.ftext`, emergency-contact `.finput input`,
  and the baseline-setup number input) use `font-size: 16px`. iOS Safari auto-zooms the viewport
  when focusing a text field smaller than 16px; 16px keeps the page at its mobile size on focus while
  leaving pinch-zoom available elsewhere. Do not lower these below 16px (fixed 2026-07-06).

## Document output

- the company leave form should keep the current paper layout as the reference (photo on file, see
  "Paper form reference" above)
- print output should match the same layout; PDF is a stretch goal — no PDF-generation library exists
  in this project yet, so the interim plan is a print-optimized HTML view (browser print-to-PDF)
- the approved document should be generated automatically after approval
- the document should include the request details, approval timestamp, approver identity, and the
  stamp (button-click approval, not a drawn signature — confirmed 2026-07-06)
- the selected leave type should be visually marked with the matching color in the generated form
- the request form should keep the same leave-type options as the paper form and carry the selected
  option into the output with an automatic color fill
- morning half-day and afternoon half-day requests should be supported in the same form and output

## Calendar requirements

- **confirmed 2026-07-06:** the mobile calendar (L5) shows every employee's leave, including the
  viewer's own — not a self-only view. Only **approved** leave appears; pending/rejected/draft/
  cancelled requests are never shown org-wide (RLS: `annual_leave_requests_org_approved_select`,
  migration `202607060003`).
- admins will additionally get a team-wide calendar view on the dashboard — the leave subnav's
  "팀 캘린더" sub-tab exists as a placeholder (2026-07-07) but has no functionality yet; likely the
  same approved-only data, just presented in an admin-console layout.

## Open questions

- whether leave older than the confirmed 2-year carryover window behaves differently for any leave
  category, and whether the 2-year window itself is final (pending company confirmation)
- exact print/PDF fidelity requirements against the paper form once stage 3 is scoped

## Next step

Approval review (stage 2), the team calendar / balance / approver sub-tabs, and 문서 (休暇届, stage 3 —
AL-YYYY-MM-NNN number on approval + form generated from the approved request) are all implemented and
backend-wired (2026-07-08). Approved usage feeds both the admin balance view and — as of 2026-07-09 — the
**mobile** self-summary + the request-modal preview, via the shared `sumApprovedLeaveUsage` helper
(`annual-leave-server.ts`), so mobile and admin balances always agree. The document-number migration
`202607080001` has been applied to production. Remaining follow-up work, in no fixed order: applicant
notification on approve/reject (**deferred** to the end-of-development notification redesign); ability to
designate an approver as 전무(`senior_managing_director`) (approver toggle currently only sets
`department_head`) so the 専務 seal can appear on real approvals; hourly-staff exclusion by real
`employment_type` rather than membership role; and a dedicated PDF export template beyond browser print.
