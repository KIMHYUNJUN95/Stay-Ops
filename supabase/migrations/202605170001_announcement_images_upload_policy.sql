-- Storage INSERT policy for the announcement-images bucket.
-- Allows active non-part-time org members to upload images to their org's folder.
-- Path structure enforced by the client: {organization_id}/{announcement_id}/{filename}

create policy "org members can upload announcement images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'announcement-images'
    and (
      -- Platform admins can upload to any org's folder.
      exists (
        select 1 from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.is_active = true
      )
      or
      -- Active non-part-time members can upload to their own org's folder only.
      -- split_part extracts the first path segment (the organization_id).
      exists (
        select 1 from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role <> 'part_time_staff'
      )
    )
  );
