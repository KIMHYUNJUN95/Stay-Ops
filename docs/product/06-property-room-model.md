# Property and Room Model

## Requirement

StayOps must support both:

- Standalone Airbnb-style properties
- Hotel-style buildings with multiple rooms

## Current Known Properties

Current property names:

- Arakicho A
- Arakicho B
- Kabukicho
- Takadanobaba
- Okubo A
- Okubo B
- Okubo C

Korean/Japanese display names can be added later if needed.

## Upcoming Property

A larger hotel-style building is expected around July.

Current status:

- Name: TBD
- Approximate rooms: 26
- Construction: in progress
- Room names/numbers: TBD
- Operational structure: TBD

The data model must allow this future hotel to be added without redesign.

## Recommended Model

Use separate concepts:

```txt
Property
Room / Unit
```

## Property

A property represents a building, hotel, house, or accommodation location.

Examples:

- Arakicho A
- Arakicho B
- Kabukicho
- Takadanobaba
- Okubo A
- Okubo B
- Okubo C
- Future hotel building

Suggested fields:

```txt
id
organization_id
name
display_name_ko
display_name_ja
display_name_en
property_type
address
status
external_provider
external_property_id
created_at
updated_at
```

Property type candidates:

- standalone
- multi_room_building
- hotel
- apartment
- house

## Room / Unit

A room/unit represents the bookable or operational unit inside a property.

For standalone Airbnb-style properties, the property may have one default unit.

For hotel-style buildings, the property can have many rooms.

Suggested fields:

```txt
id
organization_id
property_id
name
room_number
floor
unit_type
status
external_provider
external_room_id
created_at
updated_at
```

## Beds24 Active Room Selection Rule

For some company-managed buildings, Beds24 exposes two different room ID groups over the year.

Important:

- This is a company internal operating rule, not a Beds24 standard rule.
- StayOps must decide which Beds24 room IDs are active before creating or refreshing the internal room master.

Selection rule:

- If a Beds24 room/group has a minimum stay of `50 nights or more`, treat that room ID as **inactive** for that period.
- If the minimum stay is a normal operational value such as `1`, `2`, or `3` nights, treat that room ID as **active** for that period.

Model implication:

- Internal `rooms` data should represent only the active room ID set.
- The inactive room ID set should not be used for room-axis display, empty-room counts, or operational room lists.
- If needed later, inactive external room IDs can be stored as sync metadata, but they must not be treated as active operational inventory.

## Implementation Status (2026-05-24)

- Migration `supabase/migrations/202605240001_properties_rooms.sql` has been created.
- `properties` and `rooms` tables exist in schema with full RLS.
- `rooms.external_minimum_stay int` stores the Beds24 minimum stay value for the active room filter rule.
- `rooms.room_label text unique(organization_id, room_label)` is the cross-table join key to `reservations`, `cleaning_sessions`, `lost_items`, and `maintenance_reports`.
- Active room filter is implemented in `src/lib/rooms.ts`:
  - Constant: `BEDS24_INACTIVE_MIN_STAY_THRESHOLD = 50`
  - Helper: `getActiveRoomLabels(organizationId, supabase)` excludes Beds24 rooms with `external_minimum_stay >= 50`
  - Beds24 rows with `external_minimum_stay = null` are **included as active** (2026-06-18, was excluded).
    Unknown min-stay must not hide a real room or drop its reservations; only an explicit `>= 50` excludes.
- Property sync key policy:
  - prefer `(organization_id, external_provider, external_property_id)` when the Beds24 property ID exists
  - fall back to `(organization_id, name)` only when the webhook payload omits `external_property_id`
- `src/app/mobile/calendar/page.tsx` is already wired to call `getActiveRoomLabels()` and pass `roomMasterRooms` to the calendar component.
- Beds24 webhook (`src/app/api/beds24/webhook/route.ts`) now calls `syncBeds24PropertyAndRoom()` on every booking event — properties and rooms are created/updated automatically.
- Beds24 webhook now also attempts `src/lib/beds24/inventory-sync.ts`:
  - uses `externalPropertyId` (`propId`) to request current-date room inventory
  - updates `rooms.external_minimum_stay`
  - recomputes `rooms.status` via `classifyBeds24Room(minimumStay)`
- First valid webhook arrival will populate the tables.
- Once classified room-master rows exist, the calendar treats the organization as room-master-connected.
- Booking-webhook-only Beds24 rows with `external_minimum_stay = null` **do** count as classified, active room-master rows as of 2026-06-18 (so their reservations render immediately).
- If the active room list is empty after classification data exists, the calendar uses authoritative zero-room state instead of reverting to reservation-observed fallback.
- `src/lib/beds24/room-sync.ts` encapsulates the sync logic: extraction, classification, property upsert, room upsert.

## Display Rules

For field staff, the app should show names in a way that matches real work language.

Examples:

```txt
Arakicho A
Okubo B
Future Hotel 201
Future Hotel 202
```

## Open Questions

- Should property names stay romanized, or use Japanese/Korean names?
- Do standalone properties need internal rooms/areas?
- Should the future hotel use room numbers only or floor grouping?
- Should inactive/under-construction properties appear in the app?
- How should Beds24 property/room names map to internal names?
