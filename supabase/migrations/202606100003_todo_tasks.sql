-- Todo / Shared Task workflow.
-- See docs/product/18-todo-task-workflow.md and docs/engineering/09-todo-task-technical-design.md.
--
-- Model: one canonical task + one participant set + one common status + one unified
-- update-log. No sender/recipient copies. Private by default; sharing adds participants.
--
-- Write boundary: all task mutations go through server actions using the SERVICE ROLE
-- client with explicit permission checks. RLS below governs direct authenticated reads.

-- ── tasks ───────────────────────────────────────────────────────────────────
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  property_id uuid references public.properties(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  guest_name text,
  scheduled_date date,
  due_at timestamptz,
  all_day boolean not null default true,
  time_label text,
  priority text not null default 'normal',
  status text not null default 'open',
  is_inbox boolean not null default true,
  is_shared boolean not null default false,
  recurrence_rule text,
  tags text[] not null default '{}'::text[],
  image_urls text[] not null default '{}'::text[],
  completed_at timestamptz,
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(title)) > 0),
  check (priority in ('normal', 'important', 'urgent')),
  check (status in ('open', 'in_progress', 'completed', 'cancelled'))
);

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create index tasks_org_creator_idx on public.tasks(organization_id, created_by_user_id, created_at desc);
create index tasks_org_scheduled_idx on public.tasks(organization_id, scheduled_date);
create index tasks_org_due_idx on public.tasks(organization_id, due_at);
create index tasks_org_status_idx on public.tasks(organization_id, status, created_at desc);
create index tasks_inbox_idx on public.tasks(organization_id, is_inbox) where is_inbox = true;

-- ── task_participants ────────────────────────────────────────────────────────
create table public.task_participants (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  is_first_recipient boolean not null default false,
  added_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, user_id),
  check (role in ('author', 'participant'))
);
create index task_participants_task_idx on public.task_participants(task_id);
create index task_participants_user_idx on public.task_participants(user_id);

-- ── Participant-membership helper (created after the table it reads).
-- SECURITY DEFINER avoids tasks<->participants RLS policy recursion.
create or replace function public.is_task_participant(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_participants tp
    where tp.task_id = target_task_id
      and tp.user_id = auth.uid()
  );
$$;

-- ── tasks RLS ────────────────────────────────────────────────────────────────
alter table public.tasks enable row level security;

create policy "participants can read tasks"
on public.tasks
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_task_participant(id))
);

create policy "author can create own task"
on public.tasks
for insert
with check (
  auth.uid() is not null
  and created_by_user_id = auth.uid()
  and public.has_active_membership(organization_id)
);

create policy "author can update task"
on public.tasks
for update
using (
  auth.uid() is not null
  and (created_by_user_id = auth.uid() or public.is_platform_admin())
);

create policy "author can delete task"
on public.tasks
for delete
using (
  auth.uid() is not null
  and (created_by_user_id = auth.uid() or public.is_platform_admin())
);

grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;

-- ── task_participants RLS ────────────────────────────────────────────────────
alter table public.task_participants enable row level security;

create policy "participants can read participant rows"
on public.task_participants
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_task_participant(task_id))
);
-- Direct writes are denied for authenticated users; sharing and self-remove are
-- mediated by service-role server actions.

grant select, insert, update, delete on public.task_participants to authenticated;
grant all on public.task_participants to service_role;

-- ── task_updates (unified log) ───────────────────────────────────────────────
create table public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  update_type text not null,
  body text,
  image_urls text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  check (update_type in ('note', 'system_edited', 'system_shared', 'status_changed', 'completed', 'reopened'))
);
create index task_updates_task_idx on public.task_updates(task_id, created_at);

alter table public.task_updates enable row level security;

create policy "participants can read task updates"
on public.task_updates
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_task_participant(task_id))
);

create policy "participants can add notes"
on public.task_updates
for insert
with check (
  auth.uid() is not null
  and created_by_user_id = auth.uid()
  and public.is_task_participant(task_id)
);

grant select, insert, update, delete on public.task_updates to authenticated;
grant all on public.task_updates to service_role;

-- ── Notification types for task events ───────────────────────────────────────
alter type public.notification_type add value if not exists 'task_shared';
alter type public.notification_type add value if not exists 'task_updated';
alter type public.notification_type add value if not exists 'task_completed';

-- ── Storage: reuse request-images bucket, add task subfolders ────────────────
drop policy if exists "org members can upload request images" on storage.objects;
create policy "org members can upload request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns', 'task-images', 'task-update-images')
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(split_part(name, '/', 4)) between 3 and 160
    and split_part(name, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (select 1 from public.memberships m where m.organization_id::text = split_part(name, '/', 1) and m.user_id = auth.uid() and m.status = 'active' and m.role <> 'part_time_staff')
    )
  );

drop policy if exists "org members can delete request images" on storage.objects;
create policy "org members can delete request images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns', 'task-images', 'task-update-images')
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (select 1 from public.memberships m where m.organization_id::text = split_part(name, '/', 1) and m.user_id = auth.uid() and m.status = 'active' and m.role <> 'part_time_staff')
    )
  );
