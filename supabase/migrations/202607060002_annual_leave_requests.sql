-- Annual leave — Phase 2 backend, stage 1: request submission only (no approval action yet).
-- Confirmed 2026-07-06 policy (docs/product/26-annual-leave-workflow.md):
--   - approver = any member with memberships.leave_approver_role set (department_head = 대표/CEO,
--     senior_managing_director = 전무/VP-equivalent) — either one approving completes the request
--   - attachments are optional
--   - e-signature is an approval "stamp" (button click, name+timestamp recorded), not a drawn signature
--   - document output replicates the paper form photo (본인/부서장/전무 stamp boxes) — stage 3, not here
-- This migration only adds the schema; the approve/reject action + approval queue UI are stage 2.

-- ── memberships.leave_approver_role ────────────────────────────────────────────
-- Same shape as attendance_payroll_admin (a per-membership override, not a broad role), but a text
-- enum instead of boolean because the printed document needs to know WHICH stamp box (부서장 vs 전무)
-- an approval fills in.
alter table public.memberships
  add column if not exists leave_approver_role text
    constraint memberships_leave_approver_role_check
    check (leave_approver_role in ('department_head', 'senior_managing_director'));

create or replace function public.is_leave_approver(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.organization_id = target_organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.leave_approver_role is not null
    );
$$;

-- ── annual_leave_requests ──────────────────────────────────────────────────────
-- applicant_name is a snapshot at submit time (survives later profile name changes), matching the
-- printed document's 본人(applicant) field. duration_unit/days_count mirror the mobile form
-- (leave-form.tsx): full/am/pm, days_count allows .5 for half-day.
create table if not exists public.annual_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  applicant_name text not null,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  duration_unit text not null default 'full',
  days_count numeric(4,1) not null,
  reason text not null,
  emergency_contact text not null,
  image_urls text[] not null default '{}',
  status text not null default 'requested',
  submitted_at timestamptz,
  approved_by_user_id uuid references public.profiles(id) on delete set null,
  approved_role text,
  approved_at timestamptz,
  rejected_by_user_id uuid references public.profiles(id) on delete set null,
  rejected_reason text,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_leave_requests_leave_type_check
    check (leave_type in ('annual', 'paid', 'special', 'other')),
  constraint annual_leave_requests_duration_unit_check
    check (duration_unit in ('full', 'am', 'pm')),
  constraint annual_leave_requests_status_check
    check (status in ('draft', 'requested', 'approved', 'rejected', 'cancelled')),
  constraint annual_leave_requests_approved_role_check
    check (approved_role in ('department_head', 'senior_managing_director')),
  constraint annual_leave_requests_days_count_positive check (days_count > 0),
  constraint annual_leave_requests_date_order check (end_date >= start_date),
  constraint annual_leave_requests_image_urls_max
    check (coalesce(array_length(image_urls, 1), 0) <= 5)
);

create trigger annual_leave_requests_set_updated_at
before update on public.annual_leave_requests
for each row execute function public.set_updated_at();

create index if not exists annual_leave_requests_org_user_created
  on public.annual_leave_requests(organization_id, user_id, created_at desc);
create index if not exists annual_leave_requests_org_status_created
  on public.annual_leave_requests(organization_id, status, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — read-only self/approver/admin policies, same shape as annual_leave_baselines
-- (202607060001): no write policies, all writes go through service-role server actions.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.annual_leave_requests enable row level security;

create policy "annual_leave_requests_self_or_approver_select"
  on public.annual_leave_requests
  for select to authenticated
  using (
    auth.uid() is not null
    and public.has_active_membership(organization_id)
    and (user_id = auth.uid() or public.is_leave_approver(organization_id))
  );

grant select, insert, update, delete on public.annual_leave_requests to authenticated;
grant all on public.annual_leave_requests to service_role;

-- Storage: optional evidence images reuse the shared request-images bucket, matching the existing
-- attendance-corrections / transport-reimbursements path convention.
--   {org_id}/annual-leave-requests/{request_id}/{filename}
create policy "org members can upload annual leave request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) = 'annual-leave-requests'
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(split_part(name, '/', 4)) between 3 and 160
    and split_part(name, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  );

create policy "org members can delete annual leave request images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) = 'annual-leave-requests'
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  );
