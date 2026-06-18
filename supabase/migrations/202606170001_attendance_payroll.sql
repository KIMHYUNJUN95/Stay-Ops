-- Attendance / Clock-In-Out / Payroll — schema + permission foundation (Step 1, schema-first).
-- See docs/product/21-attendance-payroll-workflow.md and
-- docs/engineering/11-attendance-payroll-technical-design.md (policy baseline confirmed 2026-06-17).
--
-- Model: session-first attendance (NOT loose event rows). One work session per clock-in/clock-out;
-- breaks, attempt logs, correction requests, and audits hang off a stable session identity. Hourly
-- gross-pay (principal only) is computed from closed/resolved sessions and snapshotted per person per
-- month. Wi-Fi attendance (`gps_wifi`) is MODELED here but stays inactive in the PWA (UI shows 준비중);
-- the active method for this release is `gps_qr`.
--
-- Write boundary: this migration adds NO server actions. All authoritative attendance/payroll
-- mutations go through controlled service-role server actions in later steps. RLS below governs direct
-- authenticated READS only — there are no write policies, so direct authenticated writes are denied
-- (service_role bypasses RLS). Auditability is preserved over cleverness: records are never hard
-- deleted by users; corrections/invalidations/finalizations leave an audit trail.

-- ── Permission foundation ─────────────────────────────────────────────────────
-- Org-scoped attendance/payroll privilege, separate from the broad role names. The product rule is
-- "owner + explicitly designated users", so this is an explicit per-membership flag (default false).
alter table public.memberships
  add column if not exists attendance_payroll_admin boolean not null default false;

-- Helper: may this user manage org-wide attendance/payroll (review, manual sessions, rates,
-- finalization, dashboard, export)? = platform admin, OR an active member who is the org `owner` or
-- carries the explicit `attendance_payroll_admin` flag. Site master / QR issuance stays OWNER-only and
-- is enforced in application logic (see has_org_role(org, ['owner'])), not broadened here.
create or replace function public.can_manage_attendance_payroll(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.role = 'owner' or m.attendance_payroll_admin = true)
  );
$$;

-- ── attendance_sites ──────────────────────────────────────────────────────────
-- Registered sites are required for every attendance action (no free-text locations). Owner-only
-- maintenance (enforced in app logic). Wi-Fi SSIDs are modeled now even though PWA activation is
-- deferred. GPS reference point + allowed radius (default 100m, per-site override).
create table public.attendance_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  property_id uuid references public.properties(id) on delete set null,
  latitude numeric not null,
  longitude numeric not null,
  allowed_radius_meters integer not null default 100,
  wifi_ssids text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) > 0),
  check (allowed_radius_meters > 0),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180)
);

create trigger attendance_sites_set_updated_at
before update on public.attendance_sites
for each row execute function public.set_updated_at();

create index attendance_sites_org_idx
  on public.attendance_sites(organization_id, is_active, created_at desc);

-- ── attendance_qr_tokens ──────────────────────────────────────────────────────
-- One active QR token per site at a time (printed + fixed on-site). Reissue deactivates the previous
-- token; `replaced_by_token_id` links the chain. The active-token-per-site guarantee is a partial
-- unique index.
create table public.attendance_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.attendance_sites(id) on delete cascade,
  token text not null unique,
  is_active boolean not null default true,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  replaced_by_token_id uuid references public.attendance_qr_tokens(id) on delete set null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- At most one active token per site.
create unique index attendance_qr_tokens_one_active_per_site_idx
  on public.attendance_qr_tokens(site_id)
  where is_active;
create index attendance_qr_tokens_org_idx
  on public.attendance_qr_tokens(organization_id, site_id);

-- ── attendance_sessions ───────────────────────────────────────────────────────
-- The core work session. clock-in and clock-out sites may differ; both are stored. operating_date is
-- the Tokyo date derived from clock-in. Midnight-crossing sessions are abnormal → review_required.
-- A user may have only one OPEN session at a time (partial unique index below).
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  operating_date date not null,
  status text not null default 'open',
  review_state text not null default 'normal',

  clock_in_at timestamptz,
  clock_in_site_id uuid references public.attendance_sites(id) on delete restrict,
  clock_in_method text,
  clock_in_qr_token_id uuid references public.attendance_qr_tokens(id) on delete set null,
  clock_in_latitude numeric,
  clock_in_longitude numeric,
  clock_in_accuracy_meters numeric,
  clock_in_device_info jsonb not null default '{}',

  clock_out_at timestamptz,
  clock_out_site_id uuid references public.attendance_sites(id) on delete restrict,
  clock_out_method text,
  clock_out_qr_token_id uuid references public.attendance_qr_tokens(id) on delete set null,
  clock_out_latitude numeric,
  clock_out_longitude numeric,
  clock_out_accuracy_meters numeric,
  clock_out_device_info jsonb not null default '{}',

  manual_created boolean not null default false,
  manual_created_by_user_id uuid references public.profiles(id) on delete set null,
  manual_created_reason text,

  invalidated_at timestamptz,
  invalidated_by_user_id uuid references public.profiles(id) on delete set null,
  invalidated_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (status in ('open', 'completed', 'reopened', 'invalid')),
  check (review_state in ('normal', 'review_required', 'pending_correction', 'approved_correction', 'rejected_correction')),
  check (clock_in_method is null or clock_in_method in ('gps_qr', 'gps_wifi', 'manual')),
  check (clock_out_method is null or clock_out_method in ('gps_qr', 'gps_wifi', 'manual'))
);

create trigger attendance_sessions_set_updated_at
before update on public.attendance_sessions
for each row execute function public.set_updated_at();

-- One open session per user at a time (the product's hard guarantee).
create unique index attendance_sessions_one_open_per_user_idx
  on public.attendance_sessions(user_id)
  where status = 'open';
-- Own history (Tokyo date), admin review queue, status/date filtering.
create index attendance_sessions_user_date_idx
  on public.attendance_sessions(organization_id, user_id, operating_date desc);
create index attendance_sessions_review_idx
  on public.attendance_sessions(organization_id, review_state, operating_date desc);
create index attendance_sessions_status_idx
  on public.attendance_sessions(organization_id, status, operating_date desc);
create index attendance_sessions_org_date_idx
  on public.attendance_sessions(organization_id, operating_date desc);

-- ── attendance_breaks ─────────────────────────────────────────────────────────
-- Multiple breaks per session allowed. Clock-out must be blocked while any break is open (cross-row
-- rule → enforced in the server action, not a column CHECK). Only recorded break time is unpaid.
create table public.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create trigger attendance_breaks_set_updated_at
before update on public.attendance_breaks
for each row execute function public.set_updated_at();

create index attendance_breaks_session_idx
  on public.attendance_breaks(session_id, started_at);
-- Fast "is there an open break?" lookups.
create index attendance_breaks_open_idx
  on public.attendance_breaks(session_id)
  where ended_at is null;

-- ── attendance_attempt_logs ───────────────────────────────────────────────────
-- Every attendance attempt (success or failure), for admin diagnostics. Admin-visible only; does NOT
-- affect payroll. Failure reasons cover GPS/QR/Wi-Fi/break/midnight/open-session cases.
create table public.attendance_attempt_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  action_type text not null,
  resolved_site_id uuid references public.attendance_sites(id) on delete set null,
  method text not null,
  success boolean not null,
  failure_reason text,
  latitude numeric,
  longitude numeric,
  accuracy_meters numeric,
  device_info jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (action_type in ('clock_in', 'clock_out', 'break_start', 'break_end')),
  check (method in ('gps_qr', 'gps_wifi', 'manual')),
  check (failure_reason is null or failure_reason in (
    'gps_denied', 'gps_unavailable', 'outside_radius', 'qr_invalid', 'qr_scan_failed',
    'wifi_not_supported', 'wifi_not_matched', 'open_break_blocks_clock_out', 'midnight_crossing',
    'open_session_exists'
  ))
);

create index attendance_attempt_logs_user_idx
  on public.attendance_attempt_logs(organization_id, user_id, attempted_at desc);
create index attendance_attempt_logs_org_idx
  on public.attendance_attempt_logs(organization_id, attempted_at desc);

-- ── attendance_correction_requests ────────────────────────────────────────────
-- A user requests a correction for their own record; an admin confirms FINAL values (never blind
-- auto-apply). Photos optional, max 5. Reject comment required / approve comment optional (enforced in
-- the server action). Requestable window (current + previous month) is enforced server-side.
create table public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  requested_by_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'requested',
  reason_type text not null,
  memo text,
  desired_clock_in_at timestamptz,
  desired_clock_out_at timestamptz,
  desired_clock_in_site_id uuid references public.attendance_sites(id) on delete set null,
  desired_clock_out_site_id uuid references public.attendance_sites(id) on delete set null,
  image_urls text[] not null default '{}',
  review_comment text,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('requested', 'in_review', 'approved', 'rejected')),
  check (reason_type in ('missing_clock_in', 'missing_clock_out', 'wrong_time', 'wrong_site', 'auth_failed', 'other')),
  check (coalesce(array_length(image_urls, 1), 0) <= 5)
);

create trigger attendance_correction_requests_set_updated_at
before update on public.attendance_correction_requests
for each row execute function public.set_updated_at();

create index attendance_correction_requests_queue_idx
  on public.attendance_correction_requests(organization_id, status, created_at desc);
create index attendance_correction_requests_user_idx
  on public.attendance_correction_requests(requested_by_user_id, created_at desc);
create index attendance_correction_requests_session_idx
  on public.attendance_correction_requests(session_id);

-- ── attendance_session_audits ─────────────────────────────────────────────────
-- Append-only audit trail for manager-side actions on a session. Mandatory reason; before/after JSON.
create table public.attendance_session_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null,
  reason text not null,
  before_json jsonb not null default '{}',
  after_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (action_type in ('manual_create', 'manual_update', 'invalidate', 'correction_apply', 'reopen', 'finalize')),
  check (char_length(trim(reason)) > 0)
);

create index attendance_session_audits_session_idx
  on public.attendance_session_audits(session_id, created_at desc);
create index attendance_session_audits_org_idx
  on public.attendance_session_audits(organization_id, created_at desc);

-- ── employment_type_history ───────────────────────────────────────────────────
-- Employment type is stored per person (not inferred only from role), with effective dates. The past
-- is never reinterpreted; a change applies from its effective date (whole Tokyo operating day).
create table public.employment_type_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  employment_type text not null,
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (employment_type in ('hourly', 'salaried')),
  check (effective_to is null or effective_to >= effective_from)
);

create index employment_type_history_user_idx
  on public.employment_type_history(organization_id, user_id, effective_from desc);

-- ── hourly_rate_history ───────────────────────────────────────────────────────
-- Per-person hourly rate with effective dates. The past never changes; a rate change applies from its
-- effective date (whole operating day). Final monthly gross is rounded to nearest 10 yen at calc time.
create table public.hourly_rate_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  hourly_rate numeric not null,
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (hourly_rate >= 0),
  check (effective_to is null or effective_to >= effective_from)
);

create index hourly_rate_history_user_idx
  on public.hourly_rate_history(organization_id, user_id, effective_from desc);

-- ── attendance_month_snapshots ────────────────────────────────────────────────
-- Per-person per-month payroll snapshot. Finalization is manual (owner / attendance_payroll_admin).
-- Reopening preserves the prior finalized snapshot as superseded history and creates a new one on
-- re-finalization. `target_month` stores the 1st of the Tokyo month. "Exactly one current row per
-- user-month" is a server-enforced invariant (multiple historical rows are intentional).
create table public.attendance_month_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  target_month date not null,
  status text not null default 'draft',
  total_paid_minutes integer not null default 0,
  gross_amount numeric not null default 0,
  rate_breakdown jsonb not null default '[]',
  finalized_by_user_id uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  supersedes_snapshot_id uuid references public.attendance_month_snapshots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'finalized', 'superseded', 'reopened')),
  check (total_paid_minutes >= 0),
  check (gross_amount >= 0)
);

create trigger attendance_month_snapshots_set_updated_at
before update on public.attendance_month_snapshots
for each row execute function public.set_updated_at();

create index attendance_month_snapshots_user_idx
  on public.attendance_month_snapshots(organization_id, user_id, target_month desc);
create index attendance_month_snapshots_month_idx
  on public.attendance_month_snapshots(organization_id, target_month, status);

-- ── attendance_export_logs ────────────────────────────────────────────────────
-- Export audit trail: who exported, when, which month, which finalized snapshot version set. Exports
-- include FINALIZED data only (enforced server-side); this table records the activity.
create table public.attendance_export_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_month date not null,
  export_scope text not null,
  user_id uuid references public.profiles(id) on delete set null,
  snapshot_ids uuid[] not null default '{}',
  exported_by_user_id uuid not null references public.profiles(id) on delete restrict,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (export_scope in ('monthly_bulk', 'single_user'))
);

create index attendance_export_logs_org_idx
  on public.attendance_export_logs(organization_id, target_month, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — read-only participant/admin policies. NO write policies (all writes go through service-role
-- server actions in later steps). Default user = read OWN rows; privileged admin = read org-wide.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.attendance_sites enable row level security;
alter table public.attendance_qr_tokens enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_breaks enable row level security;
alter table public.attendance_attempt_logs enable row level security;
alter table public.attendance_correction_requests enable row level security;
alter table public.attendance_session_audits enable row level security;
alter table public.employment_type_history enable row level security;
alter table public.hourly_rate_history enable row level security;
alter table public.attendance_month_snapshots enable row level security;
alter table public.attendance_export_logs enable row level security;

-- Sites: any active member may read (the clock UI needs site name/coords/radius). Coordinates are not
-- secret; QR tokens (below) are the sensitive part.
create policy "members can read attendance sites"
on public.attendance_sites
for select
using (auth.uid() is not null and (public.is_platform_admin() or public.has_active_membership(organization_id)));

-- QR tokens are sensitive (they authorize attendance) → privileged admins only. Clock-in resolves the
-- token server-side via the service-role client.
create policy "attendance admins can read qr tokens"
on public.attendance_qr_tokens
for select
using (auth.uid() is not null and public.can_manage_attendance_payroll(organization_id));

-- Sessions: own rows, or org-wide for privileged admins (review queue / dashboard).
create policy "users read own attendance sessions"
on public.attendance_sessions
for select
using (
  auth.uid() is not null
  and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
);

-- Breaks: visible to the session owner or a privileged admin (resolve ownership via the parent).
create policy "users read own attendance breaks"
on public.attendance_breaks
for select
using (
  auth.uid() is not null
  and (
    public.can_manage_attendance_payroll(organization_id)
    or exists (
      select 1 from public.attendance_sessions s
      where s.id = attendance_breaks.session_id and s.user_id = auth.uid()
    )
  )
);

-- Attempt logs: admin-visible only (diagnostics; do not affect payroll).
create policy "attendance admins read attempt logs"
on public.attendance_attempt_logs
for select
using (auth.uid() is not null and public.can_manage_attendance_payroll(organization_id));

-- Correction requests: the requester reads their own; privileged admins read all (review).
create policy "users read own correction requests"
on public.attendance_correction_requests
for select
using (
  auth.uid() is not null
  and (requested_by_user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
);

-- Session audits: admin-visible only (manager-side trail).
create policy "attendance admins read session audits"
on public.attendance_session_audits
for select
using (auth.uid() is not null and public.can_manage_attendance_payroll(organization_id));

-- Employment type history: own rows (the monthly view shows the user their own type) + admins.
create policy "users read own employment type history"
on public.employment_type_history
for select
using (
  auth.uid() is not null
  and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
);

-- Hourly rate history: own rows (the pay view shows the user their own rate segments) + admins.
create policy "users read own hourly rate history"
on public.hourly_rate_history
for select
using (
  auth.uid() is not null
  and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
);

-- Month snapshots: own pay rows + admins (finalization queue / dashboard).
create policy "users read own month snapshots"
on public.attendance_month_snapshots
for select
using (
  auth.uid() is not null
  and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
);

-- Export logs: admin-visible only.
create policy "attendance admins read export logs"
on public.attendance_export_logs
for select
using (auth.uid() is not null and public.can_manage_attendance_payroll(organization_id));

-- Grants. Authenticated gets read (+ the write grants are harmless: with no write policies RLS denies
-- direct writes). service_role bypasses RLS and performs all authoritative writes in later steps.
grant select, insert, update, delete on public.attendance_sites to authenticated;
grant select, insert, update, delete on public.attendance_qr_tokens to authenticated;
grant select, insert, update, delete on public.attendance_sessions to authenticated;
grant select, insert, update, delete on public.attendance_breaks to authenticated;
grant select, insert, update, delete on public.attendance_attempt_logs to authenticated;
grant select, insert, update, delete on public.attendance_correction_requests to authenticated;
grant select, insert, update, delete on public.attendance_session_audits to authenticated;
grant select, insert, update, delete on public.employment_type_history to authenticated;
grant select, insert, update, delete on public.hourly_rate_history to authenticated;
grant select, insert, update, delete on public.attendance_month_snapshots to authenticated;
grant select, insert, update, delete on public.attendance_export_logs to authenticated;

grant all on public.attendance_sites to service_role;
grant all on public.attendance_qr_tokens to service_role;
grant all on public.attendance_sessions to service_role;
grant all on public.attendance_breaks to service_role;
grant all on public.attendance_attempt_logs to service_role;
grant all on public.attendance_correction_requests to service_role;
grant all on public.attendance_session_audits to service_role;
grant all on public.employment_type_history to service_role;
grant all on public.hourly_rate_history to service_role;
grant all on public.attendance_month_snapshots to service_role;
grant all on public.attendance_export_logs to service_role;
