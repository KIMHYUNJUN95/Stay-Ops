create type public.reservation_status as enum (
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show'
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null default 'beds24',
  source_reservation_id text not null,
  property_name text not null,
  room_label text not null,
  guest_name text not null,
  check_in_date date not null,
  check_out_date date not null,
  status public.reservation_status not null default 'confirmed',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(source)) > 0),
  check (char_length(trim(source_reservation_id)) > 0),
  check (char_length(trim(property_name)) > 0),
  check (char_length(trim(room_label)) > 0),
  check (char_length(trim(guest_name)) > 0),
  check (check_out_date >= check_in_date),
  unique (organization_id, source, source_reservation_id)
);

create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create index reservations_org_checkin_idx
on public.reservations(organization_id, check_in_date, status);

create index reservations_org_checkout_idx
on public.reservations(organization_id, check_out_date, status);

create index reservations_org_room_stay_idx
on public.reservations(organization_id, room_label, check_in_date, check_out_date);

alter table public.reservations enable row level security;

create policy "members can read organization reservations"
on public.reservations
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage reservations"
on public.reservations
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.reservations to authenticated;
grant all on public.reservations to service_role;
