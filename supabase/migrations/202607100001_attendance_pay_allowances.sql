-- Attendance additional allowances / 추가수당 (2026-07-10)
--
-- Busy-day / short-staffed-day extra pay applied to specific Tokyo operating dates WITHOUT touching the
-- contractual base rate in `hourly_rate_history`. This is an operational "추가수당" (attendance
-- allowance), NOT a bonus/incentive.
--
-- Two types:
--   daily_fixed  — fixed yen once per worker/date that has recognized paid work
--   hourly_extra — extra yen-per-hour multiplied by the date's recognized paid minutes
--
-- Target scope:
--   target_user_id IS NULL     → all hourly workers with recognized paid work on target_date
--   target_user_id IS NOT NULL → only that worker
--
-- Like the rest of the payroll surface, this table is READ-ONLY under RLS (own targeted rows or a
-- payroll admin). Every authoritative write goes through a service-role server action which also enforces
-- `isAttendancePayrollAdmin` and blocks changes to an already-finalized user-month (reopen required).

create table if not exists public.attendance_pay_allowances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_date date not null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  allowance_type text not null,
  amount_yen numeric not null,
  reason_type text not null,
  memo text,
  status text not null default 'active',
  created_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_by_user_id uuid references public.profiles(id),
  cancelled_at timestamptz,
  constraint attendance_pay_allowances_type_check
    check (allowance_type in ('daily_fixed', 'hourly_extra')),
  constraint attendance_pay_allowances_reason_check
    check (reason_type in ('staff_shortage', 'busy_day', 'urgent_shift', 'special_work', 'other')),
  constraint attendance_pay_allowances_status_check
    check (status in ('active', 'cancelled')),
  constraint attendance_pay_allowances_amount_positive
    check (amount_yen > 0)
);

create index if not exists idx_attendance_pay_allowances_org_date
  on public.attendance_pay_allowances(organization_id, target_date);
create index if not exists idx_attendance_pay_allowances_org_user_date
  on public.attendance_pay_allowances(organization_id, target_user_id, target_date);
create index if not exists idx_attendance_pay_allowances_org_status
  on public.attendance_pay_allowances(organization_id, status);

-- RLS — read-only self(targeted)/admin. NO write policies (service_role bypasses RLS and performs all
-- authoritative writes via the privileged server actions). Org-wide (target_user_id IS NULL) allowances
-- are surfaced to a worker only through the service-role monthly pay view, never a direct client read.
alter table public.attendance_pay_allowances enable row level security;

create policy "attendance_pay_allowances_self_or_admin_select"
  on public.attendance_pay_allowances
  for select
  to authenticated
  using (
    public.has_active_membership(organization_id)
    and (
      target_user_id = auth.uid()
      or public.can_manage_attendance_payroll(organization_id)
    )
  );

grant all on public.attendance_pay_allowances to service_role;

-- Finalized month snapshots must preserve the applied allowance detail so a closed user-month can be
-- explained without recomputing mutable allowance rows. Mirrors `rate_breakdown`.
alter table public.attendance_month_snapshots
  add column if not exists allowance_breakdown jsonb not null default '[]'::jsonb;
