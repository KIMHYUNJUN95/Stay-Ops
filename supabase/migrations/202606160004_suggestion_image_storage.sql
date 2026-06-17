-- Staff Suggestions — allow photo uploads to the shared `request-images` bucket (Step 8 bug fix).
--
-- The suggestion compose + comment composers upload to `${org}/suggestion-images/${id}/${file}`
-- (see src/components/requests/request-image-upload.ts → `suggestion-images`), but the existing
-- upload/delete policies only whitelisted lost-items / maintenance-reports / order-images /
-- linen-returns / task-images / task-update-images — so every suggestion photo upload was rejected by
-- storage RLS. Re-create both policies with `suggestion-images` added.
--
-- Suggestions are open to ALL active members (including part_time_staff), so part-time users may also
-- attach photos — but ONLY under the `suggestion-images` folder. Other folders keep the existing
-- `role <> 'part_time_staff'` restriction unchanged.

drop policy if exists "org members can upload request images" on storage.objects;
create policy "org members can upload request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns', 'task-images', 'task-update-images', 'suggestion-images')
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
          and (m.role <> 'part_time_staff' or split_part(name, '/', 2) = 'suggestion-images')
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
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns', 'task-images', 'task-update-images', 'suggestion-images')
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.is_active = true)
      or exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and (m.role <> 'part_time_staff' or split_part(name, '/', 2) = 'suggestion-images')
      )
    )
  );
