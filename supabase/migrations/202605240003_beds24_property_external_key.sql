-- Prefer external property identity for Beds24 property upserts.
--
-- Postgres UNIQUE allows multiple NULL values, so this remains compatible with
-- name-fallback rows that do not yet have an external property ID.

alter table public.properties
  add constraint properties_org_provider_ext_property_unique
  unique (organization_id, external_provider, external_property_id);
