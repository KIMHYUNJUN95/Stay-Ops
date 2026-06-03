create table public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, user_id)
);

create trigger announcement_reads_set_updated_at
before update on public.announcement_reads
for each row execute function public.set_updated_at();

create index announcement_reads_announcement_read_at_idx
on public.announcement_reads(announcement_id, read_at desc);

create index announcement_reads_user_read_at_idx
on public.announcement_reads(user_id, read_at desc);

alter table public.announcement_reads enable row level security;

create policy "users can read their own announcement reads"
on public.announcement_reads
for select
using (
  auth.uid() = user_id
  or public.is_platform_admin()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin', 'cs_staff']::public.organization_role[]
  )
);

create policy "users can insert their own announcement reads"
on public.announcement_reads
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_reads.announcement_id
      and a.organization_id = announcement_reads.organization_id
      and a.status = 'published'
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

create policy "users can update their own announcement reads"
on public.announcement_reads
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.announcement_reads to authenticated;
grant all on public.announcement_reads to service_role;
