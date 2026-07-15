# Lost and Found Workflow

## Purpose

The lost and found workflow manages items found in rooms/properties from registration to storage, disposal scheduling, and final disposal.

The company generally stores lost items for 2 weeks. Expensive or important items may sometimes be stored longer.

## Required Fields

`lost_items` 실제 컬럼 (권위 있는 정의는 `docs/engineering/04-data-model.md`):

```txt
id
organization_id
cleaning_session_id        -- 청소 타이머에서 등록 시 연동 (nullable)
reported_by_user_id        -- 등록자
room_label                 -- free text (properties/rooms FK 아님, 청소 세션과 동일 패턴)
property_name              -- free text (nullable)
item_name
memo                       -- 등록 메모
image_urls                 -- 등록 사진 (≤5)
found_at
reservation_id             -- 예약 연동 (nullable, 서버 재검증 후 스냅샷)
guest_name                 -- 예약 연동 스냅샷 (nullable)
status                     -- lost_item_status (registered/stored/disposal_scheduled/disposed/returned)
handling_memo              -- 현장 처리 메모 (2026-07-15 신설). 등록 memo와 별개
handling_image_urls        -- 처리 증빙 사진 (≤5, 2026-07-15 신설)
handled_at                 -- 마지막 처리 시각 (2026-07-15 신설)
handled_by                 -- 마지막 처리자 (2026-07-15 신설)
handled_by_admin           -- 어드민 예외 개입 여부 (2026-07-15 신설, default false)
created_at
updated_at
```

> 과거 판에 있던 `property_id`/`room_id`/`photos`/`retrieval_status`/`retrieved_*`/`dispose_after`/
> `scheduled_for_disposal_at`/`disposed_at`는 코드·마이그레이션 어디에도 없는 가공의 필드였다.
> (2026-07-15 정정) 반환은 별도 `retrieved_*` 컬럼이 아니라 `status = 'returned'` + `handled_*`로 남는다.

## Field Meaning

### Found Property / Room

Required.

The item must be connected to the property and, when applicable, the room/unit where it was found.

Entry behavior:

- If the lost item is registered from an active cleaning timer, property and room/unit should be auto-filled from the active cleaning room.
- If the lost item is registered from the Lost and Found tab directly, the user must select property and room/unit.
- When property/room is auto-filled from cleaning, show a final confirmation popup asking the user to confirm the room is correct.
- If the auto-filled room is wrong, provide a pencil/edit icon so the user can correct the property/room before submitting.

### Item Name

Required.

Short name of the found item.

### Photos

Optional but strongly recommended.

Photos help identify the item later when a guest contacts the team.

Limit:

- Maximum 5 photos per lost item.

Compression:

- Resize long edge to max 1600px.
- Use JPEG/WebP compression around 70-80% quality.

### Found Date / Time

Required, auto-filled.

The found date/time should be automatically filled based on the registration time.

Users should not need to manually enter found date/time during the normal quick flow.

### Reported By

Required, auto-filled.

The app should automatically store the staff member who registered the item.

### Guest / Reservation Link

Required when a likely reservation can be inferred, auto-suggested.

The app should automatically suggest the guest/reservation connected to the most relevant recent checkout for the selected room.

Rules:

- If registering from an active cleaning timer, use the guest/reservation from that room's checkout for the cleaning date when available.
- If registering from the Lost and Found tab directly, after the user selects property/room, show the most recent checkout guest for that room.
- The suggested guest/reservation should be visible to the user for confirmation.
- If the suggested guest/reservation is wrong or unavailable, the user should be able to edit or clear the link.

Implementation note (2026-07-09):
- The reservation-calendar linked entry is implemented via
  `/mobile/lost-found/new?reservationId=...`.
- In that path, the form opens with reservation-linked building / room / guest context already
  filled and stores optional `property_name`, `reservation_id`, and `guest_name` snapshots.
- The standalone direct lost-found form does **not yet** auto-suggest the latest checkout after
  room selection; that broader suggestion flow remains future work.

### Retrieval

The workflow needs retrieval tracking.

Retrieval means the customer/guest has picked up or received the item.

It does not mean internal staff collected the item from the room.

Possible fields:

```txt
retrieval_status
retrieved_at
retrieved_by
retrieval_memo
```

When retrieval is completed:

- The item should no longer be included in automatic disposal scheduling.
- The retrieval date/time should be saved.
- The staff member who processed retrieval should be saved.

No additional required retrieval form is needed for the first version.

Reason:

- The person who registered the lost item and the person who completes retrieval may be different.
- The staff member who physically gives the item to the guest or ships it should simply mark it as retrieved.
- Guest pickup and shipping are both common, but do not require separate mandatory fields in the MVP.
- Extra details can be written in memo if needed.

### Memo

Optional.

Used for internal notes, guest contact notes, or special handling instructions.

## Statuses

Confirmed statuses (5 — `returned` added 2026-07-15):

- registered
- stored
- disposal_scheduled
- disposed
- **returned** ← 신규. 손님에게 전달을 마친 종결 상태.

Display labels:

```txt
registered: 접수됨 / 受付済み / Registered
stored: 보관중 / 保管中 / Stored
disposal_scheduled: 폐기예정 / 廃棄予定 / Disposal Scheduled
disposed: 폐기됨 / 廃棄済み / Disposed
returned: 반환완료 / 返却済み / Returned
```

`returned`의 배경: 기존 4상태는 "아무도 안 찾아가서 결국 폐기한다" 흐름만 담고 있어, 물건이
**주인에게 돌아가는 결말**을 담을 상태가 없었다. 수리·점검의 종결(`closed`)에 대응하는 개념으로
`returned`를 추가했다. DB enum은 값을 **추가**만 한다(제거 없음) — 마이그레이션
`202607170001_lostfound_return.sql`.

**종결(terminal) 상태 = `returned` 또는 `disposed`.** 이 두 상태에서는 상세 화면이 처리 블록 대신
처리 이력(처리자·시각·메모·사진)을 보여준다. `registered`/`stored`/`disposal_scheduled`는 진행
상태다. 읽기 전용 진행바(폐기 경로)는 `returned`를 제외한 4단계만 표시한다 — 반환은 이 선형 흐름
밖의 종결이기 때문.

## Storage Policy

Default company policy:

- Lost items are generally stored for 2 weeks.
- Expensive or important items may be stored longer by manager decision.
- If no retrieval or action happens, the system should automatically move old items toward disposal workflow.

## Automation Policy

Requested automation:

```txt
After registration, if customer retrieval does not happen:
  After 30 days -> move to disposal_scheduled
  After an additional period with no action -> automatically delete or finalize
```

Recommended safer implementation:

```txt
After 30 days -> disposal_scheduled
After additional TBD days -> disposed or archived
Do not hard-delete immediately unless legally/operationally required
```

Reason:

- Hard deletion can remove evidence needed for disputes or guest inquiries.
- A disposed/archived record keeps history while hiding it from normal daily lists.

## Creation Entry Points

Lost items can be created from:

- Lost and Found tab
- Quick action on mobile home
- Active cleaning timer
- Admin web

> **Implementation note (2026-05-21):** Linked-mode creation and list/status management implemented.
> - `/mobile/lost-found/new` accepts optional `?sessionId=`. Session validated server-side (same user, same org); invalid `sessionId` shows explicit error state (no form render); login redirect preserves `sessionId` in `next`.
> - Client-side required-field validation blocks confirmation sheet if `item_name` is empty; inline error shown below the field.
> - `/mobile/requests` shows current user's own lost items and maintenance reports in a combined view with color-coded status badges.
> - `/admin/lost-found` lists all org-scoped lost items with room, item name, status, reporter, and found-at columns; rows link to detail pages.
> - `/admin/lost-found/[id]` shows full item detail and a status-change form (select + submit). Status updates validated server-side (role + org ownership); success/error banners driven by `?statusUpdated` / `?error` search params.

## Visibility

All users can create and view lost item records.

The Requests tab should include:

- All lost item records
- My registered lost item records

Default mobile behavior:

- `All` scope should be the default list mode in `/mobile/requests`.
- `My registered lost item records` should be available via an explicit scope filter/toggle.

## 설계 원칙 — 감시 + 이력 + 예외 개입 (확정, 2026-07-15)

분실물은 수리·점검과 **동일한 매커니즘**을 쓴다. 습득물은 결국 현장이 손에 쥐고 있으므로,
**현장이 모바일에서 직접 처리**한다(상태 변경 · 처리 메모 · 증빙 사진 전부 모바일).

- **배정 개념이 없다.** 등록자와 무관하게 **누구나(파트타임 제외) 처리 가능** — 특히 반환은 손님에게
  물건을 넘긴 사람이 그대로 저장한다.
- 대시보드의 역할 = **감시(oversight) + 이력(record) + 예외 개입**. (예외 개입 = 상태 정정 · 무효 ·
  삭제. 이번 사이클은 모바일 처리까지만 구현했고, 어드민 예외 개입 UI는 후속.)
- **반환완료는 되돌릴 수 없는 종결**이라, 모바일에서 저장 전 canonical `BottomSheet`로 한 번 더
  확인한다(오조작 방지). 그 외 상태 변경은 확인 없이 바로 저장.
- 저장하면 **처리자·시각**이 기록으로 남는다(`handled_by` / `handled_at`).

### 모바일 현장 처리 (2026-07-15 신설)

- 화면: 분실물 상세 `/mobile/requests/lost-found/[id]`. 기존 카드1(품목·위치·사진)은 그대로.
  읽기 전용이던 상태 스테퍼(카드2)를 **처리 블록**으로 승격.
- 컴포넌트: `src/components/requests/lost-found-handling-form.tsx` (수리·점검의
  `MaintenanceHandlingForm`과 동일 구조). 상태 칩 5개 + 처리 메모 + 증빙 사진(≤5) + 저장.
- 서버 액션: `updateLostItemHandling`
  (`src/app/mobile/requests/lost-found/actions.ts`). part_time 차단 → 이미지 경로 검증
  (`{org}/lost-found-handling/{itemId}/`) → 영향 행 수 확인(RLS backstop) → `handled_*` 기록.
- 상세 페이지 분기: **종결(returned/disposed) → 처리 이력 카드**, **처리 가능(비-파트타임) → 처리
  블록**, **파트타임 → 읽기 전용 진행바 + 잠금 안내**.
- 증빙 사진은 `request-images` 버킷의 `{org}/lost-found-handling/{itemId}/` 경로. 스토리지 정책
  화이트리스트에 `lost-found-handling` 추가(마이그레이션 `202607170001`).

### 반환완료 전용 목록 (2026-07-15 신설)

반환완료(`returned`)된 분실물만 따로 모아 보는 전용 화면. 반환이 늘어나면 일반 목록에서는 진행 중인
건에 묻히기 때문에, 반환 이력을 한눈에 보고 검색·필터할 수 있게 분리했다.

- **진입점**: 요청 → 분실물 탭의 필터 행, **"내 등록" 토글 옆**에 네이비 아웃라인 "반환완료" pill
  (`requests-filter-view.tsx`, 분실물 탭에서만 렌더). 누르면 전용 화면으로 이동.
- **경로**: `/mobile/requests/lost-found/returned`
  (`src/app/mobile/requests/lost-found/returned/page.tsx`).
- **구성**: 상단 통계(총 반환 / 이번 달 / 이번 주, Tokyo 기준 서버 계산) + 검색(물품·등록자·객실) +
  기간(전체/오늘/7일/30일)·건물 필터(canonical `BottomSheet`) + **월별 그룹**(이번 달 / 지난 달 /
  그 이전은 "YYYY년 M월") 카드. 카드마다 반환일시·처리자·위치·처리 메모.
- 클라이언트: `src/components/requests/returned-lost-found-list.tsx`. 데이터는
  `getReturnedLostItems(session)`(`src/lib/lost-found.ts`) — `status='returned'`, `handled_at`
  내림차순, `found_at` 기간 제한 없음(오래전 발견돼도 최근 반환된 건이 위로).
- 카드 탭 → 기존 상세(`/mobile/requests/lost-found/[id]`). 상세는 종결이라 처리 이력 카드를 보여준다.
- **범위 메모**: 기간 필터는 프리셋(전체/오늘/7일/30일)만 — 디자인의 "사용자 지정" 커스텀 범위는
  모바일 canonical 범위 피커가 없어 이번엔 제외(후속). 통계는 필터와 무관하게 전체 기준으로 고정 표시.

## Status Change Permission

Can change status (모바일 현장 처리 + 어드민 모두 동일 게이트):

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff if permitted
- Field Manager
- Staff

Cannot change status:

- Part-time Staff (모바일에서 처리 블록 대신 읽기 전용 안내를 본다. 서버 액션·RLS가 최종 게이트.)

> RLS 보강 (2026-07-15): 기존 lost_items UPDATE 정책은 `owner/office_admin/cs_staff/field_manager`만
> 허용해 **`staff`가 빠져 있었다**(수리·점검에서 고친 것과 같은 누락). "반환은 누구나"가 요구사항이라
> `staff`를 추가하고 `with check`도 붙였다 — 마이그레이션 `202607170001_lostfound_return.sql`.

## Edit and Delete Permission

### Who can delete

| Role | Own records | Others' records |
|---|---|---|
| developer_super_admin | ✅ | ✅ |
| owner | ✅ | ✅ |
| office_admin | ✅ | ✅ |
| cs_staff | ✅ | ✅ |
| field_manager | ✅ | ❌ |
| staff | ✅ | ❌ |
| part_time_staff | ✅ | ❌ |

### Entry point

- Delete button is accessible directly from the **request list view** (icon button per card).
- Delete is also accessible from the request detail page.

### Deletion behavior

- Hard delete — record is permanently removed.
- Show a confirmation modal before executing.
- Confirmation modal must include the item name to prevent accidental deletion.
- On success, remove the card from the list and refresh.

### Server-side enforcement

- RLS DELETE policy enforces ownership check for non-admin roles.
- Admin roles bypass ownership check but must still be authenticated org members.
- The server action validates role before executing the DELETE.
- Show confirmation popup before deleting.

When created from an active cleaning timer, the record should automatically link to:

- Cleaning record
- Property
- Room/unit
- Reporter
- Found date/time
- Most relevant checkout guest/reservation for that room when available

The app should show a final confirmation popup before submitting a lost item created from the cleaning timer:

- Confirm property/room
- Confirm suggested guest/reservation if available
- Allow editing via pencil/edit action before final submit

## Alerts

Potential alerts:

- Item nearing disposal
- Item moved to disposal_scheduled
- High-value item registered
- Guest/reservation linked to item

## Admin Surface (`/admin/lost-found`)

### Filters and Export (2026-07-14)

- **Filter bar**: date range (formerly two native `<input type="date">` fields) now uses the shared
  `<DateRangeFormField>` (`src/components/admin/shared/date-range-form-field.tsx`, an
  `AdminDateRangePicker` popover + 2 hidden inputs). `startDate`/`endDate` search params are unchanged,
  so deep links still work. Status filter unchanged.
- **Export = Excel + PDF (was CSV).** The old `ExportCsvLink` download link was replaced with
  `LostFoundExportBar` (`src/components/admin/lost-found/lost-found-export-bar.tsx`) rendering the
  canonical `<AdminExportButtons>`. New server actions `exportLostFoundWorkbook(filters)` /
  `exportLostFoundReport(filters)` (`src/app/admin/lost-found/actions.ts`) — gated by
  `requireAdminSession()` + organization scope. The client sends only the current filter values, never
  row data; the server re-queries via `getOrgLostItems` so the file always matches the filtered screen.
- **Export columns** (carried over from the old CSV headers): building / room / item name / status /
  reporter / found-at.
- Output goes through the shared admin export builders (`src/lib/admin-table-workbook.ts` /
  `admin-table-report.ts` — the same green-ledger template used across the whole admin console).
  Language is resolved server-side from `session.user.preferredLanguage`; the client never passes a
  locale.
- **The old `/api/admin/export/lost-found` CSV route no longer exists.** All `/api/admin/export/*`
  endpoints were removed on 2026-07-14 as part of a console-wide export unification (see
  `docs/product/07-cleaning-workflow.md` and `docs/product/10-order-request-workflow.md` for the same
  change on cleaning records and order requests).

## Open Questions

- Should returned-to-guest be a separate status or a retrieval field?
- Should retrieval method be added later if operations need it?
- How many days after disposal_scheduled should the system archive/delete the record?
- Should high-value items be exempt from automatic disposal?
- Who can override disposal date?
- Who can mark an item as disposed?
