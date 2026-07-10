-- Reservation calendar follow-up:
-- 1. Persist admin-only internal notes per reservation.
-- 2. Store optional reservation linkage on maintenance / lost-found records created from the calendar.

alter table public.maintenance_reports
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists guest_name text;

create index if not exists maintenance_reports_reservation_idx
  on public.maintenance_reports (organization_id, reservation_id)
  where reservation_id is not null;

alter table public.lost_items
  add column if not exists property_name text,
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists guest_name text;

create index if not exists lost_items_reservation_idx
  on public.lost_items (organization_id, reservation_id)
  where reservation_id is not null;

create table if not exists public.reservation_internal_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
  note text not null check (char_length(trim(note)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reservation_id)
);

create index if not exists reservation_internal_notes_org_idx
  on public.reservation_internal_notes (organization_id, updated_at desc);

create index if not exists reservation_internal_notes_reservation_idx
  on public.reservation_internal_notes (reservation_id);

drop trigger if exists reservation_internal_notes_set_updated_at on public.reservation_internal_notes;
create trigger reservation_internal_notes_set_updated_at
before update on public.reservation_internal_notes
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.reservation_internal_notes to authenticated;
grant all on public.reservation_internal_notes to service_role;

alter table public.reservation_internal_notes enable row level security;

create policy "admin members can read reservation internal notes"
on public.reservation_internal_notes
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

create policy "admin members can insert reservation internal notes"
on public.reservation_internal_notes
for insert
with check (
  auth.uid() is not null
  and updated_by_user_id = auth.uid()
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

create policy "admin members can update reservation internal notes"
on public.reservation_internal_notes
for update
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
)
with check (
  auth.uid() is not null
  and updated_by_user_id = auth.uid()
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

create policy "admin members can delete reservation internal notes"
on public.reservation_internal_notes
for delete
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);
