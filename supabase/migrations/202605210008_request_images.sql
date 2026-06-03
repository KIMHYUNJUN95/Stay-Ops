-- Add image attachments for lost-item and maintenance requests.
-- Stores up to 5 public image URLs per record and enables direct client upload.

alter table public.lost_items
  add column if not exists image_urls text[] not null default '{}'::text[];

alter table public.maintenance_reports
  add column if not exists image_urls text[] not null default '{}'::text[];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-images',
  'request-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "org members can upload request images" on storage.objects;
create policy "org members can upload request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images')
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(split_part(name, '/', 4)) between 3 and 160
    and split_part(name, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$'
    and (
      exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.is_active = true
      )
      or exists (
        select 1
        from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role <> 'part_time_staff'
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
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images')
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.is_active = true
      )
      or exists (
        select 1
        from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role <> 'part_time_staff'
      )
    )
  );
