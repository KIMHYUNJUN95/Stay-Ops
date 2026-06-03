create type public.order_request_status as enum (
  'requested',
  'approved',
  'ordered',
  'received',
  'closed'
);

create type public.order_request_urgency as enum (
  'normal',
  'high'
);

create table public.order_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reported_by_user_id uuid not null references public.profiles(id) on delete restrict,
  building_name text not null,
  room_label text not null default '-',
  title text not null,
  description text,
  reason text,
  urgency public.order_request_urgency not null default 'normal',
  status public.order_request_status not null default 'requested',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(title)) > 0),
  check (char_length(trim(building_name)) > 0),
  check (char_length(trim(room_label)) > 0),
  check (jsonb_typeof(items) = 'array')
);

create trigger order_requests_set_updated_at
before update on public.order_requests
for each row execute function public.set_updated_at();

create index order_requests_org_idx on public.order_requests(organization_id, created_at desc);
create index order_requests_reporter_idx on public.order_requests(reported_by_user_id, created_at desc);
create index order_requests_status_idx on public.order_requests(organization_id, status, created_at desc);

alter table public.order_requests enable row level security;

create policy "members can read organization order requests"
on public.order_requests
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "members can create order requests"
on public.order_requests
for insert
with check (
  auth.uid() is not null
  and reported_by_user_id = auth.uid()
  and public.has_active_membership(organization_id)
);

create policy "reporter or manager can update order requests"
on public.order_requests
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

create policy "reporter or manager can delete order requests"
on public.order_requests
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

grant select, insert, update, delete on public.order_requests to authenticated;
grant all on public.order_requests to service_role;
