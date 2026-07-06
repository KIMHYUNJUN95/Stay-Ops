-- Annual leave — Phase 1 backend: hire_date + self-entered leave-balance baseline only.
-- Scope is intentionally narrow (confirmed 2026-07-06): the request-submission / approval /
-- document-generation workflow (docs/product/26-annual-leave-workflow.md) is still a planning draft
-- (approver identity, e-signature, document output all unresolved) and is explicitly OUT of scope
-- here. This migration only persists what src/lib/annual-leave.ts needs to compute a real balance:
-- the employee's hire date and their self-entered starting balance (see
-- src/lib/annual-leave-server.ts and src/app/mobile/attendance/leave/actions.ts).
--
-- Accrual policy (10/11/12/14/16/18/20d schedule, +4d bonus at 4y, 2y lapse) is computed in app code,
-- not stored — this table only stores the "as of baseline_date" starting point per user, matching the
-- design already implemented and tested in src/lib/annual-leave.ts / annual-leave.test.ts.

-- ── profiles.hire_date ─────────────────────────────────────────────────────────
-- Same pattern as birth_date (migration 202606180004): nullable, self-editable via account/onboarding
-- later. Salary-based regular employees only per confirmed policy — hourly staff
-- (employment_type_history) are excluded at the query/server-action layer, not here.
alter table public.profiles
  add column if not exists hire_date date;

-- ── annual_leave_baselines ─────────────────────────────────────────────────────
-- One row per user: the "유급 휴가"(base) and "특별휴가"(bonus, 4-year one-time) pools as of
-- baseline_date, matching the two-pool split in computeAnnualLeaveSummary(). Amounts allow .5
-- increments (half-day usage). unique (organization_id, user_id) — self-service upsert, one row.
create table if not exists public.annual_leave_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  base_amount numeric(5,1) not null default 0,
  bonus_amount numeric(5,1) not null default 0,
  baseline_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_leave_baselines_org_user_key unique (organization_id, user_id),
  constraint annual_leave_baselines_base_amount_nonneg check (base_amount >= 0),
  constraint annual_leave_baselines_bonus_amount_nonneg check (bonus_amount >= 0)
);

create trigger annual_leave_baselines_set_updated_at
before update on public.annual_leave_baselines
for each row execute function public.set_updated_at();

create index if not exists annual_leave_baselines_org_user
  on public.annual_leave_baselines(organization_id, user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — read-only self/admin policies, same shape as transport_reimbursement_reports
-- (202606260001): no write policies, all writes go through service-role server actions.
-- Default user reads OWN row; org owner / attendance_payroll_admin / platform admin reads org-wide.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.annual_leave_baselines enable row level security;

create policy "annual_leave_baselines_self_or_admin_select"
  on public.annual_leave_baselines
  for select to authenticated
  using (
    auth.uid() is not null
    and public.has_active_membership(organization_id)
    and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
  );

grant select, insert, update, delete on public.annual_leave_baselines to authenticated;
grant all on public.annual_leave_baselines to service_role;
