-- Drop the existing loose update/delete policies.
drop policy if exists "creators and admins can update announcements"
on public.announcements;

drop policy if exists "creators and admins can delete announcements"
on public.announcements;

-- Helper expression (inlined) used in both USING and WITH CHECK for update:
--   1. Platform admin can do anything.
--   2. Active owner or office_admin of the announcement's organization can manage all.
--   3. The original author can manage their own announcement only while they still have
--      an active membership in that organization and their current role is not part_time_staff.

create policy "creators and admins can update announcements"
on public.announcements
for update
using (
  public.is_platform_admin()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
  or (
    created_by_user_id = auth.uid()
    and exists (
      select 1
      from public.memberships m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role <> 'part_time_staff'
    )
  )
)
with check (
  public.is_platform_admin()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
  or (
    created_by_user_id = auth.uid()
    and exists (
      select 1
      from public.memberships m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role <> 'part_time_staff'
    )
  )
);

create policy "creators and admins can delete announcements"
on public.announcements
for delete
using (
  public.is_platform_admin()
  or public.has_org_role(
    organization_id,
    array['owner', 'office_admin']::public.organization_role[]
  )
  or (
    created_by_user_id = auth.uid()
    and exists (
      select 1
      from public.memberships m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role <> 'part_time_staff'
    )
  )
);
