-- Membership permission overrides — schema design only (feature UI/server actions NOT built yet).
-- Confirmed direction: docs/product/27-permission-override-workflow.md (2026-07-09).
--
-- Purpose: let `owner` / `developer_super_admin` grant ONE specific person a specific, named,
-- TIME-BOUND feature exception WITHOUT changing their role and WITHOUT a new migration each time.
-- This is additive to (not a replacement for) the existing role model + the three existing
-- per-feature flags (memberships.attendance_payroll_admin, memberships.leave_approver_role,
-- profiles.can_generate_report) — none of which this migration touches.
--
-- SCOPE OF THIS MIGRATION (schema only):
--   1. the `membership_permission_overrides` table + its own read-only RLS
--   2. a reusable SECURITY DEFINER helper `has_permission_override(org, user, key)`
-- The helper is created but DELIBERATELY NOT WIRED into any other table's RLS. Each feature adopts
-- it later by adding `OR public.has_permission_override(...)` next to its existing `has_org_role(...)`
-- check — that adoption is out of scope here and is done per-feature when a concrete need appears.
--
-- Write boundary mirrors the attendance/transport/annual-leave migrations: NO write policies. All
-- grant/revoke mutations go through controlled service-role server actions (service_role bypasses
-- RLS). The RLS below governs direct authenticated READS only.

-- ── membership_permission_overrides ─────────────────────────────────────────────
-- permission_key is intentionally a plain `text` with NO CHECK/enum: the whitelist is an OPEN
-- question (docs/product/27, "Open questions") and will be managed in application code
-- (src/config/roles.ts style) once a concrete first use case locks it down. Adding a DB-level
-- enum now would force a migration on every new key, defeating the whole point of a generic table.
--
-- expires_at is NOT NULL by design: no permanent/indefinite grants through this system (confirmed
-- policy). A grant that "should be permanent" is a signal to add a real per-feature flag or a role
-- change instead — not an override.
--
-- granted_by_user_id / revoked_by_user_id use `on delete set null` (same actor-reference convention
-- as reviewed_by_user_id / approved_by_user_id elsewhere): the audit row survives an actor's profile
-- deletion. The self-grant CHECK still guards inserts (server always sets granted_by_user_id, and a
-- null value is unknown → the constraint passes only when it does not equal user_id).
create table if not exists public.membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  granted_by_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- DB-level double defense against self-grant (server action also enforces this).
  constraint membership_permission_overrides_no_self_grant
    check (granted_by_user_id <> user_id)
);

-- Lookup index for has_permission_override(): the hot path filters on org + user + key among
-- not-yet-revoked rows. expires_at is compared at query time (now() is not immutable, so it cannot
-- live in a partial-index predicate); revoked_at is null narrows the partial index well.
create index if not exists membership_permission_overrides_active_lookup_idx
  on public.membership_permission_overrides (organization_id, user_id, permission_key)
  where revoked_at is null;

-- General org/user browse index for the (future) admin "권한 예외" card on /admin/users/[id].
create index if not exists membership_permission_overrides_org_user_idx
  on public.membership_permission_overrides (organization_id, user_id);

-- ── has_permission_override() helper ─────────────────────────────────────────────
-- Reusable active-grant check, same style/contract as has_org_role / is_platform_admin
-- (202605090001). Returns true iff an ACTIVE (not revoked, not expired) override row exists for the
-- given org/user/key. SECURITY DEFINER so it can be composed into other tables' RLS later without the
-- caller needing direct read access to this table.
-- NOT wired anywhere yet — this is a prepared building block for future per-feature adoption.
create or replace function public.has_permission_override(
  target_organization_id uuid,
  target_user_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.membership_permission_overrides o
    where o.organization_id = target_organization_id
      and o.user_id = target_user_id
      and o.permission_key = target_permission_key
      and o.revoked_at is null
      and o.expires_at > now()
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — read-only. Only owner / platform admin (developer_super_admin) may read overrides.
-- NO insert/update/delete policies → authenticated direct writes are denied; only service_role
-- (which bypasses RLS) performs grant/revoke through a future server action. A self-view policy
-- ("can a user see their own override?") is an open question in docs/product/27 and is intentionally
-- NOT added here to keep scope minimal.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.membership_permission_overrides enable row level security;

create policy "membership_permission_overrides_owner_admin_select"
  on public.membership_permission_overrides
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner']::public.organization_role[])
    or public.is_platform_admin()
  );

-- Grants. Authenticated write grants are harmless here: with no write policies, RLS denies direct
-- authenticated writes regardless. service_role bypasses RLS and performs all authoritative writes.
grant select, insert, update, delete on public.membership_permission_overrides to authenticated;
grant all on public.membership_permission_overrides to service_role;
