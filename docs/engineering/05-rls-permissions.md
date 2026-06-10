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

## Role Groups

## Platform

```txt
developer_super_admin
```

## Organization Roles

```txt
owner
office_admin
cs_staff
field_manager
staff
part_time_staff
```

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

- Platform admins only during MVP.

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

All tables below follow the standard org-isolation base: a row is accessible only when the user has an active membership in `row.organization_id`, with platform-admin bypass. Not implemented yet. Full detail in `docs/engineering/08`–`12`.

## linen_items

- Read: all active org members.
- Create / update / delete: admin-capable roles (owner, office_admin, cs_staff, field_manager, developer_super_admin) — manage the item master.

## linen_defect_reports

- Read: all active org members.
- Create: all active org members.
- Update / delete: author-only, plus admin-capable roles. (Final correction policy confirmed before build — see `08`.)

## tasks

- Read: `owner_user_id = auth.uid()` OR `assigned_to_user_id = auth.uid()` OR (non-private and shared). Part-time staff additionally see tasks linked to rooms/properties they can access.
- Create: any active org member (owner defaults to self).
- Update / delete: owner; assignee may update status + comment.
- Office-level oversight (broad operational task visibility) requires an explicit additional policy if the product confirms it.

## task_transfers

- Read: sender or recipient only.
- Create: sender (must own the source task).

## board_posts

- Read: all active org members.
- Create: **all active roles including part_time_staff** (confirmed 2026-06-09).
- Update / delete: author own posts; admin-capable roles moderate all (pin, archive, delete).

## staff_suggestions

- Read: author always; `public_team` rows readable by all active members; `employee_only` rows readable by author plus owner/office_admin/cs_staff/field_manager/staff/developer_super_admin (**not** other part_time_staff); platform-admin bypass.
- Create: any active org member.
- Update status + response_note: authorized management roles (owner, office_admin, cs_staff). Author may edit own row before review if that rule is accepted.
- This needs stricter role-aware RLS than the Board — see `12`.

## Attendance tables (attendance_sites / attendance_qr_tokens / attendance_events / employment_profiles / hourly_rate_history)

- attendance_events read/insert: worker reads/inserts own events; admin roles (owner, office_admin, cs_staff; possibly field_manager for review) read org-wide.
- attendance_sites / attendance_qr_tokens: admin roles manage; workers read active sites/tokens for clock-in.
- employment_profiles / hourly_rate_history: admin roles manage; worker may read own. Wage figures must not leak to part-time staff beyond their own (price/revenue visibility rule).
- Payroll tables remain design-only until wage rules are defined — no RLS finalized yet. See `11`.

## audit_logs

Read:

- Platform admins.
- Owner/Office Admin later if an admin audit UI is added.

Create:

- Server functions/system only.

Update/delete:

- No normal user updates/deletes.

## Open Questions

- Should Staff be allowed to status-change lost items and maintenance forever, or only certain statuses?
- Should CS Staff be allowed to export cleaning records by default?
- Should Field Manager be able to delete other users' records?
- Should hard delete be blocked if a record has attachments?
- Should some actions require server functions instead of direct table updates?
