-- Linen Return ledger (feature name "Linen Defect" — first slice = building-scoped
-- linen return ledger). See docs/product/19-linen-defect-workflow.md and
-- docs/engineering/08-linen-defect-technical-design.md.
--
-- Model: header (linen_return_records) + line items (linen_return_record_items),
-- never one-row-per-item. One saved record is one return event for one building.
-- Building is the canonical property NAME (text), consistent with order_requests /
-- maintenance_reports (the app's operational "building" key), not a properties FK.

-- ── Linen item master ──────────────────────────────────────────────────────
-- Selectable linen item catalog. building_name is nullable: NULL = available for
-- every building in the org (the seeded default set); a concrete value scopes the
-- item to one building once building-specific lists are provided. Master admin UI
-- is intentionally deferred — RLS is ready for admin-capable roles.
create table public.linen_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  building_name text,
  code text,
  name text not null,
  category text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) > 0)
);

create trigger linen_items_set_updated_at
before update on public.linen_items
for each row execute function public.set_updated_at();

create index linen_items_org_idx
  on public.linen_items(organization_id, is_active, display_order);
create index linen_items_org_building_idx
  on public.linen_items(organization_id, building_name)
  where building_name is not null;

alter table public.linen_items enable row level security;

create policy "members can read organization linen items"
on public.linen_items
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "admins can manage linen items"
on public.linen_items
for all
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
)
with check (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

grant select, insert, update, delete on public.linen_items to authenticated;
grant all on public.linen_items to service_role;

-- Seed an arbitrary default catalog (building_name NULL = all buildings) for every
-- existing organization. Building-specific lists are added later.
insert into public.linen_items (organization_id, code, name, display_order)
select o.id, seed.code, seed.name, seed.ord
from public.organizations o
cross join (
  values
    ('towel', '타월', 1),
    ('bath', '목욕타월', 2),
    ('hand', '핸드타월', 3),
    ('sheet', '시트', 4),
    ('duvet', '이불커버', 5),
    ('pillow', '베개커버', 6),
    ('robe', '가운', 7),
    ('mat', '발매트', 8)
) as seed(code, name, ord);

-- ── Return record header ───────────────────────────────────────────────────
create table public.linen_return_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  building_name text not null,
  note text,
  image_urls text[] not null default '{}'::text[],
  registered_by_user_id uuid not null references public.profiles(id) on delete restrict,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(building_name)) > 0)
);

create trigger linen_return_records_set_updated_at
before update on public.linen_return_records
for each row execute function public.set_updated_at();

create index linen_return_records_org_building_idx
  on public.linen_return_records(organization_id, building_name, registered_at desc);
create index linen_return_records_registrant_idx
  on public.linen_return_records(registered_by_user_id, registered_at desc);

alter table public.linen_return_records enable row level security;

create policy "members can read organization linen return records"
on public.linen_return_records
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "members can create linen return records"
on public.linen_return_records
for insert
with check (
  auth.uid() is not null
  and registered_by_user_id = auth.uid()
  and public.has_active_membership(organization_id)
);

create policy "author or admin can update linen return records"
on public.linen_return_records
for update
using (
  auth.uid() is not null
  and (
    registered_by_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

create policy "author or admin can delete linen return records"
on public.linen_return_records
for delete
using (
  auth.uid() is not null
  and (
    registered_by_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
    )
  )
);

grant select, insert, update, delete on public.linen_return_records to authenticated;
grant all on public.linen_return_records to service_role;

-- ── Return record line items ───────────────────────────────────────────────
-- One line per linen item inside a record. Duplicate items in the same record are
-- blocked by the unique constraint; quantity is integer-only and positive.
create table public.linen_return_record_items (
  id uuid primary key default gen_random_uuid(),
  return_record_id uuid not null references public.linen_return_records(id) on delete cascade,
  linen_item_id uuid not null references public.linen_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (return_record_id, linen_item_id)
);

create index linen_return_record_items_record_idx
  on public.linen_return_record_items(return_record_id, sort_order);
create index linen_return_record_items_item_idx
  on public.linen_return_record_items(linen_item_id);

alter table public.linen_return_record_items enable row level security;

-- Visibility/mutation follow the parent record's policies via an EXISTS check.
create policy "read line items of visible linen return records"
on public.linen_return_record_items
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.linen_return_records r
    where r.id = return_record_id
      and (
        public.is_platform_admin()
        or public.has_active_membership(r.organization_id)
      )
  )
);

create policy "insert line items for own linen return records"
on public.linen_return_record_items
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.linen_return_records r
    where r.id = return_record_id
      and r.registered_by_user_id = auth.uid()
      and public.has_active_membership(r.organization_id)
  )
);

create policy "mutate line items of editable linen return records"
on public.linen_return_record_items
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.linen_return_records r
    where r.id = return_record_id
      and (
        r.registered_by_user_id = auth.uid()
        or public.is_platform_admin()
        or public.has_org_role(
          r.organization_id,
          array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
        )
      )
  )
);

create policy "delete line items of editable linen return records"
on public.linen_return_record_items
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.linen_return_records r
    where r.id = return_record_id
      and (
        r.registered_by_user_id = auth.uid()
        or public.is_platform_admin()
        or public.has_org_role(
          r.organization_id,
          array['owner', 'office_admin', 'cs_staff', 'field_manager']::public.organization_role[]
        )
      )
  )
);

grant select, insert, update, delete on public.linen_return_record_items to authenticated;
grant all on public.linen_return_record_items to service_role;

-- ── Storage: reuse request-images bucket, add 'linen-returns' subfolder ─────
-- Mirrors supabase/migrations/202605210008_request_images.sql, adding the new
-- requestType segment so linen return photos upload under the same bucket/RLS.
drop policy if exists "org members can upload request images" on storage.objects;
create policy "org members can upload request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns')
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
    and split_part(name, '/', 2) in ('lost-items', 'maintenance-reports', 'order-images', 'linen-returns')
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
