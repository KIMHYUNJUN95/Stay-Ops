# RLS Permissions

## Purpose

This document defines the initial Supabase Row Level Security direction for StayOps.

RLS policies must protect organization data and enforce key permission rules.

## Core Rules

Implementation note:

- Initial RLS helper functions and starter policies are drafted in `supabase/migrations/202605090001_initial_foundation.sql`.
- These policies cover only foundation tables for the first Supabase connection pass.
- Feature-specific RLS policies must be added with the feature migrations, not hidden only in application UI.

## 1. Organization Isolation

Users can access only records that belong to organizations where they have an active membership.

Core condition:

```txt
exists active membership for auth.uid() and row.organization_id
```

## 2. Platform Admin Access

Developer/Super Admin users are stored in `platform_admins`.

Active platform admins can access all organizations for support/debugging.

Important:

- Platform admin actions should be audit logged.

## 3. UI Is Not Security

Buttons can be hidden in the UI, but permissions must also be enforced server-side/database-side.

**Permission-denied feedback (as-built, 2026-07-09).** When a server action rejects a call with
`unauthorized`/`forbidden`, the client should tell the user why, not just show a generic failure
message. Two shared components exist for this: `PermissionDeniedSheet`
(`src/components/shell/permission-denied-sheet.tsx`, canonical `BottomSheet`) for `/mobile/*`, and
`AdminToast`/`useAdminToast` (`src/components/admin/shared/admin-toast.tsx`, bottom-center toast) for
`/admin/*`. Copy lives in `dictionary.common.permissionDeniedTitle`/`permissionDeniedBody` (ko/ja/en).
Not every forbidden-returning action is wired to these yet — `DeleteConfirmButton` and
`OrderActionBar` are (see decision log 2026-07-09); other screens (daily report, attendance approval
queue, attendance correction form) already had their own equivalent messaging before this pass and
were left as-is.

## Role Groups

## Platform

```txt
developer_super_admin
```

## Organization Roles

```txt
owner
senior_managing_director
office_admin
cs_staff
field_manager
staff
part_time_staff
```

`senior_managing_director`(전무, added 2026-07-13, migrations `202607130002`/`202607130003`) is fully
`owner`-equivalent: `has_org_role(org, roles[])` was redefined so that whenever `'owner'` is one of the
checked roles, an active 전무 membership also passes — automatically, with no per-policy edits needed,
since every RLS policy that gates on owner already calls `has_org_role`. See
"2026-07-13 User/Permission Model Rework" below.

## Office-Level Roles

Used for order request processing and office/admin actions.

```txt
owner
office_admin
cs_staff
```

## Field/Staff-Level Roles

Used for field operations.

```txt
field_manager
staff
part_time_staff
```

## Status-Changing Roles

Can change maintenance/lost item statuses.

```txt
owner
office_admin
cs_staff
field_manager
staff
```

Part-time staff cannot change statuses.

## Table Policy Direction

## organizations

Read:

- Active organization members can read their own organization.
- Platform admins can read all.

Create:

- The final product rule is no longer "platform admins only during MVP".
- Future organization creation should be allowed only through a validated organization-creation path/code.
- Until that flow is implemented, initial organization bootstrap remains manual / privileged.

Update:

- Owner
- Platform admins

Delete:

- Platform admins only, if ever needed.

## profiles

Read:

- User can read their own profile.
- Organization members can read profiles of users in the same organization directory.
- Platform admins can read all.

Update:

- User can update their own profile.
- Admin-capable roles can update limited profile/admin fields if needed.
- The "users can update own profile" policy also covers `bottom_nav_tabs` (per-user mobile bottom-bar customization); no separate policy is required.

## memberships

Read:

- Active organization members can read memberships in their organization.
- Platform admins can read all.

Create:

- Owner
- Office Admin
- Platform admins

Update:

- Owner
- Office Admin
- Platform admins

Important:

- Users cannot promote themselves.
- Part-time Staff cannot change roles/statuses.
- **(2026-07-13)** In practice, real writes to this table go through **service-role server actions**
  only, additionally gated by **developer default + `manage_users` delegation**
  (`actorCanManageUsersInOrg`, `src/lib/user-management-access.ts`) — an `owner` or `office_admin`
  without a delegation cannot actually change roles/statuses at `/admin/users`, even though the RLS
  policies above still name them. Treat the Owner/Office Admin/Platform Create/Update policies above as
  a **client-side-bypass backstop only**, not the real access rule. See
  "2026-07-13 User/Permission Model Rework" below and `docs/product/27-permission-override-workflow.md`.

## invite_codes

Read:

- Owner
- Office Admin
- Platform admins

Create/update:

- Owner
- Office Admin
- Platform admins

Use:

- Unauthenticated/signup flow can validate active code through a safe server function.

Planning note (2026-06-18):

- Invite-code validation must be the membership gate after authentication.
- A successful validation resolves `organization + signup role category` before final join.
- Initial invite-code creation/rotation is still manual bootstrap until the later dashboard tooling exists.

As-built note (2026-06-18):

- `validateInviteCode` (`src/lib/auth-invite.ts`) and the onboarding `previewInviteCode` server action read `invite_codes` (and the target `organizations.name`) via the **service role, server-side only**, and require an authenticated user — so the preview is not an open invite-probing endpoint. Preview is read-only; it does **not** consume the code.
- Final join still goes through the atomic `join_organization_with_invite_code` RPC (increments `used_count` + creates the membership) — the preview never grants access on its own.

## properties / rooms

Read:

- Active organization members.

Create/update:

- Owner
- Office Admin
- Field Manager
- Platform admins

Delete:

- Admin-capable roles only, with confirmation.

## reservations

Read:

- Active organization members.

Create/update:

- Beds24 webhook server function.
- CS Staff can update manual expected check-out time.
- Office Admin/Owner can update if needed.
- Platform admins.

Delete:

- Server function for cancelled reservations or admin/debug only.

Important:

- Price/revenue fields are not stored in MVP.

## beds24_webhook_events

Platform/operational observability log (not org business data).

Read:

- Platform admins only (`is_platform_admin()`).

Create/update/delete:

- Service role only (webhook + reconciliation cron paths). Platform admins also have full access via the `for all` policy.

Important:

- Not readable by regular organization members, including office-level roles. This is intentional: it is a Beds24 ingestion diagnostic surface, not an operational business table.
- `authenticated` has a `select` grant but the only `select` policy is platform-admin-gated, so non-platform users see nothing.

## cleaning_records

Read:

- Active organization members.

Create:

- Field Manager
- Staff
- Part-time Staff
- Office/admin roles if needed

Update:

- Creator can update active/completion state.
- Field Manager and office-level roles can update/review.
- Platform admins.

Export:

- Owner
- Office Admin
- CS Staff if permitted
- Field Manager
- Platform admins

## maintenance_requests

Read:

- Active organization members.

Create:

- All active organization members.

Update content:

- Creator can edit their own record.
- Part-time Staff can edit only their own record.
- Staff and above can manage according to organization policy.

Change status:

- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Platform admins

Delete:

- **Admin roles** (developer_super_admin, owner, office_admin, cs_staff): can delete any record.
- **Non-admin roles** (field_manager, staff, part_time_staff): can delete only their own records (`reported_by_user_id = auth.uid()`).
- Entry point: request list view (icon button per card) and request detail page.
- Requires confirmation modal before executing.
- Hard delete.

RLS pattern:
```sql
-- DELETE policy
USING (
  organization_id IN (select org from active_membership)
  AND (
    reported_by_user_id = auth.uid()          -- own record
    OR role IN ('owner','office_admin','cs_staff')  -- admin
    OR is_platform_admin(auth.uid())
  )
)
```

Additional implementation note (2026-07-09):
- Reservation-linked maintenance creation may also set `reservation_id` / `guest_name`, but the
  create path must first verify server-side that the linked reservation belongs to the same
  organization and matches the submitted property / room context.
- These extra context columns do not broaden who can read or mutate maintenance rows.

## lost_items

Read:

- Active organization members.

Create:

- All active organization members.

Update content:

- Creator can edit their own record.
- Part-time Staff can edit only their own record.
- Staff and above can manage according to organization policy.

Change status/retrieval:

- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Platform admins

Delete:

- **Admin roles** (developer_super_admin, owner, office_admin, cs_staff): can delete any record.
- **Non-admin roles** (field_manager, staff, part_time_staff): can delete only their own records (`reported_by_user_id = auth.uid()`).
- Entry point: request list view (icon button per card) and request detail page.
- Requires confirmation modal before executing.
- Hard delete.

RLS pattern: same structure as `maintenance_requests` delete policy above.

Additional implementation note (2026-07-09):
- Reservation-linked lost-found creation may set `property_name` / `reservation_id` / `guest_name`
  after the same organization-scoped reservation validation.
- These snapshot columns are descriptive only and do not change lost-item access control.

## reservation_internal_notes

Platform override:

- Platform admins

Read:

- All active organization members

Create / update / delete:

- Owner
- Office Admin
- CS Staff
- Field Manager

Blocked from write:

- Staff
- Part-time Staff

Notes:
- `reservation_internal_notes` is the admin reservation-calendar inspector memo table.
- Read policy is `is_platform_admin()` OR `has_active_membership(organization_id)`.
- Write policies keep the privileged operator scope:
  `is_platform_admin()` OR `has_org_role(organization_id, ['owner','office_admin','cs_staff','field_manager'])`.
- Notes are organization-scoped operational metadata and are never exposed as public reservation
  data.

## order_requests

Read:

- Active organization members.

Create:

- All active organization members (reporter = auth.uid()).

Update content:

- Creator can edit their own record.
- Field Manager, Owner, Office Admin, CS Staff, Platform admins can update any record.
- Staff and Part-time Staff can only edit their own records.

Process status (approve / reject / mark as ordered):

- Developer / Super Admin (platform)
- Owner
- Office Admin
- CS Staff

Cannot process status:

- Field Manager — **Note**: the RLS UPDATE policy includes `field_manager` for content edits, but the server action (`updateOrderRequestStatus`) gates status mutation on `adminWebRoles` only, which excludes field_manager. Field Manager can edit record content but cannot change status through the app.
- Staff
- Part-time Staff

Delete:

- **Admin roles** (developer_super_admin, owner, office_admin, cs_staff): can delete any record regardless of status.
- **Non-admin roles** (field_manager, staff, part_time_staff): can delete only their own records.
- Additional constraint: orders in `ordered` or `received` status should only be deleted by admin roles (the order may already be placed externally).
- Entry point: request list view (icon button per card) and request detail page.
- Requires confirmation modal before executing.
- Hard delete.

RLS pattern: same structure as `maintenance_requests` delete policy above.

## announcements

Read:

- Targeted users.
- Platform admins.

Create:

- All roles except Part-time Staff.

Update/delete:

- Creator
- Owner
- Office Admin
- Platform admins

Comments:

- Users who can view an announcement can comment.

## notifications

Read:

- User can read own notifications.

Update:

- User can mark own notifications as read.

Create:

- Server functions/system.

## recurring_work_templates / recurring_work_occurrences

Read:

- Active organization members.

Create/update templates:

- Owner
- Office Admin
- Field Manager
- Platform admins

Complete occurrences:

- Field Manager
- Staff
- Part-time Staff if assigned/allowed
- Office-level roles if needed

## attachments

Read:

- Users who can read the target record.

Create:

- Users who can create or edit the target record.

Delete:

- Users who can delete or edit the target record.

Important:

- Storage path should include organization ID.
- Storage policies must match database permissions.

# Post-MVP Feature Batch RLS (approved 2026-06-09)

All tables below follow the standard org-isolation base: a row is accessible only when the user has an active membership in `row.organization_id`, with platform-admin bypass. The three `linen_*` tables are **implemented** (migration `202606100002_linen_returns.sql`); the rest are not implemented yet. Full detail in `docs/engineering/08`–`12`.

## linen_items

Implemented.

- Read: all active org members (platform-admin bypass).
- Create / update / delete: admin-capable roles (owner, office_admin, cs_staff, field_manager) plus platform admin — manage the item master. (Admin UI deferred; RLS is ready.)

## linen_return_records

- Read: all active org members.
- Create: all active org members.
- Update / delete: author-only, plus admin-capable roles.

## linen_return_record_items

- Read: follows parent `linen_return_records` visibility.
- Create / update / delete: same mutation rule as the parent record (author or admin-capable roles).

## tasks

Implemented (migration `202606100003_todo_tasks.sql`). RLS uses a `security definer` helper
`is_task_participant(task_id)` to avoid tasks↔participants policy recursion. Reads (lib/tasks.ts)
use the RLS-scoped client; **all writes go through service-role server actions** with explicit
permission checks (author-only core edits, participant workflow, author-leave = full delete,
non-author-all-removed → private). Direct authenticated writes to `task_participants` are denied.

- Read: active participants only.
- Create: any active org member when creating a task where they are the original author.
- Update: original author edits core task content; current participants can mutate only shared workflow-state fields through controlled actions.
- Delete: original author only for the canonical task row. Participant self-removal is a separate controlled action.
- **Completion (re-introduced 2026-06-13):** complete/reopen are controlled service-role server
  actions (`completeTask` / `reopenTask`) like every other task write — they stamp/clear
  `status` + `completed_at` + `completed_by_user_id`, write an update-log row, and (on complete) fan
  out a `task_completed` notification. No direct authenticated table write.

### Daily report generation (staff-only) — as-built (2026-06-13)

The Todo **daily report** (업무일지; free, template-based — no LLM) generator is permission-gated
server-side in
`generateDailyReport(date)` via `canGenerateDailyReport(role, can_generate_report)` in
`src/config/roles.ts`:

```txt
role != 'part_time_staff'  OR  profiles.can_generate_report = true
```

- It gathers only the **caller's own** completed tasks for the given Tokyo date.
- A forbidden caller (part-time staff without the flag) is rejected by the server action and shown a
  "권한 없음" popup — UI gating alone is not relied on.
- The per-user `profiles.can_generate_report` flag is toggled by **owner / office_admin** in admin
  user management (`updateMemberReportAccess`). Regular staff are covered by the role check and never
  need the flag.

## task_participants

- Read: active participants on the parent task.
- Create: controlled server action only.
- Delete: original author may remove non-author participants; any participant may remove self.

## task_updates

- Read: active participants on the parent task.
- Create: active participants on the parent task.
- Update / delete: not required in the first slice unless product rules change later.

## board_posts

- Read: all active org members.
- Create: **all active roles including part_time_staff** (confirmed 2026-06-09).
- Update / delete: author own posts; admin-capable roles moderate all (pin, archive, delete).

## staff_suggestions

**As-built (Step 1 — schema, migration `202606160001_staff_suggestions.sql`, 2026-06-16):**

- RLS enabled on `staff_suggestions`, `staff_suggestion_references`, `staff_suggestion_comments`.
- **Read** (SELECT policy on all three): `is_platform_admin()` OR `can_view_staff_suggestion(id)` —
  a `SECURITY DEFINER` helper that returns true for the author, the recipient, or a referenced user
  (references checked via the join table; definer-rights so it never recurses through these policies).
- **Writes**: no INSERT / UPDATE / DELETE policies exist, so direct authenticated writes are denied.
  All mutations are routed through **service-role server actions** (added in later steps), which carry
  the business rules below. `grant select, insert, update, delete ... to authenticated` is present but
  inert for writes without a policy; `grant all ... to service_role` lets the service role bypass RLS.

Business rules to enforce in those server actions (not yet implemented):

- Create: any active org member; recipient required, same org, `<> author` (DB also checks this).
- Update / delete main suggestion by author: own row only while `status = 'submitted'`.
- Update status fields (`status`, `hold_reason`, `completion_note`): recipient only (DB CHECKs already
  require a hold reason for `on_hold` and a completion note for `completed`).
- Referenced-user rows: managed by the author only while parent suggestion is `submitted`; referenced
  user must be same-org and not the author/recipient.
- Comments: visible participants can insert; only the comment author can update/delete.

## Attendance / Payroll tables

**As-built (Step 1 — schema, migration `202606170001_attendance_payroll.sql`, 2026-06-17).** This is the
session-first model (supersedes the earlier `attendance_events` / `employment_profiles` draft). 11
tables, all with **read-only RLS** (no write policies → direct authenticated writes are denied; all
authoritative writes go through **service-role server actions** in later steps). `grant select, insert,
update, delete ... to authenticated` is present but inert for writes without a policy; `grant all ... to
service_role` lets the service role bypass RLS.

Permission foundation:

- `memberships.attendance_payroll_admin boolean not null default false` — explicit per-membership
  attendance/payroll privilege.
- `can_manage_attendance_payroll(org)` SECURITY DEFINER helper = `is_platform_admin()` OR an active
  member who is the org `owner` or carries `attendance_payroll_admin`. **Site master / QR issuance stays
  owner-only** (app-enforced via `has_org_role(org, ['owner'])`); not broadened by this helper.

Read (SELECT) policies — "own rows, or org-wide for privileged admins" unless noted:

- `attendance_sites`: any **active member** may read (the clock UI needs site name/coords/radius;
  coordinates aren't secret).
- `attendance_qr_tokens`: **privileged admins only** (tokens authorize attendance; clock-in resolves the
  token server-side via service role).
- `attendance_sessions`: own (`user_id = auth.uid()`) or privileged admin (review queue / dashboard).
- `attendance_breaks`: session owner (resolved via the parent session) or privileged admin.
- `attendance_attempt_logs`: **privileged admins only** (diagnostics; no payroll effect).
- `attendance_correction_requests`: requester (`requested_by_user_id`) or privileged admin.
- `attendance_session_audits`: **privileged admins only** (manager-side trail).
- `employment_type_history` / `hourly_rate_history`: own rows (the monthly pay view shows the user their
  own type/rate segments) or privileged admin. Other users' wage figures never leak to non-admins.
- `attendance_pay_allowances` (implemented 2026-07-10, migration `202607100001`): read-only RLS —
  `has_active_membership(org) AND (target_user_id = auth.uid() OR can_manage_attendance_payroll(org))`.
  Org-wide (`target_user_id IS NULL`) rows reach a worker only through the service-role monthly pay view,
  never a direct client read. No write policies; `createAttendanceAllowance` / `cancelAttendanceAllowance`
  (service-role, `isAttendancePayrollAdmin`-gated) perform all writes and reject changes to a finalized
  user-month until it is reopened.
- `attendance_month_snapshots`: own pay rows or privileged admin (finalization queue / dashboard).
- `attendance_export_logs`: **privileged admins only**.

**Transport reimbursement (2026-06-26, migration `202606260001`).** `transport_reimbursement_reports`
/ `transport_reimbursement_items` / `transport_reimbursement_item_images` are **read-only RLS, no write
policies** (same pattern as the attendance foundation — all authoritative writes go through service-role
server actions; `service_role` bypasses RLS). SELECT policy on all three: `has_active_membership(org)`
**AND** (`user_id = auth.uid()` OR `can_manage_attendance_payroll(org)`) — i.e. own rows for any active
member, org-wide for org owner / `attendance_payroll_admin` / platform admin. This is the **same
privilege helper as payroll, but a fully separate dataset** from `attendance_month_snapshots`. Reuses
the shared `set_updated_at()` trigger.

**Annual leave — Phase 1 backend only (2026-07-06, migration `202607060001`).** `annual_leave_baselines`
is **read-only RLS, no write policies** — identical shape to transport reimbursement above: own row
for any active member, org-wide for org owner / `attendance_payroll_admin` / platform admin. All
writes go through `setAnnualLeaveBaselineAction` (`src/app/mobile/attendance/leave/actions.ts`,
service-role), which also sets `profiles.hire_date`. This migration deliberately does NOT add a leave
request/approval table — that workflow is still a planning draft (see
`docs/product/26-annual-leave-workflow.md`).

**Annual leave — Phase 2, stage 1 (2026-07-06, migration `202607060002`).** `annual_leave_requests` is
**read-only RLS, no write policies** — own row for any active member, org-wide for a NEW privilege
helper `is_leave_approver(org)` (checks `memberships.leave_approver_role is not null`, same shape as
`can_manage_attendance_payroll` but keyed off a role-enum column instead of a boolean, since the
future printed document needs to know which stamp box — 부서장/대표 vs 전무 — an approval fills).
All writes go through `submitLeaveRequestAction` / `cancelLeaveRequestAction`
(`src/app/mobile/attendance/leave/actions.ts`, service-role). There is deliberately no approve/reject
write path yet — `is_leave_approver` exists so approvers can already READ the queue once stage 2
adds the UI, but nothing can act on it yet. Storage policies mirror the transport-reimbursement
5-part-path pattern, scaled to this table's 4-part path
(`{org}/annual-leave-requests/{request_id}/{file}`), open to all active members including
`part_time_staff` (same precedent as attendance-corrections/transport uploads) even though this
feature itself targets salary-based regular employees only.

**Annual leave — team calendar visibility (2026-07-06, migration `202607060003`).** A second, additive
SELECT policy `annual_leave_requests_org_approved_select` grants any active org member read access to
rows where `status = 'approved'`, org-wide — confirmed policy: the mobile leave calendar shows every
employee's approved leave (including the viewer's own), but pending/rejected/draft/cancelled stay
private (visible only via the existing self-or-approver policy). Combined with that policy, the net
effect is: own rows (any status) + approver/admin rows (any status) + everyone's approved rows.

**Membership permission overrides — schema only (2026-07-09, migration `202607090002`).**
`membership_permission_overrides` is **read-only RLS, no write policies** (same service-role write
boundary as attendance/transport/annual-leave above). Single SELECT policy
`membership_permission_overrides_owner_admin_select`: `has_org_role(org, ['owner'])` OR
`is_platform_admin()` — i.e. **only `owner` / `developer_super_admin` may read overrides**.
`office_admin` cannot (unlike role changes, where it has partial authority). A self-view policy is an
open question in `docs/product/27-permission-override-workflow.md` and is deliberately NOT added yet.
INSERT/UPDATE/DELETE have no policies, so all grant/revoke goes through a future service-role server
action (`service_role` bypasses RLS). A DB CHECK `granted_by_user_id <> user_id` blocks self-grant at
the DB level (double defense).

A new SECURITY DEFINER helper `has_permission_override(org, user, key)` (same shape as `has_org_role` /
`is_leave_approver`) returns true iff an active grant exists (`revoked_at is null AND expires_at >
now()`). It is **created but intentionally not referenced by any other table's policy** — a prepared
building block. Feature adoption (adding `OR has_permission_override(...)` to a given table's existing
`has_org_role(...)` policy) is out of scope for this migration and happens per-feature later. The
feature UI and grant/revoke server actions are not implemented yet.

**Step 2 (2026-06-17) — site/QR write path.** Site master + QR lifecycle writes go through the
service-role helpers in `src/lib/attendance-sites.ts` (create/update/activate site, issue/reissue/revoke
QR; QR issuance is atomic via `issue_attendance_qr`, migration `202606170002`). These helpers are
**caller-agnostic and do not check the caller** — **owner-only enforcement is deferred to the future
web-dashboard server actions** (which must verify `role === 'owner'` server-side before calling them;
site master is owner-only per decision-log 2026-06-17). Until that dashboard exists, the only caller is
the **dev-only** `GET /api/dev/attendance/temp-qr` tool, gated to local development (NODE_ENV
development + `ENABLE_LOCAL_DEV_TOOLS` + local/LAN host), used to provision a test site + QR.

**Step 3 (2026-06-17) — worker clock-in/out write path.** `submitAttendanceScan`
(`src/app/mobile/attendance/actions.ts`, service-role) is the first authoritative session writer: it
authenticates the user + org, validates the QR token / site / GPS-radius server-side, enforces
one-open-session-per-user, and writes `attendance_sessions` + `attendance_attempt_logs`. RLS stays
read-only (no write policies); the action holds the rules. Workers read their own sessions via the
read policy; `getCurrentOpenSession` uses the service client but is org+user scoped.

**Step 4 (2026-06-17) — break write path.** `startBreak` / `endBreak`
(`src/app/mobile/attendance/actions.ts`, service-role) write `attendance_breaks` after re-checking the
caller owns an open session server-side (auth + org). One open break at a time; clock-out is blocked
while a break is open. RLS for `attendance_breaks` stays read-only (session owner or admin); workers
read their own break rows through the parent-session policy.

**Step 5 (2026-06-17) — self-view reads.** `src/lib/attendance-history.ts`
(`getAttendanceHistory` / `getAttendanceTodaySummary`) reads sessions + breaks + site names for the
**history screen**. It uses the service client but is **strictly self-scoped**: every query pins
`user_id` to the authenticated session user (+ org) and never accepts a target user id from the client,
so a user cannot reach another user's attendance by tampering with params/query strings. (The
participant RLS read policies are the backstop; the self-scoping is enforced in the query layer.) No
org-wide reads here — the admin review queue is a later step.

**Step 6 (2026-06-17) — correction request write/read path.** `createAttendanceCorrectionRequest`
(`src/app/mobile/attendance/actions.ts`, service-role) writes `attendance_correction_requests` after
**self-only** checks (a linked session must be the caller's own → else `forbidden`) and a **current/
previous Tokyo month** range check (→ else `out_of_range`). It only suggests values; it never mutates the
session (no auto-apply). Reads (`src/lib/attendance-corrections.ts`) pin `requested_by_user_id` to the
authenticated user. Correction photos upload to `request-images/<org>/attendance-corrections/...`;
storage RLS migration `202606170003` whitelists that folder (part-time members included, since
attendance is open to all active members). The participant RLS read policy on
`attendance_correction_requests` (requester or admin) is the backstop; admin approve/reject is Step 7.

**Step 7 (2026-06-17) — admin review (org-wide).** First org-wide attendance surface. The privilege gate
`isAttendancePayrollAdmin(service, org, userId)` (`src/lib/attendance-review.ts`) = platform admin OR
active `owner` / `attendance_payroll_admin` member; **site-master management stays owner-only** (not
broadened). The review-queue read (`getAttendanceReviewQueue`) is caller-agnostic (the web-dashboard
caller must gate it; the `can_manage_attendance_payroll` SELECT RLS policies from Step 1 are the
backstop). The write actions (`src/app/admin/attendance/actions.ts`: approve / reject / in-review)
**enforce the gate themselves** before any write. Approve mutates the linked session (service-role) +
writes `attendance_session_audits`; reject never touches the session. Workers still only read their own
rows; admins read org-wide via the privileged SELECT policies. No org-wide UI yet (web dashboard).

**Step 8 (2026-06-17) — manual admin management.** `createManualAttendanceSession` /
`updateAttendanceSessionAdmin` / `invalidateAttendanceSession` (`src/app/admin/attendance/actions.ts`,
service-role) all **enforce `isAttendancePayrollAdmin` server-side** before any write, require a
mandatory reason, and write `attendance_session_audits`. Create validates the target is an active org
member + sites belong to the org. Invalidate sets `status='invalid'` (no hard delete) — preserving the
"invalidate / supersede, never erase" rule. Site-master management stays owner-only (not broadened). No
admin web UI in the app (deferred to the web dashboard).

**Step 10 (2026-06-18) — hourly pay self-view.** `src/lib/attendance-pay.ts` (`getMonthlyPayView`) reads
sessions + breaks + the user's own `hourly_rate_history` / `employment_type_history` and is **strictly
self-scoped** (pins `user_id` to the authenticated user + org; no client target). It produces EXPECTED
pay only (no writes, no finalization). Org-wide compensation visibility remains restricted (not part of
this step); other users' rate/history/pay never load. Employment/rate **management** writes (Step 9) are
deferred (web dashboard); a dev-only seed route (`/api/dev/attendance/seed-pay`, gated like seed-login)
exists for local testing.

**Implemented — attendance allowances (2026-07-10, migration `202607100001`).**
`attendance_pay_allowances` follows the same payroll-sensitive boundary: no direct authenticated writes,
service-role server actions only (`createAttendanceAllowance` / `cancelAttendanceAllowance`), and
server-side `isAttendancePayrollAdmin` enforcement for create/cancel. Self pay reads include only
allowances applicable to the authenticated user's own monthly pay view (surfaced through the service-role
`getMonthlyPayView`). Org-wide allowance management and payroll-panel visibility are limited to `owner` /
`attendance_payroll_admin`. The server actions check finalized snapshots and reject allowance changes for
a closed user-month (per-user for a targeted row, any-finalized for an org-wide row) unless that month is
reopened first.

**Step 11 (2026-06-18) — monthly finalization.** `finalizeAttendanceMonth` / `reopenAttendanceMonth`
(`src/app/admin/attendance/actions.ts`, service-role) **enforce `isAttendancePayrollAdmin` server-side**;
reopen requires a reason. They write `attendance_month_snapshots` and an `audit_logs` row each. The
worker pay self-view reads the current `finalized` snapshot via `getMonthlyPayView` (still self-scoped to
the authenticated user). `attendance_month_snapshots` RLS stays read-only (own pay rows or privileged
admin, from Step 1); writes go through the privileged actions only. No admin UI in the app (deferred).

**Step 12 (2026-06-18) — org-wide payroll totals.** `getPayrollTotals(org, ym)`
(`src/lib/attendance-payroll-totals.ts`) reads ORG-WIDE compensation (finalized snapshots + every hourly
worker's expected pay + site rollup). It is **caller-agnostic and the caller MUST gate it with
`isAttendancePayrollAdmin`** (owner / `attendance_payroll_admin`) — same pattern as the review queue; the
`can_manage_attendance_payroll` SELECT RLS on `attendance_month_snapshots` is the backstop. Regular users
and hourly workers never reach org-wide totals (they only see their own pay). Read-only; no writes, no
UI (the totals dashboard is in the deferred web dashboard).

**Step 13 (2026-06-18) — finalized-only export.** `runPayrollExport` (`src/lib/attendance-export.ts`,
service-role) **enforces `isAttendancePayrollAdmin` itself** before reading any finalized snapshot, then
writes an `attendance_export_logs` audit row. Export is **finalized data only**; regular users / hourly
workers can never export. The server actions (`exportMonthlyPayroll` / `exportUserPayroll`) and the
dev-only route (`/api/dev/attendance/export`, dev-gated AND privilege-gated) both go through it. No
export UI in the app (deferred web dashboard).

**Step 14 (2026-06-18) — notifications + reminder.** Admin attendance alerts (`attendance_activity`) target
**owner / `attendance_payroll_admin` only** — `getAttendancePayrollAdminUserIds` resolves the recipients
server-side and `notifyAttendanceAdmins` never broadens visibility; regular workers never receive org-wide
attendance/payroll alerts. The 18:30 reminder targets the worker themselves. `attendance_open_session_reminders`
RLS is **own read** (owner of the row or platform admin); writes go through the self-only
`respondOpenSessionReminder` action (service-role). Unique constraint is
`(organization_id, user_id, operating_date)` — org-scoped (migration `202606180003`; prior constraint
was missing `organization_id`). The scheduled scan `/api/attendance/reminders` is
CRON_SECRET-gated (no anonymous trigger). In-app delivery only.

Business rules already enforced (Step 3) / to enforce later in server actions: one open session per user
(done); sites required (done); GPS mandatory + within radius (done); PWA active method `gps_qr` (done;
`gps_wifi` modeled but inactive); midnight-crossing flagged `review_required` (baseline done);
sites required (no free-text locations); GPS mandatory; PWA active method `gps_qr` (`gps_wifi` modeled
but inactive); clock-out blocked while a break is open; correction window = current + previous month;
reject comment required on correction reject; finalization (owner / `attendance_payroll_admin`) blocked
while review-required / pending-correction / open / reopened items remain; export covers finalized data
only. See `docs/engineering/11-attendance-payroll-technical-design.md`.

## audit_logs

Read:

- Platform admins.
- Owner/Office Admin later if an admin audit UI is added.

Create:

- Server functions/system only.

Update/delete:

- No normal user updates/deletes.

## Auth / Identity Linking Contract

"**Same email = same account**" is a confirmed product policy. Its enforcement currently depends on **Supabase Auth configuration**, not application code:

- **Automatic identity linking must be enabled**, and **email confirmations must be required**. Under these settings, when a Google sign-in's email matches an existing user's *confirmed* email, Supabase links the Google identity to that user instead of creating a duplicate (verified in this project: the owner account carries both `email` and `google` identities).
- The **email-signup** path additionally handles the reverse collision in app code: `supabase.auth.signUp` returning a user with `identities.length === 0` means the email already exists, and the user is redirected to log in (`resume_existing_account`) — `src/app/auth/actions.ts`.
- **Google sign-in** (`signInWithGoogle`) does **not** add explicit linking/collision handling; it relies on the Supabase behavior above. A manual `linkIdentity` flow (the designed "계정 연결" screen) is intentionally **not** wired yet, because Supabase enforces email uniqueness today.
- **Risk if the config drifts:** if email confirmation or automatic linking is turned off, a same-email Google sign-in could diverge into a separate account. If that policy is ever needed independent of the Supabase setting, wire the manual link-identity flow.

> **Action item:** confirm in the Supabase dashboard (Auth settings) that automatic account linking is on and email confirmations are required.

## 게시판 (board_posts / board_post_reads / board_comments / board_reactions)

마이그레이션 `202606250001_board.sql` (2026-06-25 적용).

**board_posts**
- SELECT: `deleted_at is null AND has_active_membership(organization_id)`
- INSERT: `created_by_user_id = auth.uid() AND has_active_membership(organization_id)` — part_time_staff 포함 전체 활성 멤버
- UPDATE: `created_by_user_id = auth.uid() OR has_org_role(org_id, [owner, office_admin])`
- DELETE: `created_by_user_id = auth.uid() OR has_org_role(org_id, [owner, office_admin])`

**board_post_reads** — 자기 row 만 read/insert/update (user_id = auth.uid())

**board_comments**
- SELECT: `deleted_at is null AND has_active_membership(organization_id)`
- INSERT: `created_by_user_id = auth.uid() AND has_active_membership(organization_id)` — `allow_comments` 체크는 서버 액션 레벨에서 수행 (RLS 정책에 포함되지 않음)
- DELETE: `created_by_user_id = auth.uid() OR has_org_role(org_id, [owner, office_admin])`

> **@멘션 보안**: `mentioned_user_ids`의 각 UUID가 같은 org 활성 멤버인지는 **서버 액션 레벨**에서 검증 (RLS만으로 배열 원소 단위 검증 불가). 클라이언트가 임의 UUID를 삽입해도 서버에서 거부.

**board_reactions**
- SELECT/INSERT: `has_active_membership(게시글의 organization_id 서브쿼리)` + user_id = auth.uid()
- DELETE: user_id = auth.uid()

**스토리지 RLS**
- `request-images`: `board-posts` / `board-comments` 폴더 추가 (part_time_staff 허용). `202606250001_board.sql`에서 "org members can upload/delete request images" 정책 재생성.
- `board-attachments` (새 버킷, private): org 멤버 SELECT·INSERT; 업로드한 본인만 DELETE (owner = auth.uid()).
- `request-images`: 교통비 증빙용 **5단계 경로** 정책 추가 (`202606260001_transport_reimbursement.sql`). 경로 `{org}/transport-reimbursements/{report_id}/{item_id}/{file}`. 기존 정책은 4단계 경로를 강제하므로, "org members can upload/delete transport reimbursement images" 정책을 별도로 추가 (permissive 정책은 OR 결합 → 4단계·5단계 공존). org_id·report_id·item_id 모두 UUID 형식 검증, 활성 org 멤버(part_time_staff 포함) 또는 platform admin 허용.

## bug_reports

**1차 구현 (2026-06-25).** StayOps 앱/시스템 버그 신고 테이블. Migration: `supabase/migrations/<timestamp>_bug_reports.sql` (DB engineer 결과 확인 후 파일명 갱신 필요). 모든 쓰기는 **서비스롤 서버 액션** 경유; RLS 는 코드 게이트와 이중으로 적용.

### 리뷰어 정의 (1차 확정)

```txt
owner, office_admin
```

`cs_staff` / `developer_super_admin` 리뷰어 확장: open question, deferred.

### SELECT

```txt
reported_by_user_id = auth.uid()                              -- 작성자 본인
OR has_org_role(organization_id, ['owner', 'office_admin'])   -- 리뷰어
```

### INSERT

```txt
has_active_membership(organization_id)
AND reported_by_user_id = auth.uid()
```

모든 활성 org 멤버 (part_time_staff 포함) 신고 가능.

### UPDATE

두 가지 별도 정책:

```txt
-- 작성자 본인 수정 (submitted 상태만)
reported_by_user_id = auth.uid()
AND status = 'submitted'

-- 리뷰어 상태 변경
has_org_role(organization_id, ['owner', 'office_admin'])
```

1차에서 수정 페이지는 UI 숨김 (deferred). `updateBugReportStatus` 서버 액션이 리뷰어 상태 변경을 처리.

### DELETE

```txt
reported_by_user_id = auth.uid()
AND status = 'submitted'
```

작성자만 `submitted` 상태일 때 hard delete 가능. **리뷰어 hard delete는 1차 불허** — 별도 관리 정책 승인 시 추가.

## Open Questions

- Should Staff be allowed to status-change lost items and maintenance forever, or only certain statuses?
- Should CS Staff be allowed to export cleaning records by default?
- Should Field Manager be able to delete other users' records?
- Should hard delete be blocked if a record has attachments?
- Should some actions require server functions instead of direct table updates?
## 2026-07-10 Property Operation Info Permissions

`public.property_operation_infos`

- `SELECT`: active organization members in the same org, plus platform/developer super admins
- `INSERT / UPDATE / DELETE`: `owner`, `office_admin`, `cs_staff`, plus platform/developer super admins
- purpose: shared calendar building metadata consumed by both admin and mobile reservation calendar

## 2026-07-14 teams (소속: 현장/사무실)

**Phase 1 implemented (2026-07-14), migration `supabase/migrations/202607140001_teams.sql` — written,
not yet applied.** See `docs/planning/01-decision-log.md` → 2026-07-14 and
`docs/engineering/04-data-model.md` → `teams`.

- `teams`:
  - SELECT: `organization_id in (select organization_id from active memberships for auth.uid())` —
    any active org member (assignment dropdowns / filters need to read team names).
  - No INSERT/UPDATE/DELETE policies — writes go only through service-role server actions
    (`setMemberTeam`, `src/app/admin/users/actions.ts`), gated by the same
    `actorCanManageUsersInOrg` check as `memberships.manage_users` (developer default or an explicit
    `manage_users` delegation).
- `memberships.team_id`: no separate RLS — covered by the existing `memberships` SELECT/write policies
  above. Writes to this column go through `setMemberTeam`, which additionally validates the target
  team belongs to the same org as the membership before saving.

## 2026-07-13 User/Permission Model Rework

Full decision record: `docs/planning/01-decision-log.md` → 2026-07-13 ("사용자/권한 모델 개편"). Summary
of the RLS/permission-relevant pieces:

- **`senior_managing_director`(전무) = owner-equivalent.** Migrations `202607130002` (enum value) then
  `202607130003` (`has_org_role` redefinition — the only place this needed to change; every policy that
  gates on `'owner'` via `has_org_role` now also passes for an active 전무 membership, with zero
  per-policy edits). App-side helper `isOrgTopAdmin(role)` mirrors this in `src/config/roles.ts`.
- **`/admin/users` (+ actions + `/admin/users/invites`) access is developer-default +
  `manage_users`-delegation gated**, not role-gated. Migration `202607130001` adds
  `memberships.manage_users boolean default false`. `owner`/`office_admin` get **no automatic access**
  to the user-management screen without an explicit delegation; only `developer_super_admin` (platform
  role) can grant/revoke `manage_users` and cannot be locked out of its own developer status. The RLS
  Create/Update policies on `memberships` above are a backstop only — real enforcement is in
  `src/lib/user-management-access.ts` + service-role server actions.
- **Status model stays `invited`/`active`/`suspended`/`removed`(unchanged enum, no migration)**, but the
  user-facing UI now only exposes **활성(active) / 비활성(maps to `suspended`)**. Setting 비활성 now also
  bans the Supabase auth user (`ban_duration: "876000h"`), so it blocks login itself, not just
  org-scoped session access. Setting 활성 unbans.
- **Guard-railed hard delete (`deleteMember`, no migration):** blocked if the target has any
  `attendance_sessions` / `cleaning_sessions` / `annual_leave_requests` rows (`has_activity`) — must be
  deactivated instead. If no activity exists, deletes memberships → profile → the Supabase auth account.
  Self-delete is blocked server-side.
- **Permission-override enforcement (migration `202607130004`):** `has_permission_override(org, user,
  key)` is now actually wired into RLS for `order_processor` (`order_requests` UPDATE),
  `maintenance_status_change` (`maintenance_reports` UPDATE), and `property_room_manage` (new `for all`
  policies on `properties`/`rooms`, plus authenticated DML grants so RLS can allow an override-holder);
  `can_generate_report` is enforced in app code (`hasPermissionOverride()` in the mobile report action),
  not RLS. See `docs/product/27-permission-override-workflow.md`.
- **Migrations to apply for full effect:** `202607130001` (manage_users), `202607130002` +
  `202607130003` (전무, apply in that order), `202607130004` (override enforcement).
