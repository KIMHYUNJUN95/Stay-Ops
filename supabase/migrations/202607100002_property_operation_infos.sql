create table if not exists public.property_operation_infos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  canonical_name text not null,
  address_ko text,
  address_ja text,
  address_en text,
  shared_access jsonb not null default '[]'::jsonb,
  room_access jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, canonical_name),
  check (char_length(trim(canonical_name)) > 0),
  check (jsonb_typeof(shared_access) = 'array'),
  check (jsonb_typeof(room_access) = 'array')
);

drop trigger if exists property_operation_infos_set_updated_at on public.property_operation_infos;
create trigger property_operation_infos_set_updated_at
before update on public.property_operation_infos
for each row execute function public.set_updated_at();

create index if not exists property_operation_infos_org_idx
  on public.property_operation_infos (organization_id, canonical_name);

grant select on public.property_operation_infos to authenticated;
grant all on public.property_operation_infos to service_role;

alter table public.property_operation_infos enable row level security;

create policy "members can read property operation infos"
on public.property_operation_infos
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "admin members can insert property operation infos"
on public.property_operation_infos
for insert
with check (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff']::public.organization_role[]
    )
  )
);

create policy "admin members can update property operation infos"
on public.property_operation_infos
for update
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff']::public.organization_role[]
    )
  )
)
with check (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff']::public.organization_role[]
    )
  )
);

create policy "admin members can delete property operation infos"
on public.property_operation_infos
for delete
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff']::public.organization_role[]
    )
  )
);
