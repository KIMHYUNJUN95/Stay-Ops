create type public.maintenance_status as enum (
  'open',
  'in_progress',
  'resolved',
  'closed'
);

create table public.maintenance_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cleaning_session_id uuid references public.cleaning_sessions(id) on delete set null,
  reported_by_user_id uuid not null references public.profiles(id) on delete restrict,
  room_label text not null,
  issue_title text not null,
  description text,
  status public.maintenance_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(issue_title)) > 0),
  check (char_length(trim(room_label)) > 0)
);

create trigger maintenance_reports_set_updated_at
before update on public.maintenance_reports
for each row execute function public.set_updated_at();

create index maintenance_reports_org_idx on public.maintenance_reports(organization_id, created_at desc);
create index maintenance_reports_reporter_idx on public.maintenance_reports(reported_by_user_id, created_at desc);
create index maintenance_reports_cleaning_session_idx
  on public.maintenance_reports(cleaning_session_id)
  where cleaning_session_id is not null;

alter table public.maintenance_reports enable row level security;

create policy "members can read organization maintenance reports"
on public.maintenance_reports
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "members can create maintenance reports"
on public.maintenance_reports
for insert
with check (
  auth.uid() is not null
  and reported_by_user_id = auth.uid()
  and public.has_active_membership(organization_id)
);

create policy "reporter or manager can update maintenance reports"
on public.maintenance_reports
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

create policy "reporter or manager can delete maintenance reports"
on public.maintenance_reports
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

grant select, insert, update, delete on public.maintenance_reports to authenticated;
grant all on public.maintenance_reports to service_role;
