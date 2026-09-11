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

## 방 이름: 저장값과 표시값은 다르다 (2026-09-11)

### 규칙

| 건물 | `rooms.room_label` (저장) | 사용자에게 보이는 값 |
| --- | --- | --- |
| 아라키초A | `201`, `402_2` | `201`, `402` |
| 아라키초B | `AB101` … `AB402` | `101` … `402` |
| 가부키초 | `K202` … `K803` | `202` … `803` |
| STAY ARI Apartment Hotel | `O101` … `O310` | `101` … `310` |
| 오쿠보A/B/C · 사노 | 방이 1~3개뿐이라 건물명 자체가 라벨 | 그대로 |

변환은 **`getDisplayRoomLabel(propertyName, internalRoomKey)` 한 곳**에서만 일어난다
(`src/lib/room-label-normalization.ts`). 사용자에게 보이는 방 이름은 전부 이 함수를 거친다 —
약 30개 호출부가 있고, 새 화면도 여기를 거쳐야 한다. **`room_label` 을 DB 에서 읽어 그대로
화면에 찍으면 안 된다.**

### 왜 접두어가 붙어 있나

`rooms` 의 제약이 `UNIQUE (organization_id, room_label)` 이다 — 건물별이 아니라 **조직 전체에서**
방 이름이 유일해야 한다. 아라키초A 가 맨 번호(201, 302…)를 선점했으므로 나중에 연 건물은 번호를
그대로 쓸 수 없고, 접두어로 피해 왔다. 즉 **`AB`·`K`·`O` 는 DB 제약을 피하려고 붙은 것이지 현장에서
부르는 이름이 아니다.** 청소도 주문도 「101호」라고 부른다.

### 왜 저장값을 바꾸지 않았나

2026-09-11 에 「호수 숫자만 보이게 해달라」는 요구를 받고 저장값 변경을 먼저 검토했다. 두 가지가
막았다.

1. **유니크 충돌.** `O` 를 떼면 스테이아리 `O201·O202·O302` 가 아라키초A 의 `201·202·302` 와
   충돌한다. 그 세 방은 운영 중이고 예약이 각각 58~75건, 2027-01 까지 잡혀 있다.
2. **Beds24 가 원복시킨다.** `room_label` 은 Beds24 가 내려주는 방 이름을 그대로 저장한 값이다
   (`properties-room-master-sync.ts` → `readString(room, ["name", "unitName", "roomName"])`).
   DB 에서만 `102` 로 바꾸면 다음 방 마스터 동기화가 Beds24 의 `O102` 를 못 찾아 **방을 하나 더
   만든다**(26 → 52). `upsertRoom` 의 충돌 키가 `(organization_id, room_label)` 이기 때문이다.

표시 계층에서 떼면 둘 다 일어나지 않는다. 그리고 **가부키초는 이미 이 방식으로 돌고 있었다** —
`getCanonicalRoomLabel` 이 숫자만 뽑아 `K202` 를 `202` 로 보여준다. 나머지 건물로 넓힌 것뿐이다.

### 안전한 이유 (전수 확인)

- **건물 안에서 겹치지 않는다.** 접두어를 떼도 아라키초B 8개·스테이아리 26개 모두 고유하다.
- **아라키초A 에 알파벳 붙은 방이 없다.** 코드 주석이 경고하던 `A301` vs `301` 문제는 예약
  3,418건 전수 조회 결과 실제 데이터에 존재하지 않는다. (그래도 내부 키 단계
  `stripArakichoDisplaySuffix` 는 접두어를 남긴다 — 서로 다른 Beds24 행이라 합치면 안 된다.)
- **묶음 키는 전부 「건물+방」 쌍이다.** 아라키초A `201` 과 스테이아리 `201` 이 화면에 같은 번호로
  보여도 한 칸으로 합쳐지지 않는다.
- **뒤가 숫자가 아니면 떼지 않는다.** `OkuboCC` 는 접두어가 아니라 이름 자체다.

회귀 방지: `src/lib/__tests__/room-label-display.test.ts` (10건).

### 새 건물을 붙일 때

Beds24 쪽 방 이름에 접두어가 있어도 그대로 두면 된다 — 오히려 유니크 제약 때문에 **있어야**
한다. 화면에서는 자동으로 떨어진다. 단, 접두어 뒤가 전부 숫자여야 한다(`O102` ○, `O1-2` ✗).
