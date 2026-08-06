-- External Reviews — carry the provider's own reservation identifier.
--
-- Domain contract: docs/product/25-complaint-workflow.md → "플랫폼별 필드 가용성"
-- Data model:      docs/engineering/04-data-model.md → external_reviews
-- Collection:      docs/engineering/01-beds24-integration.md → External Reviews
--
-- Why (2026-08-06): the original migration recorded "Airbnb gives no reservation id and no
-- reviewer name". The first half is WRONG — measured against our own stored `raw_payload`,
-- 2214 of 2214 Airbnb reviews carry `reservation_confirmation_code` (e.g. "HMRWNK5RQW").
-- It is not a Beds24 bookingId, which is why the reservations lookup by
-- `source_reservation_id` missed it, but the very same code is stored on our reservations at
-- `raw_payload->>apiReference`, so the two sides do join.
--
-- The reviewer NAME really is absent from the Airbnb payload (only numeric `reviewer_id`) —
-- that part of the original note stands. The name now comes from the matched reservation
-- instead, exactly like Booking.com's room comes from its matched reservation.
--
-- This column stores the identifier the PROVIDER uses, which is what operations staff can
-- actually search for on the OTA extranet:
--   airbnb  → reservation_confirmation_code  ("HMRWNK5RQW")
--   booking → reservation_id (Beds24 bookingId, digits)
-- `reservation_id` (uuid FK) stays the link to our own row; it is not human-meaningful and
-- was previously being shown in the UI as if it were the reservation id.

alter table public.external_reviews
  add column if not exists source_reservation_id text;

comment on column public.external_reviews.source_reservation_id is
  'Provider-native reservation identifier: Airbnb reservation_confirmation_code, Booking.com Beds24 bookingId. Displayed to staff; NULL when the payload carried none.';

comment on column public.external_reviews.guest_display_name is
  'Booking.com: reviewer.name from the payload. Airbnb: copied from the matched reservation (the review payload has no name). NULL when unmatched — never inferred.';

-- Backfilling existing rows does not need Beds24: `raw_payload` was kept for exactly this.
update public.external_reviews
   set source_reservation_id = nullif(trim(raw_payload ->> 'reservation_confirmation_code'), '')
 where provider = 'airbnb'
   and source_reservation_id is null;

update public.external_reviews
   set source_reservation_id = nullif(trim(raw_payload ->> 'reservation_id'), '')
 where provider = 'booking'
   and source_reservation_id is null;

-- Link Airbnb reviews to the local reservation carrying the same confirmation code, and take
-- the guest name from it. Organization-scoped: a confirmation code is only ever matched
-- inside the organization that owns both rows.
update public.external_reviews r
   set reservation_id     = res.id,
       guest_display_name = coalesce(nullif(trim(res.guest_name), ''), r.guest_display_name)
  from public.reservations res
 where r.provider = 'airbnb'
   and r.reservation_id is null
   and r.source_reservation_id is not null
   and res.organization_id = r.organization_id
   and nullif(trim(res.raw_payload ->> 'apiReference'), '') = r.source_reservation_id;

-- Matching happens on every collection run, but a review can arrive before its reservation
-- has been synced. This index keeps the lookup cheap for both the sync and the re-match.
create index if not exists reservations_api_reference_idx
  on public.reservations ((raw_payload ->> 'apiReference'))
  where raw_payload ->> 'apiReference' is not null;
