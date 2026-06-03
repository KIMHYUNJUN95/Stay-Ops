create type public.cleaning_status as enum ('in_progress', 'completed', 'cancelled');

create table public.cleaning_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_user_id uuid not null references public.profiles(id) on delete restrict,
  room_label text not null,
  task_label text not null,
  status public.cleaning_status not null default 'in_progress',
  cleaning_date date not null default current_date,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(room_label)) > 0),
  check (char_length(trim(task_label)) > 0),
  check (duration_seconds is null or duration_seconds >= 0),
  check (
    (status = 'in_progress' and completed_at is null and duration_seconds is null)
    or (status in ('completed', 'cancelled') and completed_at is not null and duration_seconds is not null)
  )
);

create trigger cleaning_sessions_set_updated_at
before update on public.cleaning_sessions
for each row execute function public.set_updated_at();

create unique index cleaning_sessions_one_active_per_user_idx
on public.cleaning_sessions(staff_user_id)
where status = 'in_progress';

create index cleaning_sessions_org_date_status_idx
on public.cleaning_sessions(organization_id, cleaning_date desc, status);

create index cleaning_sessions_staff_date_idx
on public.cleaning_sessions(staff_user_id, cleaning_date desc);

alter table public.cleaning_sessions enable row level security;

create policy "members can read relevant cleaning sessions"
on public.cleaning_sessions
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or staff_user_id = auth.uid()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

create policy "field members can start own cleaning sessions"
on public.cleaning_sessions
for insert
with check (
  auth.uid() is not null
  and staff_user_id = auth.uid()
  and status = 'in_progress'
  and completed_at is null
  and duration_seconds is null
  and public.has_org_role(
    organization_id,
    array['field_manager', 'staff', 'part_time_staff']::public.organization_role[]
  )
);

create policy "staff can complete own active cleaning sessions"
on public.cleaning_sessions
for update
using (
  auth.uid() is not null
  and staff_user_id = auth.uid()
  and status = 'in_progress'
)
with check (
  auth.uid() is not null
  and staff_user_id = auth.uid()
  and status in ('completed', 'cancelled')
  and completed_at is not null
  and duration_seconds is not null
  and public.has_org_role(
    organization_id,
    array['field_manager', 'staff', 'part_time_staff']::public.organization_role[]
  )
);

grant select, insert, update on public.cleaning_sessions to authenticated;
grant all on public.cleaning_sessions to service_role;
