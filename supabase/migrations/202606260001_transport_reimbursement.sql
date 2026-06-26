-- Transport Reimbursement — per-user monthly ledger (3 tables + item images), separate from payroll.
-- See docs/engineering/11-attendance-payroll-technical-design.md (transport_reimbursement_* schema).
--
-- This is a DEDICATED, payroll-ADJACENT feature: it must remain fully separate from
-- attendance_month_snapshots (hourly gross pay). No values are shared or copied between them.
--
-- Write boundary mirrors the attendance migration: this adds NO write policies. All authoritative
-- mutations go through controlled service-role server actions (service_role bypasses RLS). The RLS
-- below governs direct authenticated READS only — default user reads OWN rows; privileged admin
-- (org owner / attendance_payroll_admin) or platform admin reads org-wide. Helpers
-- can_manage_attendance_payroll() / has_active_membership() / set_updated_at() are reused from the
-- attendance foundation (202606170001) for consistency.

-- ── transport_reimbursement_reports ───────────────────────────────────────────
-- One row per user-month ledger. total_amount_cached is a convenience field; the items are the
-- source of truth. target_month stores the 1st of the Tokyo month (server-computed, never UTC default).
create table if not exists public.transport_reimbursement_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_month date not null,
  status text not null default 'draft',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  review_note text,
  total_amount_cached integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_reimbursement_reports_org_user_month_key unique (organization_id, user_id, target_month),
  constraint transport_reimbursement_reports_status_check check (status in ('draft','submitted','reviewing','approved','rejected'))
);

create trigger transport_reimbursement_reports_set_updated_at
before update on public.transport_reimbursement_reports
for each row execute function public.set_updated_at();

-- ── transport_reimbursement_items ─────────────────────────────────────────────
-- One row per reimbursable transport entry (many per report). attendance_session_id is optional
-- because monthly bulk/manual entry is supported. work_context preserves a display-ready
-- building/room/cleaning summary that a single FK cannot capture.
create table if not exists public.transport_reimbursement_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.transport_reimbursement_reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  amount_yen integer not null,
  entry_mode text not null default 'manual',
  attendance_session_id uuid references public.attendance_sessions(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  work_context jsonb not null default '{}',
  memo text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_reimbursement_items_entry_mode_check check (entry_mode in ('linked','manual')),
  constraint transport_reimbursement_items_amount_positive check (amount_yen > 0)
);

create trigger transport_reimbursement_items_set_updated_at
before update on public.transport_reimbursement_items
for each row execute function public.set_updated_at();

-- ── transport_reimbursement_item_images ───────────────────────────────────────
-- Receipt/proof images per item. Image count is enforced at the application layer. Storage path:
-- {org_id}/transport-reimbursements/{report_id}/{item_id}/{file} in the shared `request-images` bucket.
create table if not exists public.transport_reimbursement_item_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.transport_reimbursement_reports(id) on delete cascade,
  item_id uuid not null references public.transport_reimbursement_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists transport_reimbursement_reports_org_user
  on public.transport_reimbursement_reports(organization_id, user_id);
create index if not exists transport_reimbursement_reports_target_month
  on public.transport_reimbursement_reports(organization_id, target_month);
create index if not exists transport_reimbursement_items_report_id
  on public.transport_reimbursement_items(report_id);
create index if not exists transport_reimbursement_items_org_user
  on public.transport_reimbursement_items(organization_id, user_id);
create index if not exists transport_reimbursement_item_images_item_id
  on public.transport_reimbursement_item_images(item_id);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — read-only self/admin policies. NO write policies (all writes go through service-role server
-- actions). Default user reads OWN rows; org owner / attendance_payroll_admin / platform admin read
-- org-wide. Same shape as the attendance foundation, via shared helper functions.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.transport_reimbursement_reports enable row level security;
alter table public.transport_reimbursement_items enable row level security;
alter table public.transport_reimbursement_item_images enable row level security;

create policy "transport_reports_self_or_admin_select"
  on public.transport_reimbursement_reports
  for select to authenticated
  using (
    auth.uid() is not null
    and public.has_active_membership(organization_id)
    and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
  );

create policy "transport_items_self_or_admin_select"
  on public.transport_reimbursement_items
  for select to authenticated
  using (
    auth.uid() is not null
    and public.has_active_membership(organization_id)
    and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
  );

create policy "transport_images_self_or_admin_select"
  on public.transport_reimbursement_item_images
  for select to authenticated
  using (
    auth.uid() is not null
    and public.has_active_membership(organization_id)
    and (user_id = auth.uid() or public.can_manage_attendance_payroll(organization_id))
  );

-- Grants. Authenticated gets read (+ write grants are harmless: with no write policies RLS denies
-- direct writes). service_role bypasses RLS and performs all authoritative writes.
grant select, insert, update, delete on public.transport_reimbursement_reports to authenticated;
grant select, insert, update, delete on public.transport_reimbursement_items to authenticated;
grant select, insert, update, delete on public.transport_reimbursement_item_images to authenticated;

grant all on public.transport_reimbursement_reports to service_role;
grant all on public.transport_reimbursement_items to service_role;
grant all on public.transport_reimbursement_item_images to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- Storage — transport reimbursement images use a 5-part path in the shared `request-images` bucket:
--   {org_id}/transport-reimbursements/{report_id}/{item_id}/{file}
-- The existing bucket upload/delete policies enforce a 4-part path; these are ADDITIONAL policies for
-- the 5-part transport path. Multiple permissive policies on the same command OR together, so the
-- 4-part and 5-part shapes coexist without conflict. Transport is open to ALL active members
-- (including part_time_staff), matching the attendance-corrections precedent.
-- ════════════════════════════════════════════════════════════════════════════

create policy "org members can upload transport reimbursement images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 5
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) = 'transport-reimbursements'
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(split_part(name, '/', 5)) between 3 and 160
    and split_part(name, '/', 5) ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$'
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

create policy "org members can delete transport reimbursement images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 5
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) = 'transport-reimbursements'
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
