# Annual Leave / 연차 Workflow

Status: the mobile employee-facing experience is done — hire-date/balance backend, request
submission/self-cancel/draft-resume, and the real team calendar are all implemented and applied
(Phase 1 + Phase 2 stage 1, see below). The admin-dashboard side (approve/reject action, approval
queue, document generation — Phase 2 stage 2/3) is confirmed scope but not started; per the confirmed
build order, it begins only after mobile is fully complete. This is the target annual-leave workflow
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

### Where approval happens (confirmed 2026-07-06)

The approval queue, approve/reject action, and document output are an **admin web dashboard**
feature (`/admin/attendance/leave`, planned to mirror the existing correction-review queue at
`/admin/attendance/queue`), not a mobile screen. Mobile is the employee-facing surface (submit/view
own requests); the PC dashboard is the manager-facing surface (review/approve org-wide). **Build
order: finish the mobile employee-facing experience first; the admin approval dashboard (stage 2/3)
starts only after that.** This is a sequencing decision, not a scope cut — the dashboard work is
still planned, just not started yet.

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
- approval queue — not built (stage 2)
- request detail drawer or page (approver-facing, with approve/reject) — not built (stage 2)
- employee leave balance / grant history — balance built; a full grant-history ledger view is not
- document preview / print / PDF export — not built (stage 3)

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
- admins will additionally get a team-wide calendar view on the dashboard (not yet built, stage 2/3
  scope) — likely the same approved-only data, just presented in an admin-console layout.

## Open questions

- whether leave older than the confirmed 2-year carryover window behaves differently for any leave
  category, and whether the 2-year window itself is final (pending company confirmation)
- exact print/PDF fidelity requirements against the paper form once stage 3 is scoped

## Next step

Finish the mobile employee-facing experience first (confirmed 2026-07-06). Once mobile is complete,
build the admin dashboard: stage 2 (approve/reject action + approval queue UI at
`/admin/attendance/leave`, gated on `is_leave_approver`, reject reason optional), then stage 3
(document output).
