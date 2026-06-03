-- Drop the loose update policy that allowed any column to be mutated.
drop policy if exists "users can update their own popup dismissals"
on public.announcement_popup_dismissals;

-- Prevent changing the immutable identity columns on every update.
create or replace function public.prevent_popup_dismissal_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.announcement_id  <> old.announcement_id
  or new.organization_id  <> old.organization_id
  or new.user_id          <> old.user_id
  then
    raise exception 'announcement_id, organization_id, and user_id are immutable on announcement_popup_dismissals';
  end if;
  return new;
end;
$$;

create trigger announcement_popup_dismissals_immutable_identity
before update on public.announcement_popup_dismissals
for each row execute function public.prevent_popup_dismissal_identity_change();

-- Recreate update policy: allow update only when the row still references a
-- published popup-enabled announcement that targets this user, matching the
-- same visibility check used in the insert policy.
create policy "users can update their own popup dismissals"
on public.announcement_popup_dismissals
for update
using (auth.uid() = user_id)
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
