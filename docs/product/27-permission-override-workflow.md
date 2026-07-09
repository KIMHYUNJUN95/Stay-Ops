# Permission Override / 사용자별 권한 예외 부여

Status: **schema designed and applied to the remote database — feature not implemented.** The schema
is committed as migration `supabase/migrations/202607090002_membership_permission_overrides.sql`
(table `membership_permission_overrides` + read-only owner/platform-admin RLS + the reusable
`has_permission_override(org, user, key)` helper, which is created but **not yet wired into any other
table's policy**) and has been **applied to the live Supabase project** (2026-07-09; confirmed via
`list_migrations`, no new security-advisor findings beyond the same `SECURITY DEFINER`/RPC-exposure
warning every other role-check helper in this project already carries). UI design for the feature is
not finished yet, so the feature itself — the `/admin/users/[id]` "권한 예외" card, the grant/revoke
service-role server actions, and the application-level `permission_key` whitelist — is **still NOT
implemented**. Implementation resumes once the UI/UX design is ready. The rest of this document
remains the design direction agreed on 2026-07-09.

## Problem

StayOps' role model (`docs/product/01-user-roles.md`, `docs/engineering/05-rls-permissions.md`) is a
fixed six-role org model (`owner / office_admin / cs_staff / field_manager / staff /
part_time_staff`) plus a handful of **per-feature membership flags** that already exist
(`attendance_payroll_admin`, `leave_approver_role`, `profiles.can_generate_report`). Sometimes an
owner/developer needs to grant one specific person access to one specific feature **without**
promoting their role or adding a brand-new dedicated column for a one-off need.

## Explicitly NOT in scope — this already works today

**Permanent role/employment changes are a different problem and already have a solution.** A
part-time worker becoming a regular employee, or any role promotion/demotion, is a normal
`memberships.role` change — already implemented at `/admin/users/[id]` (`updateMemberRole` server
action, `src/app/admin/users/actions.ts`). That flow already has its own permission tiering
(`owner`/`developer_super_admin` can assign any of the 6 roles; `office_admin` can assign anything
except `owner`/`office_admin`; nobody can promote themselves) and needs no changes. This document is
only about the narrower case: **role stays the same, but one person gets a specific feature-level
exception.**

The three existing per-feature flags (`attendance_payroll_admin`, `leave_approver_role`,
`can_generate_report`) also stay exactly as they are. This system is additive for *future* exception
needs, not a migration/replacement of what already works.

## Goal

Let `owner` or `developer_super_admin` grant a specific, named, **time-bound** exception to a
specific user for a specific feature — without changing their role and without a new DB migration
every time a new exception need comes up.

## Confirmed design direction

- **One generic table, not one column per feature.** A `membership_permission_overrides`-style table
  (org, user, `permission_key`, granted_by, reason, `expires_at`, revoked_at) so new exception types
  don't require a schema migration — only a new entry in a whitelisted `permission_key` enum/list.
- **`permission_key` is a closed whitelist**, defined in application code (mirrors
  `src/config/roles.ts`), never a free-text string. It can never contain `"role"` itself — this system
  cannot be used to reassign `owner`/`office_admin`/etc.; that stays exclusively on the existing
  role-change flow.
- **Time-bound by default.** Every grant requires an `expires_at`. No permanent/indefinite grants
  through this system — if something needs to be permanent, that's a signal it should become a real
  per-feature flag (like the existing three) or a role change, not an override.
- **Requester ≠ approver**, at minimum: the person who requests/needs the exception cannot also be the
  one who grants it to themselves. Self-grant is blocked the same way self role-promotion is blocked
  today.
- **Mandatory reason + audit log** on every grant and revoke, following the same pattern already used
  for manual attendance-session edits (`attendance_session_audits`) and account-linking-sensitive
  actions — write to `audit_logs`.
- **Who can grant**: `owner` and `developer_super_admin` only (matches the "개발자, 최고관리자" scope
  given in conversation). `office_admin` cannot grant overrides, unlike role changes where it has
  partial authority.
- **Adoption is a two-layer change, not just RLS (corrected 2026-07-09).** A lot of StayOps'
  real authorization logic lives in **TypeScript, not pure RLS** — e.g. `ORDER_PROCESSOR_ROLES`
  (`src/app/mobile/requests/orders/actions.ts`), `canGenerateDailyReport()` /
  `canAssignRole()` / `canAccessAdminWeb()` (`src/config/roles.ts`,
  `src/app/admin/users/actions.ts`), `isAttendancePayrollAdmin()`
  (`src/lib/attendance-review.ts`). Several of these are *stricter* than the matching RLS policy on
  purpose (e.g. `field_manager` can edit order-request content via RLS but is blocked from changing
  status by the server action alone). So adopting this system for a given feature means **both**:
  1. RLS: add `OR public.has_permission_override(org, user, 'key')` next to the existing
     `has_org_role(...)` check (if that feature's RLS is the actual gate), **and**
  2. Server action / `canX()` helper: add the equivalent override check there too (querying
     `has_permission_override` via the service client), wherever the real enforcement is TS code, not
     SQL. Skipping this step is the most likely way a future override silently does nothing.

## Explicitly deferred (not MVP)

- Break-glass / emergency self-service elevation — not needed at StayOps' current scale.
- Periodic access recertification (quarterly review nagging admins to re-confirm active grants) — a
  reasonable v2 addition once there are enough live grants for it to matter.
- A general-purpose policy engine (Zanzibar/OPA-style) — overkill for this org/table count.

## UI/UX — entry flow (confirmed 2026-07-09)

**No new sidebar item.** This is a low-frequency, narrowly-scoped admin action restricted to
owner/developer — it does not warrant a first-class nav entry per the admin dashboard shared-design
contract (`docs/product/05-admin-web-ia.md`), which favors extending an existing pattern over adding
one-off top-level areas. Confirmed: this hangs off the existing **사용자 (Users)** admin feature, not
a new feature area — sidebar "사용자" → `/admin/users` list → `/admin/users/[id]` detail, same page
that already handles role/status changes.

- **Primary entry: `/admin/users/[id]`.** Add a new card ("권한 예외" / 권한 override) directly below
  the existing "Role & status management" card on the same page — same page, same mental model
  ("manage this one person"), consistent with how role changes already live there. Visible only to
  `owner`/`developer_super_admin`; other viewers of the page (e.g. `office_admin`, who can already
  reach this page to manage roles) don't see this card at all, since they can't act on it.
  - Card shows: any currently-active overrides for this user (permission key, granted by, expires at,
    reason) + a "grant new exception" action (select permission_key from the whitelist, set an
    expiry, enter a reason) + a revoke action per active row.
- **Secondary/audit surface (phase 2, not MVP): `/admin/settings`.** The existing settings area
  already has sub-pages per concern (`settings/attendance`, `settings/invite-codes`,
  `settings/organization`). A future `settings/permissions` sub-page could show an org-wide list of
  all active + past overrides for accountability review, mirroring the existing sub-page pattern. Not
  required to ship the MVP grant/revoke flow on the user detail page.

## Open questions

- Exact initial `permission_key` whitelist — needs a concrete first use case before locking the enum
  down (an empty/speculative list isn't useful).
- Should an override notify the affected user (in-app notification) when granted/revoked, the way
  other admin actions do? Not decided.
- Should expired-but-unrevoked grants show up anywhere (e.g. a "recently expired" list) or just
  silently stop applying? Leaning toward: RLS/helper just checks `expires_at > now()`, expired rows
  are inert but not deleted (audit trail), no special UI needed for MVP.
