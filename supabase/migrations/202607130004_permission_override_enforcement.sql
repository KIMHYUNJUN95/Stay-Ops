-- Permission-override ENFORCEMENT (2026-07-13). Wires the prepared `has_permission_override()` helper
-- (migration 202607090002) into the actual authorization of each whitelisted key, so a granted
-- override finally changes what the user can do — not just show in the UI. Whitelist:
-- src/config/permission-overrides.ts. `can_generate_report` is enforced in app code (mobile report
-- action), not RLS, so it is not in this migration.
--
-- Pattern: add `OR public.has_permission_override(organization_id, auth.uid(), '<key>')` next to each
-- feature's existing role check. Policies can't be altered in place, so update-in-place = drop+recreate
-- with identical logic + the extra OR.

-- ── order_processor → order_requests UPDATE (상태 변경) ──────────────────────────
drop policy if exists "reporter or manager can update order requests" on public.order_requests;
create policy "reporter or manager can update order requests"
on public.order_requests
for update
using (
  auth.uid() is not null
  and (
    reported_by_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
    or public.has_permission_override(organization_id, auth.uid(), 'order_processor')
  )
);

-- ── maintenance_status_change → maintenance_reports UPDATE (상태 변경) ───────────
drop policy if exists "reporter or manager can update maintenance reports" on public.maintenance_reports;
create policy "reporter or manager can update maintenance reports"
on public.maintenance_reports
for update
using (
  auth.uid() is not null
  and (
    reported_by_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
    or public.has_permission_override(organization_id, auth.uid(), 'maintenance_status_change')
  )
);

-- ── property_room_manage → properties / rooms manage ─────────────────────────────
-- Currently only platform admins (via service_role/RLS) manage these, and authenticated users only
-- have SELECT. Grant DML to authenticated so an override-holder can be allowed by RLS, then add an
-- override policy alongside the existing platform-admin one. RLS still restricts writes to
-- platform admins OR active override-holders.
grant insert, update, delete on public.properties to authenticated;
grant insert, update, delete on public.rooms to authenticated;

drop policy if exists "override can manage properties" on public.properties;
create policy "override can manage properties"
on public.properties for all to authenticated
using (public.has_permission_override(organization_id, auth.uid(), 'property_room_manage'))
with check (public.has_permission_override(organization_id, auth.uid(), 'property_room_manage'));

drop policy if exists "override can manage rooms" on public.rooms;
create policy "override can manage rooms"
on public.rooms for all to authenticated
using (public.has_permission_override(organization_id, auth.uid(), 'property_room_manage'))
with check (public.has_permission_override(organization_id, auth.uid(), 'property_room_manage'));
