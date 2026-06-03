create table public.announcement_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (char_length(trim(content)) > 0)
);

create trigger announcement_comments_set_updated_at
before update on public.announcement_comments
for each row execute function public.set_updated_at();

create index announcement_comments_announcement_created_at_idx
on public.announcement_comments(announcement_id, created_at asc);

create index announcement_comments_organization_created_at_idx
on public.announcement_comments(organization_id, created_at desc);

alter table public.announcement_comments enable row level security;

create policy "members can read visible announcement comments"
on public.announcement_comments
for select
using (
  deleted_at is null
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_comments.announcement_id
      and a.organization_id = announcement_comments.organization_id
      and (
        public.is_platform_admin()
        or (
          public.has_active_membership(a.organization_id)
          and (
            a.target_scope = 'everyone'
            or exists (
              select 1
              from public.memberships m
              where m.organization_id = a.organization_id
                and m.user_id = auth.uid()
                and m.status = 'active'
                and m.role = any(a.target_roles)
            )
          )
        )
      )
  )
);

create policy "targeted members can create announcement comments"
on public.announcement_comments
for insert
with check (
  deleted_at is null
  and auth.uid() = user_id
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_comments.announcement_id
      and a.organization_id = announcement_comments.organization_id
      and a.status = 'published'
      and a.allow_comments = true
      and (
        public.is_platform_admin()
        or (
          public.has_active_membership(a.organization_id)
          and (
            a.target_scope = 'everyone'
            or exists (
              select 1
              from public.memberships m
              where m.organization_id = a.organization_id
                and m.user_id = auth.uid()
                and m.status = 'active'
                and m.role = any(a.target_roles)
            )
          )
        )
      )
  )
);

grant select, insert on public.announcement_comments to authenticated;
grant all on public.announcement_comments to service_role;
