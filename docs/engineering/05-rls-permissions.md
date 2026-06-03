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
