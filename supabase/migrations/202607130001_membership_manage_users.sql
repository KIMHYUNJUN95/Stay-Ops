-- Phase 1 of the 2026-07-13 user/permission model rework (see docs/planning/01-decision-log.md).
--
-- Adds `memberships.manage_users`: a delegatable capability that lets a member access the
-- user-management screen (/admin/users) and its actions. This is how user management is unified onto
-- one screen while keeping it tightly held:
--   * By default only `developer_super_admin` can reach /admin/users.
--   * A developer may set this flag on specific members to delegate access.
--   * Re-delegation is developer-only: a delegate can USE the screen but the grant of `manage_users`
--     itself is gated to developers in the server action (NOT expressible in the DB, enforced in app).
--
-- No RLS is added here: /admin/users reads/writes all go through service-role server actions that
-- perform the `developer OR manage_users` authorization check in application code (same
-- service-role-write pattern as attendance/annual-leave/permission-overrides). The column default is
-- false so existing members are unaffected until a developer explicitly delegates.
alter table public.memberships
  add column if not exists manage_users boolean not null default false;

comment on column public.memberships.manage_users is
  'Delegatable access to the /admin/users user-management screen. Granted by developers only; '
  'delegates cannot re-delegate. See docs/product/27-permission-override-workflow.md and the 2026-07-13 '
  'decision log entry.';
