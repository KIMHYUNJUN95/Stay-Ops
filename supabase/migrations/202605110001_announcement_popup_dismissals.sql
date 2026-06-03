create table public.announcement_popup_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hide_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, user_id)
);

create trigger announcement_popup_dismissals_set_updated_at
before update on public.announcement_popup_dismissals
for each row execute function public.set_updated_at();

create index announcement_popup_dismissals_user_idx
on public.announcement_popup_dismissals(user_id, announcement_id);

alter table public.announcement_popup_dismissals enable row level security;

create policy "users can read their own popup dismissals"
on public.announcement_popup_dismissals
for select
using (auth.uid() = user_id);

create policy "users can insert their own popup dismissals"
on public.announcement_popup_dismissals
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_popup_dismissals.announcement_id
      and a.organization_id = announcement_popup_dismissals.organization_id
      and a.status = 'published'
      and a.show_popup_on_app_open = true
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

create policy "users can update their own popup dismissals"
on public.announcement_popup_dismissals
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.announcement_popup_dismissals to authenticated;
grant all on public.announcement_popup_dismissals to service_role;
