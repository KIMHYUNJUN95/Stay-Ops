-- Projects feature for the Todo / Task workspace.
-- See docs/product/23-project-workflow.md and docs/engineering/09-todo-task-technical-design.md.
--
-- Model: a project groups tasks under optional sections. Project tasks are the same
-- canonical `tasks` row with `project_id` set (and an optional `section_id`); they are
-- shown only inside the Projects tab, never in Today/Tomorrow/Inbox/Sent/Calendar.
--
-- Write boundary: all project mutations go through server actions using the SERVICE ROLE
-- client with explicit permission checks. RLS below governs direct authenticated reads.

-- ── projects ─────────────────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  is_shared boolean not null default false,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(title)) > 0)
);

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create index projects_org_idx on public.projects(organization_id, created_at desc);
create index projects_org_creator_idx on public.projects(organization_id, created_by_user_id);

-- ── project_participants ─────────────────────────────────────────────────────
create table public.project_participants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  is_first_recipient boolean not null default false,
  added_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id),
  check (role in ('owner', 'member'))
);
create index project_participants_project_idx on public.project_participants(project_id);
create index project_participants_user_idx on public.project_participants(user_id);

-- ── project_sections ─────────────────────────────────────────────────────────
create table public.project_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(title)) > 0)
);

create trigger project_sections_set_updated_at
before update on public.project_sections
for each row execute function public.set_updated_at();

create index project_sections_project_idx on public.project_sections(project_id, sort_order);

-- ── Project-membership helper (created after the table it reads).
-- SECURITY DEFINER avoids projects<->participants RLS policy recursion, and lets the
-- extended tasks SELECT policy test project membership without recursing through tasks.
create or replace function public.is_project_participant(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_participants pp
    where pp.project_id = target_project_id
      and pp.user_id = auth.uid()
  );
$$;

-- ── tasks: add project linkage ───────────────────────────────────────────────
alter table public.tasks
  add column project_id uuid references public.projects(id) on delete cascade,
  add column section_id uuid references public.project_sections(id) on delete set null;

create index tasks_project_idx on public.tasks(project_id) where project_id is not null;
create index tasks_section_idx on public.tasks(section_id) where section_id is not null;

-- ── tasks RLS: extend read to project participants ───────────────────────────
-- A project participant can read every task in that project even when they are not a
-- per-task participant. Drop + recreate the existing SELECT policy to add the branch.
drop policy if exists "participants can read tasks" on public.tasks;
create policy "participants can read tasks"
on public.tasks
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.is_task_participant(id)
    or (project_id is not null and public.is_project_participant(project_id))
  )
);

-- ── projects RLS ─────────────────────────────────────────────────────────────
alter table public.projects enable row level security;

create policy "participants can read projects"
on public.projects
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_project_participant(id))
);
-- Writes are mediated by service-role server actions (create/edit/delete + membership).

grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;

-- ── project_participants RLS ─────────────────────────────────────────────────
alter table public.project_participants enable row level security;

create policy "participants can read project participant rows"
on public.project_participants
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_project_participant(project_id))
);

grant select, insert, update, delete on public.project_participants to authenticated;
grant all on public.project_participants to service_role;

-- ── project_sections RLS ─────────────────────────────────────────────────────
alter table public.project_sections enable row level security;

create policy "participants can read project sections"
on public.project_sections
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_project_participant(project_id))
);

grant select, insert, update, delete on public.project_sections to authenticated;
grant all on public.project_sections to service_role;

-- ── Notification type for project sharing ────────────────────────────────────
alter type public.notification_type add value if not exists 'project_shared';
