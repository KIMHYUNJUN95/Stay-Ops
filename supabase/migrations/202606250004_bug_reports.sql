-- Bug Report / Problem Report — table, indexes, RLS, and storage path whitelist.
--
-- New table: bug_reports
-- Reuses existing storage bucket: request-images
-- Storage path convention: {organization_id}/bug-reports/{report_id}/{filename}
-- Reviewer roles (first slice): owner, office_admin
-- See docs/product/25-bug-report-workflow.md
-- See docs/engineering/13-bug-report-technical-design.md

-- ────────────────────────────────────────────────────────────
-- 1. bug_reports
-- ────────────────────────────────────────────────────────────
create table public.bug_reports (
  id                   uuid        primary key default gen_random_uuid(),
  organization_id      uuid        not null references public.organizations(id) on delete cascade,
  reported_by_user_id  uuid        not null references public.profiles(id) on delete restrict,
  title                text        not null check (char_length(trim(title)) >= 1),
  description          text        not null check (char_length(trim(description)) >= 1),
  image_urls           text[]      not null default '{}',
  status               text        not null default 'submitted'
                          check (status in ('submitted', 'reviewing', 'fixed', 'closed')),
  reviewed_by_user_id  uuid        references public.profiles(id) on delete set null,
  closed_by_user_id    uuid        references public.profiles(id) on delete set null,
  closed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bug_reports_image_limit check (coalesce(array_length(image_urls, 1), 0) <= 5)
);

-- ────────────────────────────────────────────────────────────
-- 2. Indexes
-- ────────────────────────────────────────────────────────────
create index bug_reports_org_created_idx
  on public.bug_reports (organization_id, created_at desc);

create index bug_reports_reporter_idx
  on public.bug_reports (reported_by_user_id, created_at desc);

create index bug_reports_status_idx
  on public.bug_reports (organization_id, status, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 3. updated_at trigger (reuse shared public.set_updated_at)
-- ────────────────────────────────────────────────────────────
create trigger bug_reports_set_updated_at
  before update on public.bug_reports
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. Grants
-- ────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.bug_reports to authenticated;
grant all on public.bug_reports to service_role;

-- ────────────────────────────────────────────────────────────
-- 5. RLS
-- ────────────────────────────────────────────────────────────
alter table public.bug_reports enable row level security;

-- SELECT: reporter (self) OR org reviewer (owner / office_admin)
create policy "bug reports: reporter or reviewer can read"
  on public.bug_reports for select
  using (
    reported_by_user_id = auth.uid()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin']::public.organization_role[]
    )
  );

-- INSERT: active org member submitting their own report
create policy "bug reports: active members can create"
  on public.bug_reports for insert
  with check (
    reported_by_user_id = auth.uid()
    and public.has_active_membership(organization_id)
  );

-- UPDATE (author): author may edit their own report only while submitted
create policy "bug reports: author can update while submitted"
  on public.bug_reports for update
  using (
    reported_by_user_id = auth.uid()
    and status = 'submitted'
  )
  with check (
    reported_by_user_id = auth.uid()
    and status = 'submitted'
  );

-- UPDATE (reviewer): org reviewer may update (typically status transitions)
create policy "bug reports: reviewer can update status"
  on public.bug_reports for update
  using (
    public.has_org_role(
      organization_id,
      array['owner', 'office_admin']::public.organization_role[]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['owner', 'office_admin']::public.organization_role[]
    )
  );

-- DELETE (author only, submitted only). Reviewers cannot hard-delete in first slice.
create policy "bug reports: author can delete while submitted"
  on public.bug_reports for delete
  using (
    reported_by_user_id = auth.uid()
    and status = 'submitted'
  );

-- ────────────────────────────────────────────────────────────
-- 6. request-images — add 'bug-reports' to the path whitelist.
-- Mirrors pattern from 202606250001_board.sql (board-posts / board-comments).
-- part_time_staff is allowed to upload bug-report screenshots, consistent with
-- the spec that "any active member including part_time_staff can submit a bug report".
-- ────────────────────────────────────────────────────────────
drop policy if exists "org members can upload request images" on storage.objects;
create policy "org members can upload request images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in (
      'lost-items', 'maintenance-reports', 'order-images', 'linen-returns',
      'task-images', 'task-update-images', 'suggestion-images', 'attendance-corrections',
      'board-posts', 'board-comments', 'bug-reports'
    )
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
          and (
            m.role <> 'part_time_staff'
            or split_part(name, '/', 2) in (
              'suggestion-images', 'attendance-corrections',
              'board-posts', 'board-comments', 'bug-reports'
            )
          )
      )
    )
  );

drop policy if exists "org members can delete request images" on storage.objects;
create policy "org members can delete request images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in (
      'lost-items', 'maintenance-reports', 'order-images', 'linen-returns',
      'task-images', 'task-update-images', 'suggestion-images', 'attendance-corrections',
      'board-posts', 'board-comments', 'bug-reports'
    )
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and (
            m.role <> 'part_time_staff'
            or split_part(name, '/', 2) in (
              'suggestion-images', 'attendance-corrections',
              'board-posts', 'board-comments', 'bug-reports'
            )
          )
      )
    )
  );
