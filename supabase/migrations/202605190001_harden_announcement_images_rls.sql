-- Corrective migration: tighten the Storage INSERT policy for announcement-images.
-- The previous policy (202605170001) validated only the first path segment (organization_id),
-- allowing uploads to arbitrary nested paths within an org's folder.
--
-- This migration drops and recreates the policy with full three-segment path validation:
--   {organizationId}/{announcementId}/{filename}
-- where both UUID segments are validated by regex and the filename is restricted to
-- safe characters (letters, digits, underscore, period, hyphen).
--
-- Regex notes:
--   UUID pattern  : ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
--                   matched with ~* (case-insensitive) to accept uppercase UUIDs
--   Filename pattern: ^[A-Za-z0-9_.-]+$
--                   matched with ~ (case-sensitive, both cases explicit)
--                   the hyphen is last in the character class to be treated as literal

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

    -- Segment 3 (filename) must use only safe characters: letters, digits, _, ., -
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_.-]+$'

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
