-- Update the global default linen-return catalog to the current 7-item set.
-- Preserve history: retire old generic rows instead of rewriting them, then
-- upsert the new active defaults for every organization.

-- 1) Retire old defaults that are no longer part of the active catalog.
update public.linen_items
set is_active = false
where building_name is null
  and code in ('bath', 'hand', 'sheet', 'duvet', 'robe');

-- 2) Keep the surviving generic defaults active and aligned to the current labels/order.
update public.linen_items
set
  name = case code
    when 'towel' then '수건'
    when 'pillow' then '베개 커버'
    when 'mat' then '발 매트'
    else name
  end,
  display_order = case code
    when 'towel' then 6
    when 'pillow' then 5
    when 'mat' then 7
    else display_order
  end,
  is_active = true
where building_name is null
  and code in ('towel', 'pillow', 'mat');

-- 3) Insert the new global defaults if missing.
insert into public.linen_items (organization_id, code, name, display_order)
select o.id, seed.code, seed.name, seed.ord
from public.organizations o
cross join (
  values
    ('duvet_single', '싱글 이불 커버', 1),
    ('duvet_double', '더블 이불 커버', 2),
    ('mattress_single', '싱글 매트리스 커버', 3),
    ('mattress_double', '더블 매트리스 커버', 4)
) as seed(code, name, ord)
where not exists (
  select 1
  from public.linen_items li
  where li.organization_id = o.id
    and li.building_name is null
    and li.code = seed.code
);

-- 4) Ensure the full current 7-item set is active and in the intended order.
update public.linen_items
set
  name = case code
    when 'duvet_single' then '싱글 이불 커버'
    when 'duvet_double' then '더블 이불 커버'
    when 'mattress_single' then '싱글 매트리스 커버'
    when 'mattress_double' then '더블 매트리스 커버'
    when 'pillow' then '베개 커버'
    when 'towel' then '수건'
    when 'mat' then '발 매트'
    else name
  end,
  display_order = case code
    when 'duvet_single' then 1
    when 'duvet_double' then 2
    when 'mattress_single' then 3
    when 'mattress_double' then 4
    when 'pillow' then 5
    when 'towel' then 6
    when 'mat' then 7
    else display_order
  end,
  is_active = true
where building_name is null
  and code in (
    'duvet_single',
    'duvet_double',
    'mattress_single',
    'mattress_double',
    'pillow',
    'towel',
    'mat'
  );
