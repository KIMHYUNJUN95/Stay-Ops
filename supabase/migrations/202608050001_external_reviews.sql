-- External Reviews (Beds24 → Airbnb / Booking.com) — tables, indexes, RLS.
--
-- New tables: external_reviews, review_translations
-- Altered:    customer_complaints (+ external_review_id, + external_review_snapshot)
--
-- Domain contract: docs/product/25-complaint-workflow.md
-- Data model:      docs/engineering/04-data-model.md → external_reviews / review_translations
-- RLS:             docs/engineering/05-rls-permissions.md
-- Collection:      docs/engineering/01-beds24-integration.md → External Reviews
--
-- Key decisions this migration encodes (2026-08-04):
--   * Reviews are stored IN FULL regardless of score. `risk_level` is a classification,
--     not an ingestion filter — building/room averages need the good reviews too, and the
--     Airbnb endpoint offers no score or date filter anyway.
--   * `risk_level` has exactly three values. Airbnb <= 3 and Booking.com <= 7.0 are `risk`
--     (boundary included). The earlier Booking `critical` tier was dropped.
--   * Field availability is asymmetric: Airbnb gives no reservation id and no reviewer name
--     but pins the room via the queried roomId; Booking.com gives no room at all, only a
--     reservation id resolved against reservations.source_reservation_id. Missing values stay
--     NULL — never inferred.
--   * Writes are service-role only (Beds24 sync + server actions). No authenticated
--     insert/update/delete policies, mirroring the attendance tables.

-- ────────────────────────────────────────────────────────────
-- 1. external_reviews
-- ────────────────────────────────────────────────────────────
create table public.external_reviews (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null references public.organizations(id) on delete cascade,

  -- source identity
  provider              text        not null check (provider in ('airbnb', 'booking')),
  external_review_id    text        not null check (char_length(trim(external_review_id)) > 0),

  -- score: the provider's native scale is preserved as-is. Airbnb sends an int 1-5,
  -- Booking.com a decimal 1-10. They are never converted into a shared scale.
  rating_value          numeric(4,2),
  rating_scale          numeric(4,1),
  risk_level            text        not null default 'unrated'
                                    check (risk_level in ('unrated', 'normal', 'risk')),
  -- provider-specific sub-scores, stored in their original shape:
  --   airbnb  → category_ratings[]
  --   booking → scoring{clean, facilities, location, services, staff, value}
  rating_breakdown      jsonb       not null default '{}'::jsonb,

  -- timestamps from the source
  reviewed_at           timestamptz,
  imported_at           timestamptz not null default now(),
  source_updated_at     timestamptz,

  -- operational context; NULL whenever the payload could not be mapped reliably
  property_id           uuid        references public.properties(id) on delete set null,
  property_name         text,
  room_id               uuid        references public.rooms(id) on delete set null,
  room_label            text,
  reservation_id        uuid        references public.reservations(id) on delete set null,

  -- text. Every column is nullable: Booking.com may send a valid score-only review.
  guest_display_name    text,       -- Booking.com only; Airbnb exposes no reviewer name
  headline              text,       -- Booking.com content.headline; Airbnb has none
  source_language_code  text,       -- Booking.com content.language_code; lets us skip DeepL detect
  review_text           text,       -- Airbnb public_review
  positive_review_text  text,       -- Booking.com content.positive
  negative_review_text  text,       -- Booking.com content.negative
  -- Airbnb only. Guest-to-host, never published by Airbnb. Carries no score, so it must
  -- never feed risk classification or rating aggregation, and list/aggregate queries must
  -- not select it — detail reads only.
  private_feedback      text,

  -- a reply that already exists on the OTA. Read-only in StayOps; v1 does not compose or send.
  ota_reply_text        text,
  ota_replied_at        timestamptz,

  -- server-side troubleshooting copy. Matters more than usual because both Beds24 review
  -- endpoints are Beta/Alpha and their shape can change. Not a client rendering contract.
  raw_payload           jsonb       not null default '{}'::jsonb,

  linked_complaint_id   uuid        references public.customer_complaints(id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint external_reviews_source_unique unique (organization_id, provider, external_review_id),
  -- a scored review must carry its scale, and an unscored one must not claim a risk level
  constraint external_reviews_rating_pair check (
    (rating_value is null and rating_scale is null)
    or (rating_value is not null and rating_scale is not null)
  ),
  constraint external_reviews_unrated_has_no_score check (
    risk_level <> 'unrated' or rating_value is null
  )
);

comment on column public.external_reviews.private_feedback is
  'Airbnb guest-to-host private feedback. Never public, never scored — excluded from risk and rating aggregation, and from list/aggregate SELECT lists.';
comment on column public.external_reviews.raw_payload is
  'Server-only Beds24 payload copy. Do not expose to clients.';

-- ────────────────────────────────────────────────────────────
-- 2. external_reviews — indexes
-- ────────────────────────────────────────────────────────────
create index external_reviews_org_provider_reviewed_idx
  on public.external_reviews (organization_id, provider, reviewed_at desc);

-- default console ordering: risk first → lowest native score → newest
create index external_reviews_org_risk_idx
  on public.external_reviews (organization_id, risk_level, rating_value asc, reviewed_at desc);

-- period aggregation by building / room
create index external_reviews_org_place_idx
  on public.external_reviews (organization_id, property_id, room_id, reviewed_at desc);

-- "미전환 문제" KPI + the work queue the console opens on
create index external_reviews_unlinked_risk_idx
  on public.external_reviews (organization_id, reviewed_at desc)
  where risk_level = 'risk' and linked_complaint_id is null;

create trigger external_reviews_set_updated_at
  before update on public.external_reviews
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. review_translations
-- ────────────────────────────────────────────────────────────
create table public.review_translations (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null references public.organizations(id) on delete cascade,
  external_review_id    uuid        not null references public.external_reviews(id) on delete cascade,
  -- which body was translated. `private` is the Airbnb private feedback.
  source_part           text        not null
                                    check (source_part in ('review', 'positive', 'negative', 'headline', 'private')),
  target_locale         text        not null check (target_locale in ('ko', 'ja', 'en')),
  source_locale         text,
  translated_text       text        not null,
  provider              text        not null default 'deepl',
  translated_at         timestamptz not null default now(),
  -- a cached translation is reused only while this still matches the current source text
  source_text_hash      text        not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint review_translations_unique unique (external_review_id, source_part, target_locale)
);

create index review_translations_review_idx
  on public.review_translations (external_review_id, target_locale);

create trigger review_translations_set_updated_at
  before update on public.review_translations
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. customer_complaints — optional link back to the review it came from
--
-- Only set when a user explicitly converts a review. A plain manual complaint leaves both
-- columns NULL. The snapshot preserves the score / body / context as they were at conversion
-- time so the ticket stays readable even if the review row is later re-synced or the property
-- master changes.
-- ────────────────────────────────────────────────────────────
alter table public.customer_complaints
  add column external_review_id       uuid references public.external_reviews(id) on delete set null,
  add column external_review_snapshot jsonb;

-- one review may produce at most one complaint; the server rejects duplicate conversions and
-- this index makes that a hard guarantee rather than a race-prone check.
create unique index customer_complaints_external_review_unique
  on public.customer_complaints (external_review_id)
  where external_review_id is not null;

-- ────────────────────────────────────────────────────────────
-- 5. RLS — external_reviews
--
-- SELECT: active org members or platform admins.
-- No INSERT / UPDATE / DELETE policy on purpose: collection and conversion run through
-- service-role server paths that re-verify the organization. The grants below are therefore
-- inert for writes (a grant without a policy still denies).
-- ────────────────────────────────────────────────────────────
alter table public.external_reviews enable row level security;

create policy "external reviews: active members or platform admins can read"
  on public.external_reviews for select
  using (
    public.has_active_membership(organization_id)
    or exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid() and pa.is_active = true
    )
  );

-- ────────────────────────────────────────────────────────────
-- 6. RLS — review_translations
--
-- Same audience as the parent review. The server additionally checks that the translation's
-- organization matches the parent review on every read/write.
-- ────────────────────────────────────────────────────────────
alter table public.review_translations enable row level security;

create policy "review translations: active members or platform admins can read"
  on public.review_translations for select
  using (
    public.has_active_membership(organization_id)
    or exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid() and pa.is_active = true
    )
  );

-- ────────────────────────────────────────────────────────────
-- 7. Grants
-- ────────────────────────────────────────────────────────────
grant select on public.external_reviews    to authenticated;
grant select on public.review_translations to authenticated;

grant all on public.external_reviews    to service_role;
grant all on public.review_translations to service_role;
