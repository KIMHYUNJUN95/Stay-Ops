-- Customer Complaints (고객 컴플레인) — tables, indexes, RLS, and storage path whitelist.
--
-- New tables: customer_complaints, complaint_comments
-- Reuses existing storage bucket: request-images
-- Storage path convention: {organization_id}/complaint-images/{complaint_id}/{filename}
-- Read access: active org members + platform admins (mirrors board / suggestion patterns).
-- Write access (insert/update/delete): handled by server actions via service_role with
--   code-level role gates. RLS policies are kept as defense-in-depth even though the
--   primary write path bypasses RLS with the service role.
-- See docs/engineering/04-data-model.md, docs/engineering/05-rls-permissions.md

-- ────────────────────────────────────────────────────────────
-- 1. customer_complaints
-- ────────────────────────────────────────────────────────────
create table public.customer_complaints (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null references public.organizations(id) on delete cascade,
  created_by_user_id    uuid        not null references public.profiles(id) on delete restrict,
  title                 text        not null check (char_length(trim(title)) > 0),
  platform              text        not null check (platform in ('airbnb', 'booking', 'google', 'tripadvisor', 'jalan', 'rakuten', 'direct', 'other')),
  platform_ref          text,
  status                text        not null default 'open' check (status in ('open', 'resolved')),
  description           text,
  image_urls            text[]      not null default '{}',
  rating                numeric(4,2),
  property_id           uuid        references public.properties(id) on delete set null,
  property_name         text,
  room_id               uuid        references public.rooms(id) on delete set null,
  room_label            text,
  reservation_id        uuid        references public.reservations(id) on delete set null,
  guest_name            text,
  resolved_at           timestamptz,
  resolved_by_user_id   uuid        references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint customer_complaints_image_limit check (coalesce(array_length(image_urls, 1), 0) <= 5)
);

-- ────────────────────────────────────────────────────────────
-- 2. Indexes
-- ────────────────────────────────────────────────────────────
create index customer_complaints_org_created_idx
  on public.customer_complaints (organization_id, created_at desc);

create index customer_complaints_status_idx
  on public.customer_complaints (organization_id, status, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 3. updated_at trigger (reuse shared public.set_updated_at)
-- ────────────────────────────────────────────────────────────
create trigger customer_complaints_set_updated_at
  before update on public.customer_complaints
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. complaint_comments
-- ────────────────────────────────────────────────────────────
create table public.complaint_comments (
  id                    uuid        primary key default gen_random_uuid(),
  complaint_id          uuid        not null references public.customer_complaints(id) on delete cascade,
  organization_id       uuid        not null references public.organizations(id) on delete cascade,
  created_by_user_id    uuid        not null references public.profiles(id) on delete restrict,
  content               text        not null check (char_length(trim(content)) > 0),
  image_urls            text[]      not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint complaint_comments_image_limit check (coalesce(array_length(image_urls, 1), 0) <= 5)
);

create index complaint_comments_complaint_idx
  on public.complaint_comments (complaint_id, created_at asc)
  where deleted_at is null;

create trigger complaint_comments_set_updated_at
  before update on public.complaint_comments
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 5. Grants
-- ────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.customer_complaints to authenticated;
grant select, insert, update, delete on public.complaint_comments   to authenticated;

grant all on public.customer_complaints to service_role;
grant all on public.complaint_comments  to service_role;

-- ────────────────────────────────────────────────────────────
-- 6. RLS — customer_complaints
-- Writes go through server actions (service_role) with code-level role gates.
-- Read access: active org members or platform admins.
-- ────────────────────────────────────────────────────────────
alter table public.customer_complaints enable row level security;

create policy "customer complaints: active members or platform admins can read"
  on public.customer_complaints for select
  using (
    public.has_active_membership(organization_id)
    or exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid() and pa.is_active = true
    )
  );

-- ────────────────────────────────────────────────────────────
-- 7. RLS — complaint_comments
-- ────────────────────────────────────────────────────────────
alter table public.complaint_comments enable row level security;

create policy "complaint comments: active members or platform admins can read"
  on public.complaint_comments for select
  using (
    deleted_at is null
    and (
      public.has_active_membership(organization_id)
      or exists (
        select 1 from public.platform_admins pa
        where pa.user_id = auth.uid() and pa.is_active = true
      )
    )
  );

-- ────────────────────────────────────────────────────────────
-- 8. request-images — add 'complaint-images' to the path whitelist.
-- Mirrors pattern from 202606250004_bug_reports.sql. The whitelist below
-- reproduces the full set (drop + recreate) and appends 'complaint-images'.
-- part_time_staff stays excluded from complaint uploads (office-level feature).
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
      'board-posts', 'board-comments', 'bug-reports', 'complaint-images'
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
      'board-posts', 'board-comments', 'bug-reports', 'complaint-images'
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
