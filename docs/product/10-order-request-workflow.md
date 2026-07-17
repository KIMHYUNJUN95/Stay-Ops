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

Actual DB schema (`order_requests` table, migrations `202606010001`, `202606010002`, `202606020001`,
`202607190001`):

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
admin_memo            text    -- admin exception-handling memo (reject reason / status-correction memo);
                                 added 2026-07-19 migration, distinct from requester reason/description
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
- `received`: item received — not shown as an active step in the current UI timeline; maps to the "ordered" progress position if encountered. In the admin operations console (`/admin/orders`, `getAdminOrders` VM layer, implemented 2026-07-16), `received` is explicitly **mapped/displayed as `ordered`** — the console exposes only 4 visible statuses (requested/approved/ordered/closed); `received` is kept in the DB enum for a possible future receiving-tracking feature but stays an inactive step everywhere in the UI.
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

### Admin Console (`/admin/orders`) — replaced the old flat list (implemented 2026-07-16)

`/admin/orders` is now the **주문·비품 어드민 운영 콘솔** described above (4 views: 현황 보드 / 목록·이력
/ 배송 예정 캘린더 / 종결, KPI strip, right-side detail panel, 8 action modals) — see "주문·비품 어드민
운영 콘솔 (구현 완료 — 2026-07-16)" for the full spec. The pre-2026-07-16 flat list (Card + GET
filter form + table + export bar, each row linking to `/admin/orders/[id]`) no longer exists as the
page's UI; its filters and export behavior were carried into the console's 목록·이력 view.

- **Export = Excel + PDF (unchanged since 2026-07-14).** `OrdersExportBar`
  (`src/components/admin/orders/orders-export-bar.tsx`) renders the canonical `<AdminExportButtons>`,
  reused as-is inside the console. Server actions `exportOrdersWorkbook(filters)` /
  `exportOrdersReport(filters)` (`src/app/admin/orders/actions.ts`) — gated by `requireAdminSession()` +
  organization scope. The client sends only the current filter values; the server re-queries via
  `getOrgOrderRequests` so the file always matches the filtered screen. Columns: building / location /
  title / status / urgency / requester / created-at / item summary. Output uses the shared admin export
  builders (`src/lib/admin-table-workbook.ts` / `admin-table-report.ts`); language is resolved
  server-side from `session.user.preferredLanguage`. No CSV path exists.
- Each row/card opens the **right-side detail panel** in place (no navigation to a separate detail
  route) — see "우측 상세 패널" above.

### Admin Detail (`/admin/orders/[id]`) — removed (2026-07-17)

Added 2026-06-04 as a dedicated order detail page. As of the 2026-07-16 console rebuild, the console's
right-side detail panel provides full parity (and more — item link domain badges, urgency, exception
actions) with what this page showed, and no console UI linked to it anymore. The orphaned route file
(`src/app/admin/orders/[id]/page.tsx`) was **deleted on 2026-07-17**; the `[id]` directory no longer
exists under `/admin/orders`. The shared helpers it used (`OrderActionBar`, `getOrderRequestById`,
`parseOrderItems`) remain in use by the mobile order detail (`/mobile/requests/orders/[id]`).

Historical reference — what the page showed while it was the primary admin detail surface (2026-06-04
– 2026-07-16): order title/status badge/ID, building/room, requester, requested-at, expected delivery
date/range, memo/reason, requested items (name/quantity/link/images), status timeline (requested →
approved → ordered), action bar (Approve, Process Order with delivery date picker, Reject). It reused
`getOrderRequestById`, `parseOrderItems`, `OrderActionBar`, and `updateOrderRequestStatus` — all of
which the console also reuses.

## 주문·비품 어드민 운영 콘솔 (구현 완료 — 2026-07-16)

`/admin/orders`가 **구형 플랫 목록**(Card + GET 필터폼 + 테이블 + 내보내기 바)이라, 청소·수리·점검·
분실물이 모두 옮겨간 **운영 콘솔** 패턴에서 혼자 벗어나 있었다. 같은 공용 디자인 계약
(KPI strip + 뷰 전환 + 우측 상세 패널 + 공용 primitives)으로 재구축을 기획하고, **같은 사이클(2026-07-16)에
구현까지 완료했다.** 결정 근거는 `docs/planning/01-decision-log.md` → 2026-07-16.

구현 컴포넌트: `src/components/admin/orders/*`(8개 컴포넌트 + `orders-console.css` +
`orders-console-data.ts`) + VM 레이어 `src/lib/admin-orders.ts`(`getAdminOrders`) + 서버 액션
`src/app/admin/orders/actions.ts`. `/admin/orders` 페이지가 `AdminShell` + `<OrdersConsole>`로 전면
교체됐다. i18n: `dictionary.admin.orders.console`(ko/ja/en).

### 성격

분실물 콘솔과 같은 **감시(oversight) + 이력(record) + 능동 처리(active processing) + 예외 개입**.
사무실이 실제로 승인·거절·주문 처리를 하는 처리형 콘솔이다(수리·점검의 읽기 중심과 다르다).

### 재사용 (스키마·서버 로직 변경 최소화)

- **데이터**: `getOrgOrderRequests` / `getOrderRequestById` / `parseOrderItems`
  (`src/lib/order-requests.ts`) 그대로.
- **능동 처리 서버 액션**: `updateOrderRequestStatus`(승인/주문처리 — mobile orders actions) ·
  `updateOrderDeliveryDate`(배송일 수정) · `deleteOrderRequest`(삭제, delete-actions) 재사용.
- **신규 서버 액션 4종** (`src/app/admin/orders/actions.ts`, 구현 완료 — 계획했던 "재오픈 1종"에서
  범위가 커졌다): `rejectOrder` · `reopenOrder` · `correctOrderStatus` · `editOrder`. 모두
  `requireAdminSession()` + 역할 게이트(`canForceCompleteCleaning(role)`) + 조직 스코프 + UUID 검증,
  반환 `{ok:true}|{ok:false, reason:"forbidden"|"invalid"|"not_found"|"failed"}`. 상세는 아래
  "능동 처리 · 예외 개입 액션".
- **DB 스키마 변경 있음(구현 완료).** 마이그레이션 `202607190001_orders_console.sql`이
  `order_requests`에 `admin_memo text`(nullable) 컬럼을 추가했다 — 관리자 예외 개입 메모(거절 사유·
  상태정정 메모)를 저장하며 요청자용 `reason`/`description`과 구분된다. RLS 정책은 불변. `src/types/database.ts`의
  `order_requests` Row/Insert/Update에 반영 완료. 원격 Supabase에 적용 완료이며, 원격 마이그레이션 이력
  (`schema_migrations`)에도 `orders_console`(version `20260717005554`)로 등록됨(DDL은 `if not exists`라
  재적용 안전). 파일명 번호 `202607190001`은 lostfound 마이그레이션 뒤를 잇는 순차 스탬프이고, 실제
  구현일은 2026-07-16이다.
- 콘솔 껍데기(뷰 전환 + KPI + 상세 패널 + 모달)도 함께 구현했다.

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

- **승인** — `requested → approved` (`updateOrderRequestStatus` 재사용).
- **거절** — `rejectOrder({orderId, reason})` (**신규**). 진행 중 건을 `closed` + `admin_memo`=사유로
  전환하고 배송 3컬럼(`delivery_date`/`delivery_start_date`/`delivery_end_date`)을 null로 초기화한다.
  이미 `closed`면 `invalid`.
- **주문 처리** — `approved → ordered`, **배송일(point/range) 필수 입력**(공용 날짜 피커,
  `updateOrderRequestStatus` 재사용).
- **배송일 수정** — `updateOrderDeliveryDate`, `ordered` 상태에서 배송 컬럼만 갱신(상태 불변).
- **재오픈(reopen)** — `reopenOrder({orderId})` (**신규**). `closed` 건을 `requested`로 되돌린다(관리자
  실수·재요청 대응, 분실물 복원과 같은 예외 개입 개념). 배송 컬럼과 `admin_memo`를 함께 초기화한다(아직
  주문 전 단계로 돌아가므로). `closed`가 아니면 `invalid`. (문서 하단 Open Question "거절 건 재제출"을
  해소한다.)
- **상태 정정(correct)** — `correctOrderStatus({orderId, status, memo})` (**신규**). 임의 상태로
  직접 정정한다. `requested`/`approved`로 정정하면 배송 컬럼을 null로 초기화하고, `closed`가 아니면
  `admin_memo`도 null로 초기화한다.
- **요청 수정(edit)** — `editOrder({orderId, title, urgency, reason, items})` (**신규**). 제목·긴급도·
  사유·품목을 관리자가 직접 수정한다. 품목의 사진(`imageUrls`)과 `id`는 이름 우선(인덱스 폴백)으로 기존
  값을 보존한다. 이름이 빈 품목은 제거하며, 결과가 0개면 `invalid`.
- **삭제(예외 개입)** — `deleteOrderRequest` 재사용. 기존 상태별 권한 제약(`ordered`/`received`는
  어드민만) + 확인 모달 + 하드 삭제 그대로.

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

**8종 액션 모달**로 구현됐다: approve · reject · process · editdeliv(배송일 수정) · reopen · correct ·
edit · delete. 배송일 피커는 공용 `.calpop` 크롬을 재사용(단일/기간 토글). KPI strip은 위 "KPI strip (5)"
정의 그대로 5칸 구현됐다.

### 구 상세 라우트 상태 — 삭제 완료 (2026-07-17)

`src/app/admin/orders/[id]/page.tsx`(구 모바일식 상세 페이지)는 콘솔 우측 상세 패널이 완전히 대체하여
인바운드 링크가 0이던 **고아 라우트**였고, **2026-07-17에 파일·`[id]` 디렉토리를 삭제**했다. 삭제로
인해 죽는 헬퍼는 없다(`OrderActionBar`·`getOrderRequestById`·`parseOrderItems`는 모바일 주문 상세
`/mobile/requests/orders/[id]`에서 계속 사용). 이제 `/admin/orders` 아래에는 `page.tsx`와 `actions.ts`만
남는다.

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

- ~~Should rejected requests be editable and resubmitted?~~ → **해소·구현 완료(2026-07-16):** 어드민 콘솔의
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
- **어드민 주문 콘솔 재구축 (2026-07-16 기획 확정, 같은 사이클에 구현 완료):** `/admin/orders`를 운영
  콘솔(4뷰: 현황 보드/목록·이력/배송 예정 캘린더/종결)로 재구축. 배송 캘린더를 어드민에도 신설, 긴급도
  배지+필터+정렬 노출, 거절/재오픈/상태정정/요청수정 4종 신규 서버 액션 추가. `order_requests`에
  `admin_memo` 컬럼 추가(스키마 변경). 상세는 위 "주문·비품 어드민 운영 콘솔" 절.
