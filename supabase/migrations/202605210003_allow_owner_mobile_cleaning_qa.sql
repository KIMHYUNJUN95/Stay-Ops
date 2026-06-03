drop policy if exists "field members can start own cleaning sessions"
on public.cleaning_sessions;

create policy "field members can start own cleaning sessions"
on public.cleaning_sessions
for insert
with check (
  auth.uid() is not null
  and staff_user_id = auth.uid()
  and status = 'in_progress'
  and completed_at is null
  and duration_seconds is null
  and public.has_org_role(
    organization_id,
    array['owner', 'field_manager', 'staff', 'part_time_staff']::public.organization_role[]
  )
);

drop policy if exists "staff can complete own active cleaning sessions"
on public.cleaning_sessions;

create policy "staff can complete own active cleaning sessions"
on public.cleaning_sessions
for update
using (
  auth.uid() is not null
  and staff_user_id = auth.uid()
  and status = 'in_progress'
)
with check (
  auth.uid() is not null
  and staff_user_id = auth.uid()
  and status in ('completed', 'cancelled')
  and completed_at is not null
  and duration_seconds is not null
  and public.has_org_role(
    organization_id,
    array['owner', 'field_manager', 'staff', 'part_time_staff']::public.organization_role[]
  )
);
