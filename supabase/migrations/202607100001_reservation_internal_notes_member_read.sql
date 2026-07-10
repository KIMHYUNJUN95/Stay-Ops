drop policy if exists "admin members can read reservation internal notes"
on public.reservation_internal_notes;

create policy "active members can read reservation internal notes"
on public.reservation_internal_notes
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);
