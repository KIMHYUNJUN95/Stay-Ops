# Beds24 Integration

## Current Context

The company uses Beds24 as its channel manager.

An internal company system already uses the Beds24 API. StayOps should connect to the same operational data source or integrate directly with Beds24, depending on the final architecture.

The current internal system is a separate web app with automation integrations across Google Sheets, Notion, Slack, and other APIs. It uses Firebase, React Native, and Node.js.

StayOps can integrate with Beds24 directly or through an independent sync service. It does not need to depend on the existing internal system because the product focus is different.

## Official API Direction

Beds24 currently provides API documentation and API V2 documentation.

Important initial research notes:

- Beds24 API V2 is the preferred direction for new integrations.
- Beds24 API usage should be minimized and rate-limited.
- The integration should avoid unnecessary repeated calls.
- StayOps should cache synced data locally instead of calling Beds24 every time the app opens a calendar view.

Official references:

- https://wiki.beds24.com/index.php/Category%3AAPI
- https://beds24.com/api/v2/
- https://www.beds24.de/api/

## Integration Goals

### First Goal: Read Data

StayOps should first read data from Beds24.

Needed data:

- Properties
- Rooms
- Bookings
- Guest stay dates
- Check-in dates
- Check-out dates
- Guest name
- Number of guests
- Guest phone number
- Reservation source/channel
- Occupancy
- Availability
- Reservation status

Reservation memo/notes are not required for the MVP reservation calendar.

### External Reviews: Read-only Collection (spec verified 2026-08-04)

Beds24가 제공하는 Airbnb 및 Booking.com 리뷰는 예약 동기화와 분리된 **저빈도 수집 작업**으로 다룬다.
StayOps UI는 Beds24를 실시간 조회하지 않고, 수집한 `external_reviews` 로컬 사본만 읽는다.

엔드포인트 계약은 Beds24 OpenAPI 스펙(`https://beds24.com/api/v2/apiV2.yaml`)에서 실측했다.

| | Airbnb | Booking.com |
|---|---|---|
| 엔드포인트 | `GET /channels/airbnb/reviews` | `GET /channels/booking/reviews` |
| Beds24 성숙도 | **Beta** | **Alpha** |
| 필수 파라미터 | `roomId` (룸타입 단위) | `propertyId` + `from`(YYYY-MM-DD) |
| 날짜 필터 | **없음** | 있음 |
| 페이지 | **객실당 50건 하드 상한, 페이지네이션 불가** (아래 참조) | 100건/응답, `pages.nextPageExists` |
| 응답 타입 | `airbnbReview` | `bookingReview` |

- **기본 주기: 룸타입/건물 단위 하루 1회.** API가 단위 파라미터를 필수로 요구하므로 "채널별 하루 1회"는
  성립하지 않는다. 1주기 호출 수 = `(Airbnb 활성 룸타입 수) + (Booking 연동 건물 수)`.
- **호출 키는 이미 로컬에 있다:** `rooms.external_room_id` → Airbnb `roomId`,
  `properties.external_property_id` → Booking `propertyId`. 값이 없는 객실·건물은 호출 대상에서 제외한다.
- **Airbnb는 건물 단위 호출이 불가능하다.** 스펙상 `/channels/airbnb/reviews`의 파라미터는 `roomId`
  하나뿐이고 `required: true`이며, `/channels/` 아래 리뷰 엔드포인트는 `airbnb/reviews`와
  `booking/reviews` 둘뿐이다(2026-08-05 재확인). Booking.com만 이미 건물 단위(`propertyId`)다.
- **대상 선별 규칙 (2026-08-05 추가).** 호출 수를 줄이는 유일한 방법이 대상 축소이므로, 예약 캘린더·
  객실 마스터가 쓰는 것과 **같은 집합**만 본다:
  `status = 'active'` + `isInactiveBeds24Room(external_minimum_stay)` 제외(최소 숙박 50박 이상은
  비활성 룸ID) + `isExcludedOperationalProperty()` 제외(사노) + 같은 `external_room_id`는 한 번만.
  2026-08-05 인벤토리 정상화 후 실측: 비활성 44 / 활성 84로 갈렸고, 조직당 Airbnb 42~52 +
  Booking 8 = **1주기 50~60회**, 하루 1회면 두 조직 합계 약 **110 크레딧/일**이다
  (요청당 비용은 `x-request-cost` 실측 1).
- **Airbnb는 객실당 리뷰 50건이 하드 상한이다 (2026-08-05 실측, 스펙이 틀렸다).**
  스펙은 "Maximum of 100"이라 적고 `pages` 객체를 노출하지만 둘 다 사실이 아니다:
  리뷰가 50건을 넘는 객실도 정확히 50건만 오고 `pages.nextPageExists`는 그때도 `false`이며,
  `?page=2` / `?page=3`은 **같은 50건을 그대로 돌려준다**(첫 id까지 동일). 즉 51번째 이후 과거
  리뷰에 도달할 방법이 Beds24에는 없다.
  - **과거 이력 전량 백필이 불가능하다.** 이미 50건이 찬 객실의 더 오래된 리뷰는 영구히 못 가져온다.
    수집 결과의 `truncatedTargets`가 그런 객실을 보고해 "완전한 척"하지 않게 한다.
  - **정기 수집에는 영향이 없다.** 하루에 한 객실에 50건이 새로 달릴 일은 없다.
  - 페이지 루프는 Airbnb에서 비활성화했다 — 돌면 같은 50건을 다시 받으며 크레딧만 쓴다.
  - 과거 Airbnb 리뷰가 꼭 필요하면 Airbnb 호스트 계정에서 직접 내보내는 수밖에 없다.
- **기간 제한은 Booking.com에만 적용한다.** Airbnb는 `from`이 없고 어차피 최대 50건이 전량으로
  오므로 받은 것을 절대 잘라내지 않는다(잘라내면 같은 크레딧을 쓰고 버리는 것이며, 상한 탓에
  다시 가져올 수도 없다). Booking.com은 정기 **30일**, `?full=1`이면 **730일**을 쓴다. 30일인
  이유는 리뷰가 체크아웃 며칠 뒤에 달리고 `last_change_timestamp`가 있는 걸 보면 수정도 되기
  때문이다 — 7일 창은 늦게 달린 리뷰를 놓친다. UPSERT라 겹쳐 받아도 무해하다.
- 중복 키: `(organization_id, provider, external_review_id)` UPSERT. 이미 수집한 리뷰를 중복 생성하지 않는다.
- **Airbnb 리뷰는 양방향이다.** `reviewer_role`이 게스트인 리뷰만 저장하고, `submitted=false` 또는
  `hidden=true`는 버린다. 걸러내지 않으면 호스트가 게스트에게 쓴 리뷰까지 수집된다.
- 매핑은 플랫폼마다 방식이 다르다. **Airbnb는 조회한 `roomId`로 객실이 확정**된다.
  **Booking.com은 객실 정보가 없고** `reservation_id`(Beds24 bookingId)를 같은 조직의
  `reservations.source_reservation_id`로 역조회해야 객실을 얻는다. 역조회 실패 시 객실을 추정하지 않고
  null로 둔다. **수집 시점에는 그대로 두고, 사후에 재연결한다** — 아래 「객실 재연결」 참조.
  (예약이 리뷰보다 늦게 도착하는 경우가 실제로 34건 있었다.)
- **Airbnb 예약 매칭 (2026-08-06 정정).** "Airbnb는 예약 ID가 없다"는 이전 기술은 틀렸다. 리뷰
  페이로드에 `reservation_confirmation_code`(예: `HMRWNK5RQW`)가 **2,214/2,214건 전부** 들어 있고,
  같은 코드가 우리 예약의 `raw_payload->>apiReference`에 저장돼 있다. 수집 시 조직 범위에서 이 코드로
  예약을 찾아 `reservation_id`와 `guest_display_name`을 채운다. **객실은 예약에서 가져오지 않는다** —
  조회한 `roomId`가 더 신뢰도 높은 확정값이다. 작성자 이름 자체는 Airbnb가 여전히 주지 않으며
  (`reviewer_id` 숫자 ID뿐), 표시되는 이름은 매칭된 예약의 값이다. 매칭 실패 시 둘 다 null.
  조회 비용은 `reservations_api_reference_idx` 부분 인덱스가 받친다.
- **예약 인덱스는 반드시 페이지네이션한다 (2026-08-06 수정).** PostgREST는 `range()` 없는 select를
  1000행에서 자른다. 예약이 2,000건을 넘는 조직에서 인덱스 절반이 비어 Booking.com 객실 역조회가
  조용히 실패하고 있었다. 수집 코드는 1000행 단위로 끝까지 읽는다.
- **수집은 조각내어 이어받는다 (2026-08-07 수정 — 그 전까지 크론이 한 번도 성공한 적 없음).**
  한 주기는 대상 71개를 순차 호출해 **실측 126초**가 걸리는데 Vercel Hobby 의 함수 상한은 **60초**다.
  단발 호출 버전은 예정 실행마다 `504 FUNCTION_INVOCATION_TIMEOUT` 으로 죽었고, 그때까지 DB 에
  쌓인 리뷰는 전부 로컬 수동 실행 결과였다.
  - 라우트가 `?offset=N&limit=M` 을 받아 **대상 M개(기본 12, 최대 40)** 만 처리하고
    `nextOrganizationId` / `nextOffset` / `done` 을 돌려준다. 워크플로가 `done` 까지 반복 호출한다.
  - **대상 정렬을 `id` 오름차순으로 고정했다.** PostgREST 는 정렬을 지정하지 않으면 순서를 보장하지
    않는다 — 호출마다 순서가 흔들리면 어떤 대상은 두 번 돌고 어떤 대상은 영영 안 돌아 **조용한
    누락**이 된다. 이어받기를 도입한 이상 정렬은 선택이 아니다.
  - 크레딧 부족으로 중단해도 `nextOffset` 은 **처리하지 못한 첫 대상**을 가리키므로 다음 주기가
    정확히 그 지점부터 이어받는다.
  - **총 Beds24 호출 수는 쪼개기 전과 같다**(호출 수 = 대상 수). 크레딧이 늘지 않는다.
  - 검증(2026-08-07): `offset=0,limit=2` → `nextOffset=2` / `offset=2,limit=2` → `nextOffset=4`(다른
    객실 처리 확인) / `offset=999` → `requests=0, nextOffset=null`(헛호출 없음).
- API 비용 통제: 응답 헤더 `x-request-cost`, `x-five-min-limit-remaining`,
  `x-five-min-limit-resets-in`을 수집 로그에 남긴다. 여유 크레딧이 낮으면 남은 대상을 다음 주기로
  미루고(중단 지점을 다음 주기가 이어받는다), 예약 웹훅 처리보다 우선하지 않는다.
  **이 이름은 2026-08-07에 정정한 것이다** — 그 전까지 코드와 이 문서가 함께 틀린 이름을 쓰고 있어
  저크레딧 가드가 한 번도 발동하지 않았다. 아래 「크레딧 헤더 이름이 틀려 있었다」 참조.
- 두 엔드포인트가 Beta/Alpha이므로 `raw_payload`를 항상 보존하고, 파싱 실패는 해당 리뷰 1건만 건너뛰고
  나머지 수집을 계속한다.
- 보안: API 토큰은 서버 전용 환경변수에서 재사용한다. 브라우저 요청, 클라이언트 로그, 문서에 토큰을 노출하지 않는다.

#### 수집 트리거 (구현 2026-08-04)

수집 로직은 `src/lib/beds24/reviews-sync.ts`의 `syncOrganizationReviews()`이고, 실행 경로는 두 개다.

| | 프로덕션 cron | 로컬 dev |
|---|---|---|
| 경로 | `GET/POST /api/beds24/reviews-sync` | `GET/POST /api/dev/beds24/sync-reviews` |
| 인증 | `Authorization: Bearer <CRON_SECRET>` (Vercel Cron 자동). 수동 실행은 `BEDS24_WEBHOOK_SECRET`을 `x-beds24-webhook-secret` 헤더/`?secret=`로 폴백 — **`/api/beds24/reconcile`과 동일 규약** | `ENABLE_LOCAL_DEV_TOOLS=true` + localhost + `BEDS24_WEBHOOK_SECRET` |
| 대상 | `organizationId` 미지정 시 `status='active'` 전 조직 | `organizationId` **필수** |
| 수집 창 | Booking 기본 30일, `?full=1`이면 730일 (Airbnb는 항상 전량) | `?sinceDays=N`(1–365) |

- **스케줄: 하루 1회 아침 8시 — GitHub Actions** (`.github/workflows/beds24-reviews-sync.yml`,
  `5 23 * * *` UTC = **08:05 Asia/Tokyo**). 하루 1회로 충분한 이유는 리뷰가 체크아웃 며칠 뒤에
  달려 실시간성이 필요 없고, Airbnb 50건 상한에 하루 만에 도달할 일도 없기 때문이다. `:05`인 것은
  Vercel task-reminder cron(23:00 UTC)과 reconcile(매 6시간 `:13`)을 피해 크레딧 창이 겹치지 않게
  하기 위해서다. **Vercel Cron을 쓰지 않는다.** 이유가 둘이다:
  (1) 이 프로젝트는 무료 Hobby 플랜이라 cron이 최대 2개·하루 1회로 제한되는데 그 두 자리는
  reconcile과 task reminders가 이미 쓰고 있고, 애초에 "하루 2회"를 표현할 수 없다.
  (2) 2026-07-22에 Vercel cron이 며칠간 아예 발화하지 않아 예약 5일치가 조용히 누락된 전례가 있다
  (`.github/workflows/beds24-reconcile.yml`, `docs/planning/01-decision-log.md`). 그래서 새 정기 작업은
  처음부터 외부 트리거로 건다. 수동 실행은 GitHub Actions의 `workflow_dispatch`(전량 수집은 `full` 입력)
  또는 아래 curl. 초기 도입이나 누락 복구는 `?full=1`로 Booking.com을 730일까지 다시 훑는다.
  UPSERT라 반복 실행은 무해하다.
- 두 시크릿이 모두 미설정이면 프로덕션 엔드포인트는 404(닫힘), 시크릿이 틀리면 403이다.
- `BEDS24_SYNC_PAUSED`가 켜져 있으면 인증 이전에 아무 호출도 하지 않고 `202 {ok:true, paused:true}`.
- 조직 단위로 격리해 실행한다. 한 조직이 실패해도 나머지는 계속 처리하고 실패는 응답 `failures[]`에 모인다
  (부분 실패 시 HTTP 207).
- 응답에 `creditsRemaining`과 `stoppedEarly`를 싣는다. 잔여 크레딧이 임계치 아래로 떨어져 `stoppedEarly`가
  참이 되면 남은 조직은 처리하지 않고 다음 주기가 이어받는다.
- 응답과 로그에는 토큰·시크릿을 절대 싣지 않는다. 수동 실행 예:
  `curl "$APP_URL/api/beds24/reviews-sync?full=1" -H "Authorization: Bearer $CRON_SECRET"`

위 수집은 외부 리뷰를 자동으로 `customer_complaints`로 만들지 않는다. 운영자가 필요할 때만 수동
컴플레인으로 전환·연결한다. 리뷰는 점수와 무관하게 전량 저장하며 위험도(Airbnb ≤3, Booking ≤7.0, 경계
포함)는 서버 계산 분류일 뿐 수집 필터가 아니다. 상세 제품 계약은
`docs/product/25-complaint-workflow.md`를 따른다.

## Company-Specific Active Room Rule

This is not a Beds24 platform rule. It is an internal StayOps/company operating rule and must be applied when importing room data.

Background:

- Some buildings have two different Beds24 room IDs for what the staff considers the same building/room set.
- Across the year, one room ID can be treated as active for a period while the other room ID is treated as inactive.
- We must only import rooms from the currently active room ID when building internal room/property data.

Active vs inactive rule:

- Use the minimum stay value from Beds24 as the discriminator.
- If the minimum stay is `50 nights or more`, that room ID must be treated as an **inactive room ID** for that period.
- If the minimum stay is a normal operational value such as `1`, `2`, or `3` nights, that room ID can be treated as the **active room ID** for that period.

Import rule:

- StayOps room/property sync must ignore room IDs marked inactive by this internal rule.
- Reservation calendar room axis, empty-room counts, and room master data should only use the active room ID set.
- Future Beds24 sync code must keep this rule configurable/documented because it is a company-specific convention, not a Beds24 guarantee.

Implementation (2026-05-24):

- `BEDS24_INACTIVE_MIN_STAY_THRESHOLD = 50` constant in `src/lib/rooms.ts`.
- `isInactiveBeds24Room(minimumStay)` and `getActiveRoomLabels(organizationId, supabase)` in the same file.
- `rooms.external_minimum_stay int` column stores the Beds24 minimum stay for each room row.
- Safety rule in the query layer (`getActiveRoomLabels` / `getActiveRoomCatalog`):
  - Non-Beds24 rooms: always included if `status = 'active'`
  - Beds24 rooms with `external_minimum_stay >= 50`: **excluded** (long-stay/inactive listing)
  - Beds24 rooms with `external_minimum_stay < 50`: included
  - Beds24 rooms with `external_minimum_stay = NULL`: **included (active)** as of 2026-06-18.
    Rationale: webhook payloads do not carry minimumStay, so a freshly-synced room would
    otherwise be hidden — and its reservations dropped from the calendar — until a separate
    inventory sync runs. Unknown min-stay must never hide a real room; only an explicit
    `>= 50` marks a room inactive.
- Room sync is now live in `src/lib/beds24/room-sync.ts`:
  - `classifyBeds24Room(null | number)` — **null → active** (2026-06-18), >= 50 → inactive, 1..49 → active
  - `extractBeds24RoomSyncFields(payload)` — multi-key alias extraction for minimumStay and room fields
  - `syncBeds24PropertyAndRoom(organizationId, fields, supabase)` — property + room upsert
- The Beds24 webhook (`src/app/api/beds24/webhook/route.ts`) now calls `syncBeds24PropertyAndRoom` on every booking event before the reservation upsert.
- Property upsert key:
  - prefer `(organization_id, external_provider, external_property_id)` when Beds24 property ID is present
  - fall back to `(organization_id, name)` only when the payload omits `external_property_id`
- Room upsert key: `(organization_id, room_label)` unique constraint. Rotating room ID scenario: room_label stays stable, external_room_id and external_minimum_stay are updated in place.
- Inactive rooms are stored with `status = 'inactive'` for traceability (not omitted).
- First valid webhook arrival automatically creates the room master rows.
- Calendar authoritative mode activates once **classified** room master rows exist.
- Beds24 room rows created only from booking webhooks remain unclassified because booking webhooks do not include `minimumStay`.
- If all classified rows are inactive, the calendar stays in authoritative zero-room mode instead of falling back to reservation-observed rooms.

### Beds24 v2 Booking Webhook Field Names (Verified / Updated through 2026-06-02)

Beds24 v2 uses different field naming from v1 and other generic webhook formats.

| Beds24 v2 field | Type | Meaning | Notes |
|---|---|---|---|
| `bookId` | int | Booking ID | also: `apiReference` |
| `propId` | int | Property ID | also: `propertyId` |
| `propName` | string | Property name | may be absent |
| `unitId` | int | Unit/room ID | also: `roomId` |
| `unitName` | string | Unit/room name | may be absent |
| `firstNight` | string | First night (YYYY-MM-DD) | = check-in date |
| `lastNight` | string | Last night (YYYY-MM-DD) | **≠ check-out**; checkout = lastNight + 1 day |
| `referer` | string | Channel/source | "Booking.com", "Airbnb", "Direct", etc. |
| `guestFirstName` | string | Guest first name | also: `firstName` |
| `guestLastName` | string | Guest last name | also: `lastName` |
| `status` | int or string | Booking status | normalized by `resolveReservationStatusFromBeds24Record()` |
| `numAdult` | int | Adult count | stored in `reservations.raw_payload`, exposed to calendar UI via derived guest-count parsing |
| `guestPhone` | string | Phone number | stored in `reservations.raw_payload`, exposed to calendar UI via derived phone parsing |

Critical date conversion rule (implemented in `lastNightToCheckout()`):

```
check_out_date = lastNight + 1 calendar day
```

- `lastNight = "2026-06-04"` → `check_out_date = "2026-06-05"`
- Parsed as UTC to avoid local-timezone drift (regex `YYYY-MM-DD`, then `Date.UTC(y, m-1, d+1)`)
- Without this conversion, check_out_date is 1 day early → occupancy calculations incorrect

### minimumStay Gap: Not Available in Booking Webhook

`minimumStay` is a **room inventory setting** in Beds24. In the current StayOps implementation it can be sourced from:

```txt
GET /v2/properties?includeAllRooms=true
  -> data[].roomTypes[].minStay
```

Fallback source kept in code for future/date-specific expansion:

```
GET /v2/inventory/rooms/calendar?propId={propId}&start={date}&end={date}
```

It is **not included** in booking webhook payloads.

Verification update (2026-05-25):

- Real Beds24 `properties?includeAllRooms=true` responses contain `roomTypes[].id` and `roomTypes[].minStay`.
- Real `inventory/rooms/calendar` calls are currently returning room rows with empty `calendar: []` for the tested same-day request, so they are not yet sufficient on their own for authoritative classification.
- StayOps now uses `properties?includeAllRooms=true` as the primary minimum-stay sync source and keeps `inventory/rooms/calendar` as a fallback for future/date-specific refinement.

Booking room-identity correction (2026-05-26, extended 2026-06-02):

- Real `/bookings` responses in the connected account include the joinable Beds24 room key in `roomId`.
- `unitId` should be treated as a local unit index / fallback-only field, not as the primary join key to `rooms.external_room_id`.
- Historical missing-reservation-bar incidents were caused by storing reservations with fallback labels such as `"1"` after parsing `unitId` too aggressively.
- Recovery/backfill and webhook room resolution therefore:
  - prefer `roomId` / `room_id` when resolving Beds24 room identity
  - keep `unitId` / `unit_id` as fallback only
  - repair all Beds24-origin raw payload rows regardless of `reservations.source`, because real rows are stored with channel names like `Booking.com` and `Airbnb`
  - must distinguish between:
    - internal room identity (`canonicalRoomLabel`, used for authoritative matching)
    - display row label (`displayRoomLabel`, used by the mobile calendar row axis)

Arakicho room-label policy (2026-06-02):

- Internal Arakicho room keys preserve distinct unit identities such as `301`, `301_2`, `A301`, `A301_2`.
- The mobile calendar display layer strips numeric suffixes like `_2` for row presentation only:
  - `402` and `402_2` share one display row `402`
  - `A301` and `A301_2` share one display row `A301`
  - `A301` and `301` remain distinct because the letter prefix changes the real unit identity
- Current implementation:
  - `src/lib/room-label-normalization.ts`
    - `normalizeArakichoRoomKey()`
    - `getCanonicalRoomLabel()`
    - `getDisplayRoomLabel()`
  - `src/lib/rooms.ts` now carries both `canonicalRoomLabel` and `displayRoomLabel`
  - `src/app/mobile/calendar/page.tsx` maps reservations to display rows via `getDisplayRoomLabel()`

Reservation coverage correction (2026-05-26):

- The reservation backfill must load the **current month + next month operational overlap**, not just bookings that arrive inside the window.
- Backfill query strategy now uses an overlap-style request:
  - `arrivalTo={windowEndExclusive}`
  - `departureFrom={windowStart}`
- This captures reservations that started before the month but are still staying during the current operating window.
- Real `/bookings` responses are paginated:
  - envelope includes `pages.nextPageExists`
  - envelope includes `pages.nextPageLink`
- Backfill must follow `nextPageLink` until exhaustion; stopping at the first page truncates the result set at 100 bookings and under-populates the calendar.

### Webhook Processing Update (2026-06-02)

Webhook processing is now split into shared helpers instead of keeping all logic inside the route file:

- `src/app/api/beds24/webhook/route.ts`
  - verifies secret
  - parses JSON body
  - extracts one or more booking candidates
  - delegates each booking to `processBeds24WebhookBooking()`
- `src/lib/beds24/booking-payload.ts`
  - `extractBeds24BookingCandidates()` for strict backfill `/bookings` responses
  - `extractBeds24WebhookBookingCandidates()` for relaxed webhook parsing
  - sparse cancellation payloads are accepted when they carry a booking ID plus cancellation signals
- `src/lib/beds24/process-webhook-booking.ts`
  - shared single-booking webhook processor
  - room sync + inventory sync
  - cancelled-booking consistency handling
- `src/lib/beds24/reservation-lookup.ts`
  - source-agnostic original-booking lookup
  - `cancelReservationRowsByOriginalBookingId()`
  - `finalizeCancelledBookingConsistency()`

Cancellation consistency rule (current implementation):

- Booking identity is anchored on the original Beds24 booking ID (`toOriginalReservationId()`), not on the normalized channel source string.
- Cancellation handling is source-agnostic and must update all matching rows for:
  - exact original ID
  - `originalId::room::*` assignment-suffixed rows
- Sparse cancellation payloads may omit stay dates; if local rows already exist, cancellation should still succeed.
- If no local row exists and the payload is too sparse to create a meaningful cancelled row, the webhook returns a non-error "no local row" outcome instead of polluting reservations with incomplete duplicates.

### Token Handling Update (2026-05-25)

Beds24 inventory sync now supports two server-side auth paths:

- `BEDS24_API_TOKEN`: direct short-lived access token
- `BEDS24_API_REFRESH_TOKEN`: long-lived refresh token exchanged through `GET /v2/authentication/token`

StayOps preference:

- local/manual verification can use a direct `BEDS24_API_TOKEN`
- long-running environments should prefer `BEDS24_API_REFRESH_TOKEN`
- refreshed access tokens are cached in-memory until near expiry
- existing Beds24-linked properties can be reclassified without waiting for a fresh booking webhook:
  - dev-only route: `POST /api/dev/beds24/backfill-inventory`
  - guardrails: local development only, `ENABLE_LOCAL_DEV_TOOLS=true`, localhost-only, `x-beds24-webhook-secret` required
  - optional filter: `?organizationId=<uuid>`
  - helper: `backfillBeds24InventoryMinimumStay()` iterates existing Beds24 property rows and reuses the same minimum-stay sync logic
- full room-master bootstrap for **all buildings and all rooms** is also available:
  - dev-only route: `POST /api/dev/beds24/backfill-room-master`
  - source: `GET /properties?includeAllRooms=true`
  - behavior: upserts all Beds24 properties and all roomTypes into `properties`/`rooms` before reservation/webhook traffic
  - default target: all active organizations in StayOps (optionally scope with `?organizationId=<uuid>`)
- dev helper script:
  - `scripts/dev/beds24-backfill-inventory.sh`
  - example: `BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-inventory.sh`
  - `scripts/dev/beds24-backfill-room-master.sh`
  - example: `BEDS24_WEBHOOK_SECRET=... bash scripts/dev/beds24-backfill-room-master.sh`

Failure semantics now exposed in sync result:

- invalid direct access token -> `inventory:http-401`
- invalid refresh token -> `inventory:refresh-token-invalid`
- no inventory rows extracted -> `inventory:no-minimum-stay-rows`

Impact:

- Rooms synced via booking webhooks always have `external_minimum_stay = NULL`
- `classifyBeds24Room(null) = "active"` as of 2026-06-18 (was "inactive"). Webhook-created
  rooms are now immediately active so their reservations render; a later inventory sync can
  still flip them to inactive only if `minimumStay >= 50`.
- `getActiveRoomCatalog()` now counts any existing room row as classified (authoritative mode),
  and includes null-minStay beds24 rooms as active.

Required follow-up to activate authoritative mode:

1. Call `GET /v2/inventory/rooms/calendar` (today-basis, periodically or on demand)
2. For each room row, extract `minimumStay`
3. `UPDATE rooms SET external_minimum_stay = ?, status = active|inactive WHERE organization_id = ? AND external_room_id = ?`
4. After this, `getActiveRoomLabels()` returns active rooms → calendar switches automatically

Implementation update (2026-05-24, same day):

- `src/lib/beds24/inventory-sync.ts` now attempts a current-date inventory sync automatically after each booking webhook.
- Query strategy:
  - `GET /inventory/rooms/calendar?propId={propId}&from={today}&to={today}`
  - fallback query-key variants: `dateFrom/dateTo`, `start/end`
- Matching strategy:
  - inventory room rows are matched back to `rooms.external_room_id`
  - `external_minimum_stay` is updated in place
  - `status` is recomputed via `classifyBeds24Room(minimumStay)`
- Failure policy:
  - inventory sync failures do not block reservation upsert
  - webhook response now includes `inventorySync` metadata for local/dev verification

### Later Goal: Write Data

Writing data back to Beds24 should not be part of the first integration unless absolutely necessary.

Possible future write operations:

- Update internal notes
- Update booking-related operational status
- Create or modify booking data

These require careful permission, audit log, and error-handling design.

## Calendar Requirement

StayOps needs a calendar-style schedule view similar in spirit to TimeTree.

The calendar should help staff answer:

- Who is staying today?
- Which room/property is occupied?
- Which room/property is empty?
- Which guests check in today?
- Which guests check out today?
- Which guests are staying today?
- Which rooms/properties are empty today?
- Which rooms/properties need cleaning?
- Which reservations are connected to maintenance or special tasks?

Default stay time rules:

- Check-in time is fixed at 16:00.
- Check-out time is 10:00 by default.
- Early check-out can change the expected check-out time by about 1 to 3 hours.
- Early check-out changes are received by CS staff through guest communication and must be entered manually.

## Property Model Requirement

StayOps must support two accommodation structures:

### Multi-Room Building

Example:

- One hotel building
- Multiple rooms inside the building

### Standalone Property

Example:

- One Airbnb-style house
- The property itself acts like the bookable unit

## Internal Data Model Direction

StayOps should not directly depend on Beds24's external data shape everywhere in the app.

Recommended approach:

- Sync Beds24 data into internal tables
- Keep external IDs for mapping
- Use internal IDs in app features
- Keep sync metadata
- Prefer a backend sync layer rather than direct mobile-to-Beds24 calls

Example mapping fields:

```txt
externalProvider: "beds24"
externalPropertyId
externalRoomId
externalBookingId
externalChannel
lastSyncedAt
```

Additional mapping note:

- For buildings that rotate between two Beds24 room IDs, internal room master sync should store only the active room ID set for the current period.
- The inactive room ID set (minimum stay `>= 50`) should not be surfaced as active operational rooms in StayOps.

Reservation channel usage:

- Store the reservation source/channel when Beds24 provides it.
- Use the channel for calendar bar color mapping.
- Booking.com / Booking reservations should use a blue or blue-teal color family.
- Airbnb reservations should use a soft light pink color family.
- Direct/other channels should be mapped to a documented fallback color.

## Sync Strategy

Preferred strategy:

- Use Beds24 webhooks for reservation/booking change events.
- Avoid frequent polling because it can be less real-time and may increase server/API cost.
- Store only the reservation window needed for StayOps MVP.

Reservation window:

```txt
Current month + next 2 months
```

Fallback options:

- Manual refresh for admin/debug use
- Occasional reconciliation job if webhook delivery fails or data mismatch is suspected

Official research notes:

- Beds24 API V2 supports booking webhooks.
- Beds24 documentation recommends avoiding unnecessary high-frequency GET requests and using webhooks where appropriate.
- API calls should be kept to the minimum required for reasonable business usage.

## Key Risks

- API rate limits
- Data mismatch between Beds24 and internal app records
- Timezone handling
- Guest privacy
- Duplicate bookings
- Booking status changes
- Cancelled reservations
- Same-day check-in/check-out cleaning schedules
- Webhook delivery failure
- Webhook duplicate events
- Out-of-order webhook events
- Linked properties access can be disabled by default on Beds24 API tokens, which can silently omit buildings/reservations from API responses.

## Beds24 Token Scope Checklist (linked properties)

Beds24 API V2 linked properties are not guaranteed to be included by default in token access.

When creating or rotating a token, confirm all of the following are enabled:

- bookings
- bookings-personal
- inventory
- properties
- Allow linked properties

If reservation/building data is missing even though code paths are healthy, verify linked properties access first before debugging webhook/backfill code.

### Linked properties verification points (operational)

Use these checks right after token creation/rotation:

1. Call `GET /v2/properties?includeAllRooms=true` and confirm linked-building IDs/names are present.
2. Call bookings endpoint for the current operational overlap window and confirm reservations from linked buildings are returned.
3. Compare Beds24 dashboard building count vs API property count for the same account scope.
4. If API count is lower while webhook/backfill logs are healthy, treat token scope (`Allow linked properties`) as the primary suspect.

## Open Questions

- Should StayOps call Beds24 directly, or call the company's existing internal system?
- Which Beds24 API version is currently used by the internal system?
- Which data fields are already stored in the internal system?
- Is the existing Firebase project suitable for StayOps, or should StayOps use a separate Firebase project?
- Does the existing Node.js backend already expose internal APIs that StayOps can reuse?
- Should StayOps ignore the existing internal backend and build its own Beds24 sync pipeline?
- What exact Beds24 webhook events are available for the account/properties?
- Should we run a daily reconciliation job for current month + next 2 months?
- Do staff need offline access to calendar data?

## Reservation Visibility Rule

StayOps calendar should show only confirmed/valid reservations.

Cancelled reservations should be removed from the visible calendar and should not count as occupied.
- Which roles can see price/revenue information imported from Beds24?
- How should price/revenue fields be excluded from part-time staff views?

## 2026-05-26 Reservations Backfill (Current + Next Month)

- Added dev-only route: `POST /api/dev/beds24/backfill-reservations`
- Purpose: fetch real Beds24 bookings immediately (without waiting for webhook arrivals) and upsert into `reservations` for mobile calendar bars.
- Window policy: fixed to operational window (`current month start` -> `month after next start` exclusive).
- Guardrails: local development only, `ENABLE_LOCAL_DEV_TOOLS=true`, localhost-only, `x-beds24-webhook-secret` required.
- Script: `scripts/dev/beds24-backfill-reservations.sh`

## 2026-05-26 Reservation source canonicalization

- Dedup key remains the existing DB unique key:
  - `organization_id`
  - `source`
  - `source_reservation_id`
- For multi-room support, StayOps now stores a **room-assignment reservation key** in `source_reservation_id`:
  - `"{originalReservationId}::room::{room_label}"`
- UI surfaces must display the original reservation ID from raw payload (or the de-suffixed value), not the storage key.
- Beds24 channel strings can vary by casing/alias (`booking`, `Booking.com`, `API`, `airbnb`).
- Backfill + webhook now canonicalize source before reservation upsert:
  - `booking`, `booking.com`, `Booking.com` -> `Booking.com`
  - `airbnb`, `Airbnb` -> `Airbnb`
  - `api`, `API` -> `API`
  - others: trimmed original value
- This keeps future inserts stable for dedupe and UI channel labeling.

Canonical policy update (same day hardening):

- Known channels:
  - `booking`, `booking.com`, any casing -> `Booking.com`
  - `airbnb`, any casing -> `Airbnb`
  - `api`, any casing -> `API`
  - `direct`, any casing -> `Direct`
  - `agoda`, any casing -> `Agoda`
- Unknown channels:
  - trim + case normalization is applied so `foo`, `FOO`, `Foo` do not split dedupe keys.

## 2026-05-26 Webhook vs backfill responsibilities

- Webhook is the real-time path for reservation create/update/cancel events.
- Backfill is the correction path for:
  - initial load,
  - missing-data recovery,
  - operational overlap window re-sync (`current month + next month`, with overlap semantics).
- MVP policy: calendar correctness is not guaranteed by webhook-only delivery.
- Backfill is the reconciliation layer and must remain operational.

### Trust boundary (MVP)

- Trust webhook for event freshness (new/changed/cancelled reservation arrival timing).
- Trust backfill for completeness (gap fill and overlap-window consistency).
- Final calendar reliability in MVP = webhook + backfill together.
- Do not treat "webhook success only" as complete reservation coverage.

Operational troubleshooting order when reservations are missing:

1. Check token scope first (including linked properties).
2. Check webhook ingestion path (payload/secret/upsert logs).
3. Check backfill execution and overlap window result.
4. Compare Beds24 source booking payload with stored reservation source/id keys.

Quick fault isolation (webhook vs backfill):

- Symptom A: newest booking updates are delayed/missing -> inspect webhook first.
- Symptom B: older/overlap stays are missing while webhook is healthy -> inspect backfill window/pagination first.
- Symptom C: specific buildings are consistently absent in both paths -> inspect token scope (`Allow linked properties`) first.

## 2026-05-26 Multi-room reservation support

- Rare but valid Beds24 cases exist where one reservation ID appears on multiple room rows.
- Operational examples:
  - one guest occupies two or more rooms
  - the same reservation is shown on two room lines in the Beds24 room board
- StayOps must mirror this instead of collapsing the later room row over the earlier one.
- Reservation persistence is therefore room-assignment based:
  - one reservation ID may now be stored multiple times when `room_label` differs
  - webhook and backfill both derive a storage key per room assignment and save it into `source_reservation_id`
  - storage key format: `"{originalReservationId}::room::{room_label}"`
- Effect:
  - `301` and `401` can both exist for the same reservation ID
  - mobile overview room timeline no longer looks "missing" for multi-room reservations
  - list-style views may still require later UX dedupe/grouping policy if one guest spans multiple rooms

## 2026-05-26 Backfill pagination integrity + webhook room-label guard

- Backfill pagination integrity:
  - If any `nextPageLink` page fails (`http` error or request error), the run is no longer treated as success.
  - Partial-chain fetch is flagged as partial failure and exposed in result fields (`partial`, `failedPageUrl`, skipped reasons).
  - Dev backfill route now distinguishes `success`, `partial_failure`, and `no_data`.
- Webhook room-label guard:
  - Webhook no longer accepts numeric IDs (`unitId`/`roomId`) as room-label fallback sources.
  - Room-master sync receives display-label fields only; numeric ID-like labels are skipped to prevent `room_label = "1"` style pollution.
  - Reservation upsert remains enabled even when label resolution is unavailable, storing raw payload for later recovery.
- Recovery/backfill responsibility remains:
  - Recovery path still resolves room mapping by `roomId` first and `unitId` as fallback for historical repair.

## 2026-05-26 Beds24 reservation recovery fix

- Reservation backfill and repair routines must read `unitId`/`unit_id` as primary room identity keys for this Beds24 account.
- `roomId`-only recovery is insufficient because many real rows store `unitId` while `roomId` is absent.
- Re-running reservation backfill after this fix should repair historical rows whose `room_label` was incorrectly saved as `1` or property-level fallback text.

### Webhook-only operational freshness update (2026-05-26)

- StayOps now treats Beds24 booking webhooks as the primary production freshness path for reservation calendar updates.
- Reservation backfill remains available only as a manual/dev recovery tool, not as the normal operational source of freshness.
- Mobile calendar now subscribes to Supabase Realtime changes on `public.reservations` for the current organization and triggers a client `router.refresh()` when webhook-written rows change.
- To make this work in every environment, `public.reservations` must be present in the `supabase_realtime` publication.
- Migration added: `supabase/migrations/202605260002_enable_reservations_realtime.sql`.
- Expected behavior:
  - Beds24 webhook arrives -> reservation row upserted immediately
  - Supabase Realtime emits INSERT/UPDATE/DELETE
  - Open mobile calendar refreshes without manual page reload

### Cancellation propagation (webhook-main, verified 2026-05-26)

- `normalizeStatus()` in `src/app/api/beds24/webhook/route.ts` maps cancellation-family payloads to DB enum `cancelled`:
  - numeric `0`
  - text variants: `cancelled`, `canceled`, `cancel`
  - channel-style variants containing cancellation text (e.g. `Booking cancelled by guest`)
- `no_show` remains mapped to `no_show` (policy unchanged). It is not auto-converted to `cancelled`.
- Cancel webhook update behavior:
  - primary path: regular upsert using `(organization_id, source, source_reservation_id)` with room-assignment key.
  - fallback path (critical for sparse cancel payloads): if status is cancelled, existing rows with the same original reservation ID are searched (`exact id` + `::room::`-suffixed keys) and updated to `status = cancelled`.
  - this prevents duplicate/live rows when cancel payload omits room label / room id.
- Calendar visibility rule remains:
  - cancelled rows may remain in DB history,
  - mobile calendar query excludes them with `.neq("status", "cancelled")`.
- Realtime behavior:
  - webhook writes produce UPDATE/UPSERT changes in `public.reservations`,
  - mobile calendar subscribes with `event: "*"` and debounced `router.refresh()`,
  - hidden-tab updates are queued and refreshed immediately when the tab becomes visible.
## Temporary Sync Pause (2026-07-10, historical)

- Beds24 webhook/API ingestion is temporarily paused while the external webhook connection is
  intentionally disconnected.
- StayOps now short-circuits the production webhook and reconcile endpoints when
  `BEDS24_SYNC_PAUSED` is enabled.
- Existing reservation rows remain readable in the reservation calendar. The pause only affects new
  ingestion / reconciliation.
- Re-enable this only when the Beds24 webhook/API path is explicitly restored.

Status update:

- This section is historical only. Production was re-enabled on 2026-07-17 with
  `BEDS24_SYNC_PAUSED=false`, so live webhook ingestion and reconcile are currently active.

#### 휴면 룸타입 제외 (2026-08-07)

같은 물리 객실을 두 어카운트가 반년씩 번갈아 쓰는 구조라 **항상 절반이 비활성**이다. 비활성
어카운트는 예약이 안 들어오니 새 리뷰도 생기지 않는데, 매 주기 부르느라 크레딧의 약 30%가
낭비되고 있었다(실측 2026-08-07: 룸타입 64개 중 21개).

**판정 규칙 — 두 조건을 AND 로 건다.**

> 비활성 어카운트(`external_minimum_stay >= 50`) **이면서** 최근 **90일** 안에 리뷰가 하나도
> 없는 룸타입만 제외한다.

- **«마지막 리뷰가 오래됨» 하나만으로는 안 된다.** 폴링을 끊으면 새 리뷰를 볼 방법이 없어 한 번
  빠진 대상이 영원히 돌아오지 못한다. 실제로 `Arakicho A / 701` 은 **활성인데도** Airbnb 리뷰가
  314일째 없다(예약이 Booking 쪽으로만 들어온다). 이런 방을 빼면 나중에 Airbnb 리뷰가 달려도
  영영 못 가져온다.
- **`external_minimum_stay` 는 웹훅이 갱신한다** — 리뷰 폴링과 무관하다. 어카운트가 다시
  활성화되면 그 즉시 대상에 복귀한다. 이것이 진짜 자기 교정이다.
- 90일인 이유: 실측에서 제외 대상 21개의 마지막 리뷰가 모두 **120~273일 전**이고, 비활성이지만
  아직 리뷰가 들어오는 중인 방(`Kabukicho / K803`, 76일)은 유지된다. tail 여유가 충분하다.
- 판정 근거를 얻는 조회가 실패하면 **아무것도 빼지 않는다.** 조회 실패로 수집이 조용히 줄어드는
  것이 이 최적화로 아끼는 크레딧보다 훨씬 비싸다.
- 제외한 룸타입은 응답의 `dormantTargets` 로 드러낸다. 조용히 빠지면 «수집이 되고 있다»는 착각을
  만든다 — `truncatedTargets` 와 같은 이유다.

검증(2026-08-07): 대상 **70 → 49**, 제외 21개 전부 비활성. `Arakicho A / 701`(활성)과
`Kabukicho / K803`(비활성·76일)은 유지됐다.

#### 수집 정지 감지 (2026-08-07)

2026-08-06~07, 리뷰 수집 크론이 **한 번도 성공한 적이 없는데 이틀간 아무도 몰랐다.** 워크플로는
빨간불이었고 DB 는 비어가고 있었지만 알아챌 장치가 없었다. 크론 자체를 고친 것과 별개로,
**멈춘 것을 알아채는 장치**를 붙인다.

- 엔드포인트 `GET/POST /api/beds24/reviews-sync/health` (인증은 reconcile 과 동일 규약).
  `max(external_reviews.updated_at)` 이 **2일** 이상 오래되면 `stale: true` 를 반환한다.
- **기본 신호는 워크플로 로그의 `::warning::` 이다.** Slack 은 선택 사항 —
  `SLACK_OPS_ALERT_WEBHOOK_URL` 을 설정한 경우에만 추가로 보낸다. 이 변수는 업무일지 웹훅과
  **다른 채널**이어야 한다: 업무일지 채널은 현장 직원이 쓰는 곳이라 시스템 경보를 받는 사람이
  할 수 있는 일이 없고 일지만 밀어 올린다. 대상이 다르면 채널도 달라야 한다.
- **점검은 수집 밖에 있어야 한다.** 수집이 안 도는 것이 문제인데 수집이 스스로 알릴 수는 없다.
  그래서 **reconcile 워크플로**(하루 4회, 63회 연속 성공)가 마지막 스텝에서 이걸 부른다.
  `if: always()` 라 reconcile 이 실패해도 점검은 돈다. Beds24 크레딧을 쓰지 않는다(DB 한 줄 조회).
- **새 테이블을 만들지 않았다.** `external_reviews_set_updated_at` 트리거가 upsert 마다
  `updated_at` 을 갱신하고, 수집은 받아온 리뷰를 전부 다시 upsert 하므로 한 주기라도 성공하면
  `max(updated_at)` 이 움직인다. 즉 «마지막으로 수집이 테이블에 닿은 시각»을 실행 로그 테이블
  없이 알 수 있다. 실제로 이번 장애를 이 신호로 진단했다 — **이미 검증된 방법**이다.
- 리뷰가 한 건도 없는 조직은 «오래됐다» 고 말할 수 없으므로 알리지 않는다(갓 도입한 조직을 매일
  깨우지 않는다).
- 알림 실패는 본 작업을 실패로 만들지 않는다. 사유를 응답의 `notified` 에 실어 드러낸다.
- Slack 문구는 사전을 쓰지 않는다 — 화면이 아니라 운영 채널로 나가고, 크론 컨텍스트에는 «보는
  사람»이 없어 로케일을 고를 근거가 없다. `i18n-ignore` 사유를 코드에 남겼다.

#### 객실 재연결 (2026-08-07)

Airbnb 리뷰는 `roomId` 로 조회하므로 객실이 처음부터 확정이다(실측 0/2,215 미연결). **Booking.com
은 건물 단위(`propertyId`)로만 조회**돼서 객실을 예약을 거쳐 역추적해야 하는데, 그 역추적이
**165/253(65.2%)** 실패하고 있었다.

리뷰 payload 자체에는 객실 정보가 **없다.** 전 키 실측:
`url / reply / content / scoring / reviewer / review_id / reservation_id / created_timestamp /
last_change_timestamp`. 있는 건 예약번호뿐이다.

**원인은 둘이었고 성격이 다르다.**

1. **예약이 우리 DB에 없다 (128건).** `reservations` 는 «당월 + 향후 2개월» 창으로만 백필돼
   체크인 2026-04-22 이전 예약이 아예 없다. 그래서 2026-04 이전 Booking 리뷰는 매핑률이 0% 였다.
2. **리뷰가 예약보다 먼저 도착했다 (34건).** 수집 시점엔 예약이 없어 null 로 저장됐는데, Booking
   리뷰는 `from=최근날짜` 로만 다시 조회되므로 **오래된 리뷰는 파이프라인에 다시 올라오지 않는다.**
   재수집으로는 영영 안 채워진다 — 그래서 **재연결이 수집과 별개로 있어야 한다.**

**해법 — `src/lib/beds24/review-room-relink.ts` 한 함수.**

- 먼저 DB 안에서 푼다(크레딧 0): 리뷰의 `source_reservation_id` → 예약 → `room_label` → 객실.
- 그래도 예약을 못 찾으면 Beds24 `GET /bookings?apiReference=…` 로 조회해 `roomId` 를 얻고
  `rooms.external_room_id` 로 매핑한다. **`apiReference` 는 한 요청에 여러 개를 실을 수 있다** —
  실측 40개 배치 = 1크레딧. 128건 전수 조회가 **4요청·4크레딧**이었다.
- 같은 Beds24 객실이 우리 쪽 여러 행에 매핑돼 있으면(계정 2개인 객실) 리뷰의 건물과 일치하는
  행을 쓰고, 그래도 못 좁히면 **추정하지 않는다.**
- 한 예약이 여러 객실에 걸치면 객실은 비우고 예약 링크만 채운다. 하나를 고르는 순간 **틀린 객실에
  문제를 귀속**시키게 된다.

**상시 경로 vs 일회성 백필은 같은 함수다.** 두 벌로 만들면 한쪽만 고쳐진다. 차이는 인자뿐이다.

| | 호출 | `lookupMaxAgeDays` | 요청 상한 |
|---|---|---|---|
| 상시 | `syncOrganizationReviews` 끝(조직의 **마지막 조각**에서만) | 45 | 3 |
| 일회성 | `POST /api/beds24/reviews-sync/relink` | 제한 없음 | 40 |

- **나이 제한이 크레딧 안전장치다.** 영영 못 찾는 건(Beds24 에서 삭제된 예약 등)이 매일 크레딧을
  태우지 않도록, 상태 컬럼을 새로 만드는 대신 **나이로 스스로 빠지게** 했다. 45일이면 예약이 들어올
  시간으로 충분하고, 그때까지 못 찾았다면 앞으로도 못 찾는다.
- 조직의 **마지막 조각에서만** 도는 이유: 조각마다 돌면 예약 인덱스를 매번 다시 읽고 조회도
  중복된다. 재연결은 «수집이 한 바퀴 끝난 뒤» 한 번이면 충분하다.
- 라우트의 플래그는 `skipLookup` 이다. **`dryRun` 이라 부르지 않는다** — 이 경로도 DB 는 쓴다.
  `dryRun` 이라 이름 붙이면 «아무것도 안 바뀐다»로 읽혀 미리보기인 줄 알고 눌렀다가 데이터가
  바뀌는 사고가 난다.

**결과 (2026-08-07 실행):** 165 → **4건**. 남은 4건은 다객실 예약 3 + Beds24 에도 없는 1.
잘못 붙은 건 0(리뷰 건물 ≠ 객실 건물 0건, 라벨 불일치 0건).

#### 크레딧 헤더 이름이 틀려 있었다 (2026-08-07)

같은 작업 중에 발견했다. 코드가 찾던 헤더 이름은

    X-RequestCost / X-FiveMinCreditLimit-Remaining / X-FiveMinCreditLimit-ResetsIn

인데 Beds24 가 실제로 내려주는 이름은

    x-request-cost / x-five-min-limit-remaining / x-five-min-limit-resets-in

이다(bookings·채널 리뷰 엔드포인트 동일하게 실측). 헤더 조회는 대소문자를 가리지 않지만
**이름 자체가 다르다.** 그래서 `creditsRemaining` 은 **항상 null** 이었고,
`MIN_REMAINING_CREDITS` 저크레딧 가드는 **한 번도 발동한 적이 없다.** 안전밸브가 달려 있는 줄
알았지 실제로는 닫혀 있었다.

`src/lib/beds24/credits.ts` 로 한 곳에 모으고 옛 이름도 같이 읽는다(비용 0의 보험).
`Number(null) === 0` 이라 «헤더 없음»과 «잔여 0»을 반드시 구분해야 한다 — 구분을 빼먹으면
잔여가 0으로 읽혀 수집이 통째로 멈춘다.
