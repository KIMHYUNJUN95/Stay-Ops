-- Board (자유 게시판) — tables, indexes, RLS, and storage.
--
-- New tables: board_posts, board_post_reads, board_comments, board_reactions
-- New storage bucket: board-attachments (private, signed-URL intended)
-- Updated storage policies: request-images whitelist + board-posts / board-comments paths

-- ────────────────────────────────────────────────────────────
-- 1. board_posts
-- ────────────────────────────────────────────────────────────
create table public.board_posts (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  created_by_user_id  uuid        not null references public.profiles(id) on delete restrict,
  title               text,
  content             text        not null check (char_length(trim(content)) > 0),
  tags                text[]      not null default '{}',
  image_urls          text[]      not null default '{}',
  file_attachments    jsonb       not null default '[]',
  is_pinned           boolean     not null default false,
  pinned_at           timestamptz,
  pinned_by_user_id   uuid        references public.profiles(id) on delete set null,
  allow_comments      boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint board_posts_image_limit check (coalesce(array_length(image_urls, 1), 0) <= 5),
  constraint board_posts_file_limit  check (jsonb_array_length(file_attachments) <= 5),
  constraint board_posts_pin_consistency check (
    (is_pinned = false and pinned_at is null and pinned_by_user_id is null)
    or (is_pinned = true  and pinned_at is not null and pinned_by_user_id is not null)
  )
);

create index board_posts_feed_idx on public.board_posts (organization_id, created_at desc)
  where deleted_at is null;

create index board_posts_pinned_idx on public.board_posts (organization_id, is_pinned, pinned_at desc)
  where deleted_at is null;

create trigger board_posts_set_updated_at
  before update on public.board_posts
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. board_post_reads
-- ────────────────────────────────────────────────────────────
create table public.board_post_reads (
  post_id  uuid        not null references public.board_posts(id) on delete cascade,
  user_id  uuid        not null references public.profiles(id)    on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 3. board_comments
-- ────────────────────────────────────────────────────────────
create table public.board_comments (
  id                  uuid        primary key default gen_random_uuid(),
  post_id             uuid        not null references public.board_posts(id)  on delete cascade,
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  created_by_user_id  uuid        not null references public.profiles(id)      on delete restrict,
  content             text        not null check (char_length(trim(content)) > 0),
  image_urls          text[]      not null default '{}',
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint board_comments_image_limit check (coalesce(array_length(image_urls, 1), 0) <= 3)
);

create index board_comments_post_idx on public.board_comments (post_id, created_at asc)
  where deleted_at is null;

-- ────────────────────────────────────────────────────────────
-- 4. board_reactions
-- ────────────────────────────────────────────────────────────
create table public.board_reactions (
  post_id    uuid        not null references public.board_posts(id) on delete cascade,
  user_id    uuid        not null references public.profiles(id)    on delete cascade,
  emoji      text        not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

-- ────────────────────────────────────────────────────────────
-- 5. Grants
-- ────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.board_posts       to authenticated;
grant select, insert, update, delete on public.board_post_reads  to authenticated;
grant select, insert, update, delete on public.board_comments    to authenticated;
grant select, insert, update, delete on public.board_reactions   to authenticated;

grant all on public.board_posts       to service_role;
grant all on public.board_post_reads  to service_role;
grant all on public.board_comments    to service_role;
grant all on public.board_reactions   to service_role;

-- ────────────────────────────────────────────────────────────
-- 6. RLS — board_posts
-- ────────────────────────────────────────────────────────────
alter table public.board_posts      enable row level security;
alter table public.board_post_reads enable row level security;
alter table public.board_comments   enable row level security;
alter table public.board_reactions  enable row level security;

create policy "board posts: active members can read"
  on public.board_posts for select
  using (
    deleted_at is null
    and public.has_active_membership(organization_id)
  );

create policy "board posts: active members can create"
  on public.board_posts for insert
  with check (
    created_by_user_id = auth.uid()
    and public.has_active_membership(organization_id)
  );

create policy "board posts: authors and admins can update"
  on public.board_posts for update
  using (
    deleted_at is null
    and (
      created_by_user_id = auth.uid()
      or public.has_org_role(organization_id, array['owner', 'office_admin']::public.organization_role[])
    )
  )
  with check (
    created_by_user_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'office_admin']::public.organization_role[])
  );

create policy "board posts: authors and admins can delete"
  on public.board_posts for delete
  using (
    created_by_user_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'office_admin']::public.organization_role[])
  );

-- ────────────────────────────────────────────────────────────
-- 7. RLS — board_post_reads
-- ────────────────────────────────────────────────────────────
create policy "board reads: own rows"
  on public.board_post_reads for select
  using (user_id = auth.uid());

create policy "board reads: insert own"
  on public.board_post_reads for insert
  with check (user_id = auth.uid());

create policy "board reads: upsert own"
  on public.board_post_reads for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 8. RLS — board_comments
-- ────────────────────────────────────────────────────────────
create policy "board comments: active members can read"
  on public.board_comments for select
  using (
    deleted_at is null
    and public.has_active_membership(organization_id)
  );

create policy "board comments: active members can create"
  on public.board_comments for insert
  with check (
    created_by_user_id = auth.uid()
    and public.has_active_membership(organization_id)
  );

create policy "board comments: authors and admins can delete"
  on public.board_comments for delete
  using (
    created_by_user_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'office_admin']::public.organization_role[])
  );

-- ────────────────────────────────────────────────────────────
-- 9. RLS — board_reactions
-- ────────────────────────────────────────────────────────────
create policy "board reactions: active members can read"
  on public.board_reactions for select
  using (
    public.has_active_membership(
      (select organization_id from public.board_posts where id = post_id limit 1)
    )
  );

create policy "board reactions: users can insert own"
  on public.board_reactions for insert
  with check (
    user_id = auth.uid()
    and public.has_active_membership(
      (select organization_id from public.board_posts where id = post_id limit 1)
    )
  );

create policy "board reactions: users can delete own"
  on public.board_reactions for delete
  using (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 10. Storage bucket: board-attachments (private)
-- ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-attachments',
  'board-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint'
  ]
);

-- path: {org_id}/{post_id}/{filename}
create policy "board attachments: org members can read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'board-attachments'
    and exists (
      select 1 from public.memberships m
      where m.organization_id::text = split_part(name, '/', 1)
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "board attachments: org members can upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'board-attachments'
    and array_length(string_to_array(name, '/'), 1) = 3
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(split_part(name, '/', 3)) between 3 and 160
    and exists (
      select 1 from public.memberships m
      where m.organization_id::text = split_part(name, '/', 1)
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "board attachments: uploader can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'board-attachments'
    and owner = auth.uid()
  );

-- ────────────────────────────────────────────────────────────
-- 11. request-images — add board-posts and board-comments to whitelist
-- Mirrors pattern from 202606170003_attendance_correction_storage.sql
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
      'board-posts', 'board-comments'
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
            or split_part(name, '/', 2) in ('suggestion-images', 'attendance-corrections', 'board-posts', 'board-comments')
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
      'board-posts', 'board-comments'
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
            or split_part(name, '/', 2) in ('suggestion-images', 'attendance-corrections', 'board-posts', 'board-comments')
          )
      )
    )
  );
