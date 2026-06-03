create type public.lost_item_status as enum (
  'registered',
  'stored',
  'disposal_scheduled',
  'disposed'
);

create table public.lost_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cleaning_session_id uuid references public.cleaning_sessions(id) on delete set null,
  reported_by_user_id uuid not null references public.profiles(id) on delete restrict,
  room_label text not null,
  item_name text not null,
  found_at timestamptz not null default now(),
  memo text,
  status public.lost_item_status not null default 'registered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(item_name)) > 0),
  check (char_length(trim(room_label)) > 0)
);

create trigger lost_items_set_updated_at
before update on public.lost_items
for each row execute function public.set_updated_at();

create index lost_items_org_idx on public.lost_items(organization_id, found_at desc);
create index lost_items_reporter_idx on public.lost_items(reported_by_user_id, found_at desc);
create index lost_items_cleaning_session_idx
  on public.lost_items(cleaning_session_id)
  where cleaning_session_id is not null;

alter table public.lost_items enable row level security;

create policy "members can read organization lost items"
on public.lost_items
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "members can create lost item reports"
on public.lost_items
for insert
with check (
  auth.uid() is not null
  and reported_by_user_id = auth.uid()
  and public.has_active_membership(organization_id)
);

create policy "reporter or manager can update lost items"
on public.lost_items
for update
using (
  auth.uid() is not null
  and (
    reported_by_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

create policy "reporter or manager can delete lost items"
on public.lost_items
for delete
using (
  auth.uid() is not null
  and (
    reported_by_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

grant select, insert, update, delete on public.lost_items to authenticated;
grant all on public.lost_items to service_role;
