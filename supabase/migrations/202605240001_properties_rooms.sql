-- properties and rooms tables for room master management.
--
-- Beds24 active room filter rule (company internal rule — not a Beds24 standard):
--   external_minimum_stay >= 50 nights → inactive room ID for that period (excluded from room axis).
--   external_minimum_stay in 1/2/3 nights → active room ID for that period.
--   This threshold is enforced in application code via BEDS24_INACTIVE_MIN_STAY_THRESHOLD = 50.

create type public.property_type as enum (
  'standalone',
  'multi_room_building',
  'hotel',
  'apartment',
  'house'
);

create type public.property_status as enum (
  'active',
  'inactive',
  'under_construction',
  'archived'
);

create type public.room_status as enum (
  'active',
  'inactive',
  'under_construction'
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  display_name_ko text,
  display_name_ja text,
  display_name_en text,
  property_type public.property_type not null default 'standalone',
  status public.property_status not null default 'active',
  external_provider text,
  external_property_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) > 0)
);

create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

create index properties_org_status_idx on public.properties(organization_id, status);

alter table public.properties enable row level security;

create policy "members can read organization properties"
on public.properties for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage properties"
on public.properties for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.properties to authenticated;
grant all on public.properties to service_role;

-- rooms table.
-- room_label must be unique per organization because it is the cross-table join key
-- (used in reservations.room_label, cleaning_sessions.room_label, lost_items.room_label,
-- maintenance_reports.room_label).
-- external_minimum_stay stores the Beds24 minimum stay (nights) for the Beds24 active room filter rule.
-- Rooms where external_provider = 'beds24' and external_minimum_stay >= 50 are treated as inactive
-- and must be excluded from the room axis, empty-today counts, and operational room lists.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  room_label text not null,
  floor text,
  unit_type text,
  status public.room_status not null default 'active',
  external_provider text,
  external_room_id text,
  external_minimum_stay int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) > 0),
  check (char_length(trim(room_label)) > 0),
  check (external_minimum_stay is null or external_minimum_stay > 0),
  unique (organization_id, room_label)
);

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create index rooms_org_status_idx on public.rooms(organization_id, status);
create index rooms_org_label_idx on public.rooms(organization_id, room_label);
create index rooms_property_status_idx on public.rooms(property_id, status);

alter table public.rooms enable row level security;

create policy "members can read organization rooms"
on public.rooms for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage rooms"
on public.rooms for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.rooms to authenticated;
grant all on public.rooms to service_role;
