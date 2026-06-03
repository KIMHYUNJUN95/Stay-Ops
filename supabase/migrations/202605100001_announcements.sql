create type public.announcement_status as enum ('draft', 'published', 'archived');
create type public.announcement_target_scope as enum ('everyone', 'roles');

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  content text not null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  target_scope public.announcement_target_scope not null default 'everyone',
  target_roles public.organization_role[] not null default '{}',
  status public.announcement_status not null default 'draft',
  is_important boolean not null default false,
  is_pinned boolean not null default false,
  show_popup_on_app_open boolean not null default false,
  popup_until timestamptz,
  allow_comments boolean not null default true,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(title)) > 0),
  check (char_length(trim(content)) > 0),
  check (
    (status = 'published' and published_at is not null and archived_at is null)
    or (status = 'archived' and archived_at is not null)
    or (status = 'draft')
  ),
  check (
    target_scope = 'everyone'
    or (target_scope = 'roles' and cardinality(target_roles) > 0)
  )
);

create trigger announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

create index announcements_organization_status_created_at_idx
on public.announcements(organization_id, status, created_at desc);

create index announcements_pinned_created_at_idx
on public.announcements(organization_id, is_pinned desc, created_at desc);

alter table public.announcements enable row level security;

create policy "members can read announcements"
on public.announcements
for select
using (
  public.is_platform_admin()
  or (
    public.has_active_membership(organization_id)
    and (
      target_scope = 'everyone'
      or exists (
        select 1
        from public.memberships m
        where m.organization_id = announcements.organization_id
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role = any(announcements.target_roles)
      )
    )
  )
);

create policy "members except part time can create announcements"
on public.announcements
for insert
with check (
  public.is_platform_admin()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin', 'cs_staff', 'field_manager', 'staff']::public.organization_role[]
  )
);

create policy "creators and admins can update announcements"
on public.announcements
for update
using (
  public.is_platform_admin()
  or created_by_user_id = auth.uid()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
)
with check (
  public.is_platform_admin()
  or created_by_user_id = auth.uid()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
);

create policy "creators and admins can delete announcements"
on public.announcements
for delete
using (
  public.is_platform_admin()
  or created_by_user_id = auth.uid()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
);

grant select, insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
