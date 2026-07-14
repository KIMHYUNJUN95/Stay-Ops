-- Teams (현장/사무실 소속 구분) — 2026-07-14. See docs/planning/01-decision-log.md (org model
-- direction) and docs/product/01-user-roles.md.
--
-- The org stays the tenant boundary. Within one org, each member is assigned to a TEAM. Every team
-- has a `kind` (field 현장 / office 사무실) that is the top-level split the user asked for, and a `name`
-- so sub-teams can be added later (e.g. 현장-청소팀, 사무실-CS팀) without another migration. Phase 1
-- only seeds the two default teams per org; team CRUD (creating sub-teams) is a later phase.
--
-- Writes go through service-role server actions that do the same `developer OR manage_users OR top
-- admin` authorization as role/status changes (no write RLS, matching the manage_users/attendance
-- pattern). A select policy lets org members read their org's teams.

create type public.team_kind as enum ('field', 'office');

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind public.team_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teams_organization_id_idx on public.teams (organization_id);

alter table public.teams enable row level security;

-- Org members may read their own org's teams (assignment dropdowns, filters).
create policy "teams_select_org_members" on public.teams
  for select
  using (
    organization_id in (
      select m.organization_id
      from public.memberships m
      where m.user_id = auth.uid() and m.status = 'active'
    )
  );
-- No insert/update/delete policies: writes happen only via service-role server actions that enforce
-- the app-level authorization check (same pattern as memberships.manage_users / attendance).

comment on table public.teams is
  'Within-org team assignment. kind = field(현장)/office(사무실) is the top-level split; name allows '
  'sub-teams. Members link via memberships.team_id. See 2026-07-14 decision log.';

-- Membership → team link. on delete set null so deleting a team un-assigns its members (does not
-- delete the people).
alter table public.memberships
  add column if not exists team_id uuid references public.teams(id) on delete set null;

comment on column public.memberships.team_id is
  'The team (현장/사무실 소속) this membership belongs to. Assigned in /admin/users. Nullable = 미지정.';

-- Seed the two default teams per existing org.
insert into public.teams (organization_id, name, kind)
select o.id, '현장', 'field'::public.team_kind
from public.organizations o
where not exists (
  select 1 from public.teams t where t.organization_id = o.id and t.kind = 'field'
);

insert into public.teams (organization_id, name, kind)
select o.id, '사무실', 'office'::public.team_kind
from public.organizations o
where not exists (
  select 1 from public.teams t where t.organization_id = o.id and t.kind = 'office'
);

-- Backfill existing members onto the default team of the kind their role implies. Field roles
-- (field_manager/staff/part_time_staff) → 현장; everyone else → 사무실. Users can be re-assigned later.
update public.memberships m
set team_id = t.id
from public.teams t
where t.organization_id = m.organization_id
  and t.kind = (
    case
      when m.role in ('field_manager', 'staff', 'part_time_staff') then 'field'
      else 'office'
    end
  )::public.team_kind
  and m.team_id is null;
