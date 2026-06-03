-- Corrective migration: narrow announcement image object filenames.
-- Keeps the three-segment path contract from 202605190001 and additionally
-- rejects dot-only, dash-ending, slash-nested, or excessively long filenames.

drop policy if exists "org members can upload announcement images" on storage.objects;

create policy "org members can upload announcement images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'announcement-images'

    -- Require exactly 3 path segments: {orgId}/{announcementId}/{filename}
    and array_length(string_to_array(name, '/'), 1) = 3

    -- Segment 1 (organization_id) must be a valid UUID
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

    -- Segment 2 (announcement_id) must be a valid UUID
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

    -- Segment 3 must be a compact safe filename, matching the app's UUID.ext names.
    and char_length(split_part(name, '/', 3)) between 3 and 160
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$'

    and (
      -- Platform admins can upload to any valid organization folder
      exists (
        select 1 from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.is_active = true
      )
      or
      -- Active non-part-time members can upload only to their own organization's folder
      exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role <> 'part_time_staff'
      )
    )
  );
