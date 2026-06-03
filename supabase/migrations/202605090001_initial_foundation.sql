create extension if not exists pgcrypto;

create type public.app_language as enum ('ko', 'ja', 'en');
create type public.theme_preference as enum ('system', 'light', 'dark');
create type public.organization_status as enum ('active', 'suspended', 'archived');
create type public.organization_role as enum (
  'owner',
  'office_admin',
  'cs_staff',
  'field_manager',
  'staff',
  'part_time_staff'
);
create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type public.platform_role as enum ('developer_super_admin');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  age integer check (age is null or age >= 0),
  phone_number text not null,
  profile_photo_url text,
  preferred_language public.app_language not null default 'ko',
  theme_preference public.theme_preference not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null,
  status public.membership_status not null default 'invited',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text unique not null,
  name text not null,
  default_role public.organization_role not null,
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  is_active boolean not null default true,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (used_count <= max_uses)
);

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.platform_role not null default 'developer_super_admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

create trigger invite_codes_set_updated_at
before update on public.invite_codes
for each row execute function public.set_updated_at();

create trigger platform_admins_set_updated_at
before update on public.platform_admins
for each row execute function public.set_updated_at();

create index memberships_user_id_idx on public.memberships(user_id);
create index memberships_organization_id_idx on public.memberships(organization_id);
create index invite_codes_organization_id_idx on public.invite_codes(organization_id);
create index platform_admins_user_id_idx on public.platform_admins(user_id);
create index audit_logs_organization_id_created_at_idx on public.audit_logs(organization_id, created_at desc);
create index audit_logs_actor_user_id_created_at_idx on public.audit_logs(actor_user_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invite_codes enable row level security;
alter table public.platform_admins enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active = true
  );
$$;

create or replace function public.has_active_membership(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

create policy "members can read own organization"
on public.organizations
for select
using (public.has_active_membership(id) or public.is_platform_admin());

create policy "platform admins can create organizations"
on public.organizations
for insert
with check (public.is_platform_admin());

create policy "owners can update organization"
on public.organizations
for update
using (
  public.has_org_role(id, array['owner']::public.organization_role[])
  or public.is_platform_admin()
)
with check (
  public.has_org_role(id, array['owner']::public.organization_role[])
  or public.is_platform_admin()
);

create policy "users can read own profile"
on public.profiles
for select
using (
  id = auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1
    from public.memberships own_membership
    join public.memberships other_membership
      on own_membership.organization_id = other_membership.organization_id
    where own_membership.user_id = auth.uid()
      and own_membership.status = 'active'
      and other_membership.user_id = profiles.id
      and other_membership.status = 'active'
  )
);

create policy "users can update own profile"
on public.profiles
for update
using (id = auth.uid() or public.is_platform_admin())
with check (id = auth.uid() or public.is_platform_admin());

create policy "members can read memberships in own organizations"
on public.memberships
for select
using (public.has_active_membership(organization_id) or public.is_platform_admin());

create policy "owner office admin can manage memberships"
on public.memberships
for all
using (
  public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);

create policy "owner office admin can manage invite codes"
on public.invite_codes
for all
using (
  public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);

create policy "platform admins can read platform admins"
on public.platform_admins
for select
using (public.is_platform_admin());

create policy "platform admins can manage platform admins"
on public.platform_admins
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "platform admins can read audit logs"
on public.audit_logs
for select
using (public.is_platform_admin());

create policy "service role writes audit logs"
on public.audit_logs
for insert
with check (false);
