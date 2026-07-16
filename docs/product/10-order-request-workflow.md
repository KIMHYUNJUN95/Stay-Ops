# Order Request Workflow

## Purpose

The order request workflow lets staff and part-time staff request amenities, supplies, equipment, or any other items needed for operations.

This workflow should use free-text input rather than a fixed item catalog because requested items can vary widely.

Requester-side UX priority:

- The person submitting an order request should experience the flow as a quick field request, not an office/admin form.
- Keep the requester form simple and fast.
- Office/admin processing can contain more workflow detail, but it should not make the requester-side form feel complicated.
- Price/cost fields are not part of the MVP order request workflow.
- Payment and shipment tracking workflows are not part of MVP.
- The purpose is to tell the office which items are needed, for which property/building, and who requested them.
- One order request can contain up to 40 requested item rows.

## Core Flow

```txt
Staff/part-time staff creates order request
Office Admin reviews request
Office Admin approves or rejects
If rejected, requester receives notification with rejection reason
If approved, requester receives approval notification
Office Admin processes the order (주문 처리) — marks status as ordered
Requester receives order-processed notification
```

Not included:

- Payment processing
- Delivery/shipping tracking states
- Receiving/arrival tracking states
- Price/cost calculation
- Inventory deduction

## Required Fields

Actual DB schema (`order_requests` table, migrations `202606010001`, `202606010002`, `202606020001`):

```txt
id                    uuid primary key
organization_id       uuid not null references organizations(id)
reported_by_user_id   uuid not null references profiles(id)
building_name         text not null
room_label            text not null default '-'
title                 text not null
description           text
reason                text
urgency               order_request_urgency not null default 'normal'  -- 'normal' | 'high'
status                order_request_status not null default 'requested'
items                 jsonb not null default '[]'     -- per-item imageUrls stored inside JSONB
delivery_date         date    -- single delivery date; populated when status transitions to 'ordered'
delivery_start_date   date    -- range start (mutually exclusive with delivery_date point mode)
delivery_end_date     date    -- range end; constraint: start <= end, both null or both set
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
```

Note: per-transition audit fields are not in the MVP schema. State history is tracked via the `status` enum value only.

Each item inside the `items` JSONB array:

```txt
id        string (client-generated UUID)
name      string (required)
quantity  string (required)
link      string (optional — absolute URL for product reference)
memo      string (optional — per-item note)
```

Item limit:

```txt
Maximum 40 items per order request
```

## Field Meaning

### Building / Room

`building_name` is required (free-text string, not a foreign key to `properties`).
`room_label` is optional (defaults to `'-'`).

Order requests are scoped to a building, not a room, in MVP.

### Title

Required. A short summary of the overall request (e.g. "Room 201 supplies").

### Items (JSONB)

Each item in the JSONB array contains:
- `name` (required): free-text item name
- `quantity` (required): numeric string
- `link` (optional): absolute product URL for the item — rendered per-item in the detail UI; only `https://` and `http://` URLs are rendered as clickable anchors
- `memo` (optional): per-item note

Multiple items:

- A single order request can include multiple item rows.
- Each row lets the requester enter item name and quantity quickly.
- Optional link/memo can be added without making the requester-side UI feel complex.
- The first item row is visible immediately.
- Adding more items is simple and fast.

### Quantity

Required. Free text or simple numeric string.

Price/cost:

- Do not ask the requester for price, estimated cost, unit cost, cost center, or budget information in MVP.
- Product link per item is enough when the requester knows where to buy.

### Photo

Per-item photo attachment implemented (2026-06-02).

- Up to 5 photos per item row.
- Photos are attached via a camera button next to the "쇼핑몰 검색 / Shop online / ショップ検索" toggle in the item form.
- Photos are uploaded to Supabase Storage (`request-images` bucket, `order-images/` path) on form submit.
- Image URLs are stored in `items[].imageUrls` inside the `items` JSONB column.
- The first photo of the first item with an image is shown as a thumbnail in the request list card.
- All photos are shown per-item in the request detail page.

### Urgency

`urgency` enum: `normal` (default) or `high`. Not yet surfaced as a UI filter in MVP.

### Reason

Optional.

Free-text reason for the request.

### Requested By

Required.

The app should automatically record the requester.

### Memo

Optional.

Used by requester or office/admin for additional notes.

### Delivery Date

**Required** when Office/Admin marks the request as `ordered` (주문 처리).

Meaning:

- Expected delivery date that requester and office should reference.
- Date-only (YYYY-MM-DD). Stored in `order_requests.delivery_date` (date column, nullable).
- Entered in the 주문 처리 confirmation modal at the time of status change.
- Displayed in the order detail page as "배송예정일 / 配送予定日 / Expected Delivery".
- Shown as a secondary metadata item in the requests list card when present.
- The delivery calendar is derived from this field and must follow a strict trigger rule:
  - only `delivery_date` (point) / `delivery_start_date`..`delivery_end_date` (range) drives the entry
  - no other order-request date field should create a calendar entry in the baseline design
  - if `delivery_date` is not entered, no calendar entry is created
- The calendar lives in the **mobile Requests area, order tab only** (not the reservation calendar).
  See "Delivery Calendar (Planned / Design — 2026-06-15)" below.

## Statuses

Current DB enum values (implemented):

- `requested`
- `approved`
- `ordered`
- `received`
- `closed`

Status meaning:

- `requested`: requester submitted request
- `approved`: office/admin approved request
- `ordered`: office/admin completed order processing (주문 처리 완료); this is the terminal active state in MVP
- `received`: item received — not shown as an active step in the current UI timeline; maps to the "ordered" progress position if encountered
- `closed`: request closed/rejected (terminal; timeline shown as neutral/inactive, not full-progress)

User-facing label policy:

- `ordered` is labeled **"주문 처리됨" (ko) / "注文済み" (ja) / "Ordered" (en)** — meaning order processing is complete.
- The action button that triggers the `ordered` transition is labeled **"주문 처리" (ko) / "注文処理" (ja) / "Process Order" (en)**.
- `received` is not an active operational step in MVP and is excluded from the timeline progress bar display; it renders identically to `ordered` in the progress bar.
- `closed` is shown with a neutral (muted) timeline bar — no steps highlighted. The status badge communicates the terminal state. This avoids a false "fully completed" impression for early-rejected requests.

Status transition rules (enforced server-side):

- `requested` → `approved` (approve action)
- `approved` → `ordered` (process order action; direct requested → ordered is not allowed)
- any non-`closed` → `closed` (reject action)

## Notifications

Required notifications:

### Approved

When Office Admin approves a request:

- Requester receives notification

### Rejected

When Office Admin rejects a request:

- Requester receives notification
- Rejection reason is included

### Order Processed (주문 처리)

When Office Admin marks the request as ordered (주문 처리):

- Requester receives in-app notification (implemented 2026-06-03)
- Content: order processing completed, delivery date included in payload
- Self-notification suppressed: no notification if processor = requester

### Delivery Date Updated (배송일 변경)

When an office role edits the delivery date of an already-`ordered` request (implemented 2026-06-15):

- Requester receives an in-app notification with the new delivery date.
- Implementation reuses the existing `order_processed` notification type (no enum migration) with a
  `kind: "delivery_updated"` payload flag; the display renders a "배송예정일 변경" title/body
  (`createOrderDeliveryUpdatedNotification`). The dedupe key includes the new delivery value so each
  distinct change produces a fresh notification.
- Self-notification suppressed: no notification if the editor = requester.

## Delivery Calendar (Implemented — 2026-06-15)

Current status:

- `delivery_date` is captured and stored when status transitions to `ordered` (implemented 2026-06-01).
- The detail page and requests list display `delivery_date` formatted in Asia/Tokyo timezone.
- The delivery **calendar view** is **implemented (2026-06-15)** — component
  `src/components/requests/order-delivery-calendar.tsx`, opened from the Requests order tab
  (`src/components/requests/requests-filter-view.tsx`).

Placement & entry point (as built):

- The delivery calendar lives **inside the mobile Requests area**, **not** in the reservation calendar
  (`/mobile/calendar`). The reservation calendar is a room-axis timeline keyed to guest reservations;
  building-scoped order deliveries do not fit that axis. (Supersedes the earlier "add to reservation
  calendar" plan; see also `docs/product/15-reservation-calendar.md`.)
- Entry point is a **calendar icon button next to the "내 요청" scope toggle**, shown **only on the
  비품주문 (order) tab**. **It must NOT appear on the 수리요청 (maintenance) or 분실물 (lost-found)
  tabs** — only order requests carry a delivery date. The icon is a high-quality, design-token-styled
  button (rounded, primary tint/ring/soft shadow, `CalendarDays`-style glyph).
- Tapping the icon opens a **popup (centered modal) with a large month calendar**. (This is a centered
  popup/dialog, so the bottom-sheet "drag-to-dismiss / no-X" rule does not apply; it closes via
  backdrop tap / Esc.) The popup shows: month navigation, a large month grid with a marker (●) on
  days that have deliveries, and — on tapping a marked day — that day's deliveries (building/room,
  title, requester, status; range deliveries show `~end`), each linking to the order detail.

Data / auto-registration rule:

- The calendar is **derived from `order_requests`** — no separate calendar/events table and no schema
  change. It queries the visible month for orders whose `delivery_date` (point) or
  `delivery_start_date`..`delivery_end_date` (range) falls in range.
- This satisfies the strict trigger: **only `delivery_date` creates a calendar entry**; if it is not
  set, nothing appears. Because the calendar reads the order row directly, the entry **auto-appears**
  when an admin saves the delivery date and **auto-updates** when it is edited — no extra write.
- Scope follows the existing requests toggle: **전체 (org)** by default with a **"내 요청"** filter
  (`reported_by_user_id`).

Editing (as built):

- The delivery date is editable after `ordered` from the **order detail page by office-level roles**
  (same permission as 주문 처리). The order action bar shows a **"배송일 수정"** action when
  `status === "ordered"`, reusing the existing delivery-date picker (exact / range) and persisting via
  a dedicated `updateOrderDeliveryDate` server action (`src/app/mobile/requests/orders/actions.ts`) —
  status stays `ordered`, only the delivery columns change. The calendar reflects edits automatically
  (it reads the order rows). Editing **notifies the requester** (delivery-date-changed notification —
  see Notifications below); self-suppressed when the editor is the requester.
- i18n: `mobile.filterScopeMineRequest`, `mobile.deliveryCalendar.*`, and order-detail
  `actionEditDelivery / editDeliveryTitle / editDeliveryBody / successEditDelivery` (ko/ja/en).

Admin web (deferred):

- The delivery calendar is currently **mobile only** (the requester-facing surface). An equivalent
  view on the **admin web** (`/admin/orders` or `/admin/calendar`) was historically deferred while the
  mobile-first slice shipped. The current dashboard rebuild now treats the admin order surface as active
  scope again; use `docs/product/05-admin-web-ia.md` as the dashboard source of truth. The
  delivery-date edit already works on the admin order detail (shared `OrderActionBar`); only the older
  documentation timing is obsolete.

## Admin Surface

### Admin List (`/admin/orders`)

- Shows all order requests for the organization.
- Columns: building / room, title, status badge, requester, requested at.
- Filter controls: date range (startDate / endDate) rendered via the shared
  `<DateRangeFormField>` (`src/components/admin/shared/date-range-form-field.tsx`, an
  `AdminDateRangePicker` popover + hidden inputs — replaced the two native `<input type="date">`
  fields on 2026-07-14; `startDate`/`endDate` search params and deep links are unchanged), status.
- **Export = Excel + PDF (2026-07-14; was CSV).** `OrdersExportBar`
  (`src/components/admin/orders/orders-export-bar.tsx`) renders the canonical `<AdminExportButtons>`.
  New server actions `exportOrdersWorkbook(filters)` / `exportOrdersReport(filters)`
  (`src/app/admin/orders/actions.ts`, new file) — gated by `requireAdminSession()` + organization scope.
  The client sends only the current filter values; the server re-queries via `getOrgOrderRequests` so
  the file always matches the filtered screen. Columns (carried over from the old CSV headers): building
  / location / title / status / urgency / requester / created-at / item summary. Output uses the shared
  admin export builders (`src/lib/admin-table-workbook.ts` / `admin-table-report.ts`); language is
  resolved server-side from `session.user.preferredLanguage`. **The old `/api/admin/export/orders` CSV
  route no longer exists** — all `/api/admin/export/*` endpoints were removed as part of a console-wide
  export unification (see `docs/product/07-cleaning-workflow.md`, `docs/product/09-lost-found-workflow.md`).
- Each row links to the admin order detail page (`/admin/orders/[id]`).

### Admin Detail (`/admin/orders/[id]`)

Added 2026-06-04. Admins now have a dedicated order detail page on the admin web surface.

What the admin detail page shows:

- Order title, status badge, and order ID.
- Building and room.
- Requester name.
- Requested-at timestamp.
- Expected delivery date or date range (if set).
- Memo / reason (if provided).
- Requested items: name, quantity, optional reference link, per-item images.
- Status timeline progress bar (requested → approved → ordered).
- Action bar: Approve, Process Order (with delivery date picker), Reject.

Access control:

- Page requires an admin session (`requireAdminSession()`).
- Data is scoped to the admin's organization via `getOrderRequestById()`.
- Returns `404` for unknown or out-of-organization IDs.
- Status transitions use the same `updateOrderRequestStatus` server action as the mobile surface; role and transition validation is enforced server-side.

Business logic reuse:

- `getOrderRequestById` — shared with mobile detail.
- `parseOrderItems` — shared with mobile detail.
- `OrderActionBar` component — shared with mobile detail; `router.refresh()` updates the admin page after a status change.
- `updateOrderRequestStatus` server action — shared with mobile detail; handles approve, ordered (with delivery date), and reject transitions.

## 주문·비품 어드민 운영 콘솔 (기획 확정 — 2026-07-16, 구현 전)

`/admin/orders`가 아직 **구형 플랫 목록**(Card + GET 필터폼 + 테이블 + 내보내기 바)이라, 청소·수리·점검·
분실물이 모두 옮겨간 **운영 콘솔** 패턴에서 혼자 벗어나 있다. 이를 같은 공용 디자인 계약
(KPI strip + 뷰 전환 + 우측 상세 패널 + 공용 primitives)으로 재구축한다. 결정 근거는
`docs/planning/01-decision-log.md` → 2026-07-16.

### 성격

분실물 콘솔과 같은 **감시(oversight) + 이력(record) + 능동 처리(active processing) + 예외 개입**.
사무실이 실제로 승인·거절·주문 처리를 하는 처리형 콘솔이다(수리·점검의 읽기 중심과 다르다).

### 재사용 (스키마·서버 로직 변경 최소화)

- **데이터**: `getOrgOrderRequests` / `getOrderRequestById` / `parseOrderItems`
  (`src/lib/order-requests.ts`) 그대로.
- **능동 처리 서버 액션**: `updateOrderRequestStatus`(승인/주문처리/거절) ·
  `updateOrderDeliveryDate`(배송일 수정) · 삭제 액션 재사용.
- **신규 서버 액션은 재오픈 1종만** — 아래 참고. **DB 스키마 변경 없음.**
- 콘솔은 껍데기(뷰 전환 + KPI + 상세 패널 + 모달)만 새로 만든다.

### KPI strip (5)

승인 대기(`requested`) · 주문 대기(`approved`) · 긴급(`urgency='high'` 중 진행) · 이번주 배송 예정
(`delivery_date`/range가 이번 주) · 이번달 주문 처리(`ordered` 이번 달).

### 뷰 구성 (4)

1. **현황 보드** — 처리 파이프라인 3칼럼: **승인 대기(requested) / 주문 대기(approved) / 주문 완료
   (ordered)**. 카드 정렬은 긴급 건 우선, 동률이면 오래된 요청 우선. `closed`·`received`는 보드에 없다.
2. **목록·이력** — 전 상태. 필터: 기간(공용 `AdminDateRangePicker`) · 상태 · 건물 · 요청자 · **긴급도** +
   검색(품목·제목·요청자).
3. **배송 예정 (캘린더)** — 어드민에 그동안 없던 **배송 캘린더**를 콘솔 뷰로 신설(그간 모바일 전용이던
   공백 해소). `delivery_date`(point) / `delivery_start_date`..`delivery_end_date`(range)에서 **파생**
   (별도 테이블·스키마 변경 없음, `order_requests` 직접 조회). 월 그리드 + 배송 있는 날 마커(●) + 날짜
   탭 시 그날 배송 목록(**어느 건물 · 누가 신청 · 무슨 비품(제목) · 언제 배송 · 상태**, range는 `~end`)이
   상세로 링크. 조직 전체 스코프.
   - **건물별로 볼 수 있어야 한다(요구사항 2026-07-16).** 캘린더에 **건물 필터**(전체 / 특정 건물)를 두어,
     특정 건물의 배송만 마커·목록으로 좁혀 본다. 날짜별 배송 목록은 건물 라벨을 항상 표기한다.
   - 관리자는 여기서 "어느 건물에 · 누가 신청한 · 어떤 비품이 · 언제 배송되는지"를 한 화면에서 관리한다.
4. **종결** — `ordered`(주문 완료) + `closed`(거절/종결) 아카이브.

### 능동 처리 · 예외 개입 액션

- **승인** — `requested → approved`.
- **거절** — 진행 중 어느 상태든 → `closed`, 사유 입력(기존 동작 유지).
- **주문 처리** — `approved → ordered`, **배송일(point/range) 필수 입력**(공용 날짜 피커).
- **배송일 수정** — `ordered` 상태에서 배송 컬럼만 갱신(상태 불변).
- **재오픈(reopen)** — **신규.** `closed` 건을 `requested`로 되돌린다(관리자 실수·재요청 대응, 분실물
  복원과 같은 예외 개입 개념). 되돌릴 때 배송 컬럼(`delivery_date`/`delivery_start_date`/
  `delivery_end_date`)을 **초기화**한다(아직 주문 전 단계로 돌아가므로). 서버 액션 신규 필요, `closed`가
  아니면 거부. (문서 하단 Open Question "거절 건 재제출" 을 해소한다.)
- **삭제(예외 개입)** — 기존 상태별 권한 제약(`ordered`/`received`는 어드민만) + 확인 모달 + 하드 삭제 그대로.

### 긴급도(urgency) 노출 (신규 — 지금까지 UI 미노출)

`urgency='high'` 건에 **긴급 배지**(danger 톤) + 목록의 **긴급도 필터** + 보드·목록 **정렬 우선순위**
(긴급 먼저). DB enum(`high`/`normal`)은 그대로, 표시만 추가한다.

### 우측 상세 패널 — 모바일 전 기능을 대시보드에서 전부 관리 (요구사항 2026-07-16)

요청자가 **모바일에서 넣은 모든 것**을 관리자가 상세 패널에서 그대로 보고 처리할 수 있어야 한다(대칭).

- 주문 기본정보: 건물/객실 · 요청자 · 요청일시 · **긴급도 배지** · 사유/메모.
- **품목 리스트**: 이름 · 수량 · **상품 링크** · 메모 · **품목별 사진**.
  - **상품 링크는 클릭 가능한 앵커(새 탭)로 열 수 있어야 한다.** 모바일은 요청자가 **Amazon(코자파)·
    IKEA(jp) 검색**으로 상품을 찾아 링크를 붙인다 — URL 호스트로 도메인을 판별해
    (`OrderLinkDomain = "amazon" | "ikea" | "other"`, `src/components/requests/order-item-row.tsx`)
    색 배지(Amazon 주황 · IKEA 파랑 · 기타)로 표시한다. **콘솔 상세도 동일하게 도메인 배지 + 클릭 링크**
    로 렌더한다(현 어드민 상세는 링크 클릭은 되지만 도메인 배지가 없어, 콘솔에서 배지를 추가한다).
    링크는 `https://`/`http://` 절대 URL만 앵커로 렌더(기존 안전 규칙 유지).
- 배송일(point/range) · 상태 타임라인(requested → approved → ordered; `received`는 ordered 위치로 접힘,
  `closed`는 중립).
- **능동 처리 존**: 승인 → (사무실이 실제 주문) → **배송일 기입** → 배송일 수정. 상태에 따라 버튼 노출.
- **예외 개입**: 재오픈(거절 되돌리기) · 삭제.

즉 요청자가 모바일에서 만든 주문(품목·링크·사진·긴급도·건물)을 관리자가 대시보드 한 곳에서 **승인 →
주문 → 배송일 기입 → 캘린더 자동 반영**까지 끝낸다.

### 범위 밖 / 후속

- **알림**은 이번에 붙이지 않는다 — 개발 막바지 **알림 일괄 구현 단계**에서 처리(프로젝트 전역 방침).
  기존 승인/거절/주문처리/배송일변경 알림은 그대로 동작.
- **입고/도착 추적(`received` 활성화) · 비품 카탈로그 · 재고 · 단가**는 이번 콘솔 재구축 범위 밖(별도
  워크플로 확장 과제). `received`는 콘솔에서 계속 비활성 단계로 둔다.
- **내보내기(Excel/PDF)**: 기존 `OrdersExportBar` + 공용 export primitives를 콘솔에서도 그대로 유지
  (분실물과 달리 주문은 내보내기가 필요한 기존 기능).

## Visibility

All users can create and view order requests.

The Requests tab should include:

- All order requests
- My registered order requests

## Status Change Permission

Can change status:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff

Cannot change status:

- Field Manager
- Staff
- Part-time Staff

Important:

- Part-time Staff can register and view order requests but cannot approve, reject, or mark as ordered.
- Order request approval, rejection, and ordered/completed processing are office-level actions.
- CS Staff is treated as office-level for order request processing in MVP.

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
- Confirmation modal must include the order title to prevent accidental deletion.
- On success, remove the card from the list and refresh.

### Status constraint

- Orders in `ordered` or `received` status: only admin roles can delete (the order may already be placed externally).
- Orders in `requested`, `approved`, or `closed` status: owner can delete.

### Server-side enforcement

- RLS DELETE policy enforces ownership check for non-admin roles.
- Admin roles bypass ownership check but must still be authenticated org members.
- The server action validates role before executing the DELETE.

## Open Questions

- ~~Should rejected requests be editable and resubmitted?~~ → **해소(2026-07-16 기획):** 어드민 콘솔의
  **재오픈(reopen)** 액션으로 `closed → requested` 되돌리기를 지원한다. 위 "주문·비품 어드민 운영 콘솔"
  참고.
- Should quantity have unit input, such as boxes, pieces, sets?
- Should `delivery_date` allow time input in a post-MVP phase?
- Should photo attachment be added to order requests (deferred)?

## Resolved Design Decisions

- Approval IS required: `requested → approved → ordered` is the enforced path; direct `requested → ordered` is blocked server-side.
- Field Manager cannot process status; only office-level roles can (owner, office_admin, cs_staff, developer_super_admin).
- Items are stored as a single JSONB array, not individual rows, for MVP simplicity.
- `delivery_date` is required (not optional) when marking as ordered.
- **어드민 주문 콘솔 재구축 (2026-07-16 기획 확정, 구현 전):** `/admin/orders`를 운영 콘솔(4뷰: 현황
  보드/목록·이력/배송 예정 캘린더/종결)로 재구축. 배송 캘린더를 어드민에도 신설, 긴급도 배지+필터+정렬
  노출, 거절 건 재오픈 추가. 스키마 변경 없음(재오픈 서버 액션만 신규). 상세는 위 "주문·비품 어드민 운영
  콘솔" 절.
