-- Add unique constraints needed for safe Beds24 property/room upsert.
--
-- properties(organization_id, name): enables ON CONFLICT upsert by property name.
--   Multiple reservations from the same Beds24 property converge to one row.
--   Name is the stable operational identifier; Beds24 property IDs are stored in
--   external_property_id for reference.
--
-- rooms(organization_id, external_room_id) partial index (beds24 only):
--   Allows lookup and deduplication by Beds24 room ID alongside the primary
--   (organization_id, room_label) unique constraint. Useful for cross-referencing
--   when the external ID changes (rotating room ID scenario).

alter table public.properties
  add constraint properties_org_name_unique unique (organization_id, name);

create unique index rooms_beds24_ext_room_id_idx
  on public.rooms(organization_id, external_room_id)
  where external_provider = 'beds24' and external_room_id is not null;
