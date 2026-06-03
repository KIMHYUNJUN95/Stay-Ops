-- In-app notification center (push channel planned separately).

create type public.notification_type as enum (
  'order_processed'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  href text not null,
  source_type text not null,
  source_id uuid not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, dedupe_key)
);

create index notifications_recipient_created_idx
on public.notifications(recipient_user_id, created_at desc);

create index notifications_recipient_unread_idx
on public.notifications(recipient_user_id, read_at)
where read_at is null;

create index notifications_org_created_idx
on public.notifications(organization_id, created_at desc);

alter table public.notifications enable row level security;

create policy "recipients can read own notifications"
on public.notifications
for select
using (
  auth.uid() is not null
  and (
    recipient_user_id = auth.uid()
    or public.is_platform_admin()
  )
);

create policy "org members can create notifications for org recipients"
on public.notifications
for insert
with check (
  auth.uid() is not null
  and public.has_active_membership(organization_id)
  and exists (
    select 1
    from public.memberships m
    where m.organization_id = notifications.organization_id
      and m.user_id = notifications.recipient_user_id
      and m.status = 'active'
  )
);

create policy "recipients can mark own notifications read"
on public.notifications
for update
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
