-- Attendance — allow correction-request photos in the shared `request-images` bucket (Step 6).
--
-- The attendance correction form uploads to `${org}/attendance-corrections/${id}/${file}` (see
-- src/components/requests/request-image-upload.ts → `attendance-corrections`). Re-create the bucket's
-- upload/delete policies with `attendance-corrections` added to the folder whitelist. Attendance is open
-- to ALL active members (including part_time_staff), so part-time users may also attach correction
-- photos — but ONLY under the `suggestion-images` / `attendance-corrections` folders (other folders keep
-- the existing `role <> 'part_time_staff'` restriction). Mirrors 202606160004.

drop policy if exists "org members can upload request images" on storage.objects;
create policy "org members can upload request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns', 'task-images', 'task-update-images', 'suggestion-images', 'attendance-corrections')
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(split_part(name, '/', 4)) between 3 and 160
    and split_part(name, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and (m.role <> 'part_time_staff' or split_part(name, '/', 2) in ('suggestion-images', 'attendance-corrections'))
      )
    )
  );

drop policy if exists "org members can delete request images" on storage.objects;
create policy "org members can delete request images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns', 'task-images', 'task-update-images', 'suggestion-images', 'attendance-corrections')
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and (m.role <> 'part_time_staff' or split_part(name, '/', 2) in ('suggestion-images', 'attendance-corrections'))
      )
    )
  );
