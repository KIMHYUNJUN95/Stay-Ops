# Maintenance Workflow

## Purpose

The maintenance workflow is used to report problems or field issues that regular staff or part-time staff cannot resolve themselves.

This includes broken items, missing items, facility issues, cleaning condition issues, and other operational problems that need follow-up.

## Required Fields

Maintenance request fields:

```txt
id
organization_id
property_id
room_id
category
description
photos
priority
reported_by_user_id
status
memo
created_at
updated_at
completed_at
```

## Field Meaning

### Room / Property

Required (building). Room is optional.

The request must be connected to a property (building) and, when applicable, a room/unit.

**Room dropdown collapses sub-units (2026-07-14):** the create form's room dropdown lists
`displayRoomLabel` (not `canonicalRoomLabel`), so Arakicho sub-units — 201 / 201_2 = the same physical
room with two Beds24 accounts — collapse to a single "201" entry, matching the reservation calendar's
room axis. Applies to the maintenance and lost-found **create forms** and the **cleaning-linked forms**
(`maintenance-linked-form.tsx` / `lost-found-linked-form.tsx`), which also collapse the inherited
session room to `displayRoomLabel`. The `cleaning_session_id` FK still links the report to the exact
cleaning session regardless of the room label, so linking is unaffected — only the displayed/stored
room label is normalized.

**Server validation must match (2026-07-14):** because the forms now submit the collapsed
`displayRoomLabel` ("201"), the create actions validate against `displayRoomLabel` too —
`createLostItem` (`item.displayRoomLabel === roomLabel`) and the reservation cross-check in both
`createLostItem` / `createMaintenanceReport` compare `getDisplayRoomLabel(...)` on both sides.
Otherwise, in periods when a room's only active Beds24 account is a "_2" sub-unit (base "201"
inactive), a "201" submission would fail catalog/reservation validation and the report would not save.
The manual **cleaning** start form (`manual-cleaning-form.tsx` / `buildManualRoomOptions`) likewise
collapses its room options to `displayRoomLabel` (keeping the canonical `sessionRoomLabel` as the stored
value for session matching). Cleaning's session↔reservation MATCHING keys stay canonical (unchanged).

**Shared display resolver fixed (2026-07-14):** `resolveRequestLocation` / `resolveRequestCatalogLocation`
(`src/lib/request-location.ts`) previously returned `canonicalRoomLabel` ("201_2") as the display value
on a catalog match. They now return `displayRoomLabel` ("201") and also match on `displayRoomLabel`
(so records stored as the collapsed "201" still recover their building). This fixes the **admin
maintenance/lost-found/orders lists** and the **cleaning + request CSV exports**, which route through
this helper, in one place. The `canonicalRoomLabel` field it returns stays canonical (matching consumers
like the linked forms are unaffected). **Attendance** room display (payroll export cleaning column,
work-context) already collapses via `summarizeCleaningRoomLabel`/`getDisplayRoomLabel` — OK. Still
pending: `admin-cleaning.ts` (`room: canonicalRoomLabel`, admin cleaning console — being rebuilt in a
separate track), and **historical records** already stored as "201_2" before these fixes show "201_2"
on their echo-path detail pages (a data-backfill item, not a code bug).

**Cleaning session-label displays collapsed (2026-07-14):** four feeds rendered the raw stored cleaning
**session** label ("아라키초A 201_2", canonical for matching) without collapsing. New shared helper
`getDisplaySessionRoomLabel` (`room-label-normalization.ts`) collapses it ("→ 아라키초A 201") and was
applied at: mobile home "today's activity" cleaning row + in-progress card (`src/app/mobile/page.tsx`
`localizeRoomLabel` now strips the sub-unit), admin dashboard-home in-progress cleaning card
(`src/lib/admin-dashboard.ts`), and the transport-reimbursement statement (`src/lib/transport-reimbursement.ts`).
Session↔reservation MATCHING keys stay canonical. This closes the third audit; no remaining code spot
(dashboard or mobile) shows "201_2" except the rebuild-pending admin cleaning console and pre-fix
historical data.

**Building-only reports (2026-07-14):** the mobile create form (`maintenance-create-form.tsx`) shows a
**"건물 전체"(whole building)** option at the top of the room dropdown — for common-area / building-level
issues with no specific room (also available for buildings that have no room catalog entries). Selecting
it stores the localized `roomBuildingOnly` label (`maintenance.form.roomBuildingOnly`, ko/ja/en) as
`room_label`; `property_name` still carries the building, so `resolveRequestLocation` renders it as
"건물 · 건물 전체". The linked/from-cleaning form keeps its fixed room and has no building-only option.

### Description

Required.

Free text explanation of the issue.

### Photos

Optional but strongly recommended when the issue is visual.

Implementation: photos are stored as `image_urls text[]` on the `maintenance_reports` table, uploaded to the `request-images` Supabase Storage bucket. Client-side compression is applied before upload.

Limit:

- Maximum 5 photos per maintenance report.

Compression:

- Resize long edge to max 1600px.
- Use JPEG/WebP compression around 70-80% quality.

### Priority

Required.

Priority candidates:

- low
- normal
- high
- urgent

### Reported By

Required.

The app should automatically store the user who reported the issue.

### Status

Required.

Implemented DB enum values (maintenance_status):

- open
- in_progress
- resolved
- closed

Note: the originally planned values (reported, confirmed, waiting, completed, cancelled) were not used in the final implementation. The current enum reflects the simpler 4-state model.

### Memo

Optional.

Used for internal notes, follow-up details, manager comments, or resolution notes.

## Categories

Confirmed categories:

- electric
- water
- air_conditioning_heating
- wifi
- furniture
- appliance
- cleaning_condition
- supplies
- damage
- other

Display labels:

```txt
electric: 전기 / 電気 / Electric
water: 수도 / 水道 / Water
air_conditioning_heating: 에어컨/난방 / エアコン・暖房 / AC & Heating
wifi: 와이파이 / Wi-Fi / Wi-Fi
furniture: 가구 / 家具 / Furniture
appliance: 가전 / 家電 / Appliance
cleaning_condition: 청소상태 / 清掃状態 / Cleaning Condition
supplies: 소모품 / 消耗品 / Supplies
damage: 파손 / 破損 / Damage
other: 기타 / その他 / Other
```

## Important Product Note

This module is not only for repair work.

It should also support cases where:

- Something is broken
- Something is missing
- Something looks wrong
- A guest-facing issue needs follow-up
- Part-time staff cannot resolve the issue themselves
- The issue needs manager or office attention

## Creation Entry Points

Maintenance requests can be created from:

- Maintenance tab
- Quick action on mobile home
- Active cleaning timer
- Admin web
- Reservation calendar linked action (`/mobile/maintenance/new?reservationId=...`)

Implementation note (2026-07-09):
- The reservation-calendar linked action is now implemented.
- When entered from `/admin/calendar`, the mobile form pre-fills the building / room / guest
  context from the linked reservation and stores `reservation_id` when the submitted room context
  still matches that reservation server-side.
- Standalone manual creation still works without any reservation context.

## Visibility

All users can create and view maintenance requests.

The Requests tab should include:

- All maintenance requests
- My registered maintenance requests

Default mobile behavior:

- `All` scope should be the default list mode in `/mobile/requests`.
- `My registered maintenance requests` should be available via an explicit scope filter/toggle.

## Status Change Permission

Can change status:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff if permitted
- Field Manager
- Staff

Cannot change status:

- Part-time Staff

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

- Delete button is accessible directly from the **request list view** (swipe action or icon button per card).
- Delete is also accessible from the request detail page.

### Deletion behavior

- Hard delete — record is permanently removed.
- Show a confirmation modal before executing.
- Confirmation modal must include the record title/name to prevent accidental deletion.
- On success, navigate back to the list and refresh.

### Server-side enforcement

- RLS DELETE policy enforces ownership check for non-admin roles.
- Admin roles bypass ownership check but must still be authenticated org members.
- The server action validates role before executing the DELETE.

When created from an active cleaning timer, the request should automatically link to:

- Cleaning record
- Property
- Room/unit
- Reporter
- Reported time

## Open Questions

- Should urgent maintenance trigger push notifications to Field Manager and Office Admin?
- Should completed maintenance require a completion photo?
- Should cost be tracked in this module later?
- Should requests support assigning a responsible person?
- Should staff be able to edit after submitting?

## 2026-07-14 어드민 수리/점검 대시보드 — 재기획 (감시·이력·예외 개입)

> **상태:** 기획 확정. 구현은 후속(디자인 파일 없이 공용 `.adm`/`.dd` 패턴으로 구현 예정). 이 섹션이
> 재구현의 기준 스펙이다. 알림(급한 건 통지)은 이번 범위 아님(알림 단계에서).

### 현행 vs 재구현 (문서-코드 정합 주의)

이 문서 상단의 "Required Fields"는 **기획만 되고 실제 테이블엔 없는 필드**(category, priority, memo,
completed_at, room_id/property_id)를 포함한다. **실제 `maintenance_reports` 테이블**은 더 단순하다:
`issue_title · description · room_label · property_name · guest_name · image_urls[] · status · reported_by_user_id ·
cleaning_session_id · reservation_id · created_at · updated_at` (위치는 FK가 아니라 `room_label`/`property_name`
텍스트, 청소와 동일). 이번 재구현에서 아래 필드를 **실제로 추가**한다.

### 성격 — 청소와 동일 (감시 + 이력 + 예외 개입)

수리/점검은 **관리자가 배정·처리하는 콘솔이 아니다.** 유지보수 팀도 결국 **현장**이라, 신청이 등록되면
**현장이 모바일에서 보고 직접 가서 처리**한다(확인·상태 갱신·처리 메모 모두 모바일). **배정 개념 없음.**

- 대시보드의 역할 = **감시(oversight) + 이력(record) + 예외 개입**.
- 예외 개입 = **관리자 강제 종료**(오래 방치된 건) + **삭제**(잘못된/중복 신청). 청소의 강제완료와 동일 철학.

### 티켓 모델 (재구현 — 마이그레이션 필요)

- **추가 enum**: `maintenance_priority` = low/normal/high/urgent · `maintenance_category` =
  electric/water/air_conditioning_heating/wifi/furniture/appliance/cleaning_condition/supplies/damage/other
  (표시 라벨은 상단 Categories 표 그대로, ko/ja/en).
- **추가 컬럼**(`maintenance_reports`): `priority`(default `normal`) · `category`(default `other`) ·
  `resolution_memo text` · `completed_at timestamptz`. **담당자(assignee) 컬럼은 두지 않는다**(배정 없음).
- **유지**: issue_title · description · room_label/property_name · guest_name · image_urls(≤5) · status ·
  신고자 · 청소/예약 연동 · 타임스탬프.
- **상태**: 접수(open) → 처리중(in_progress) → 해결(resolved) → 종료(closed). `resolved`/`closed`로
  바뀔 때 `completed_at` 기록. 상태 갱신은 **주로 모바일(현장)**.

### 모바일 신청/처리 영향

- 신청 폼에 **카테고리·우선순위 선택 추가** — 둘 다 **기본값 있는 선택**(카테고리 기본 `기타`, 우선순위
  기본 `normal`). 기존 진입점(정비 탭 · 홈 퀵액션 · 청소 타이머 · 예약캘린더 연동 · 어드민) 유지.
- 현장이 모바일에서 **확인 → 상태 갱신(처리중/해결) → 처리 메모** 수행(기존 상태변경 권한 그대로).

### 대시보드 (보드/목록 전환) — 읽기 중심

- **현황 보드 뷰**: 상태 4칼럼(접수/처리중/해결/종료), 카드에 우선순위 뱃지 · 카테고리 · 제목 · 위치 ·
  사진 유무 · 경과시간. 우선순위 높은 순 정렬. **긴급·오래된 미해결 강조**(접수 후 오래 방치된 건).
- **KPI 스트립**: 접수 · 처리중 · 긴급 · 오래된 미해결 · 해결.
- **목록/이력 뷰**: 필터(상태 · 우선순위 · 카테고리 · 건물 · 신고자 · 기간 · 검색) + 테이블 +
  **내보내기(CSV/Excel)**.
- **우측 상세 슬라이드 패널**(읽기 중심): 사진 갤러리 · 제목/설명 · 위치 · 신고자/신고시각 ·
  카테고리/우선순위 · 상태 · 처리 메모 · 연동(청소/예약). + **예외 액션**: 강제 종료 · 삭제(확인 모달, 제목 표시).
- 보드 ↔ 목록 **토글**. 빈/로딩/에러 상태 포함.

### 권한

- **상태 변경(일반)**: 현장이 **모바일에서** 수행 — `part_time_staff` 제외 전원(기존 규칙).
- **대시보드 강제 종료**: 관리자(developer/owner/전무/office_admin 등)만. 서버 게이트에서 확정.
- **삭제**: 본인 기록은 전원, 타인 기록은 관리자. 하드 삭제 + 확인 모달(제목 표시). RLS로 서버 강제.

### 디자인 시스템

어드민 공용 `.adm` + `.dd` 드롭다운 · 우측 슬라이드 패널 · 중앙 하단 토스트 · 상태/우선순위 뱃지.
근태·사용자 콘솔과 한 몸으로. 새 라벨(우선순위 4종, 카테고리 10종, 처리 메모, 빈/에러 문구)은
ko·ja·en 동시 추가.

### 범위에서 제외

- ❌ **담당자 배정**(배정 개념 없음) · ❌ 관리자 능동 처리 콘솔(처리는 모바일 현장)
- ❌ 급한 건 알림 발송(알림 단계에서) · ❌ 비용 추적 · ❌ 완료 사진 **필수화**(선택적 완료 사진은 허용 — 아래 보강 참고)
- ❌ **긴급 상시 배지** — 알림은 개발 완료 후 출시 전 단계에서 일괄 구현하며, 그 전까지는 전부 테스트
  버전이라 긴급 가시성은 알림 단계에서 처리한다.

### 기획 보강 (2026-07-14 확정) — 카테고리·상태·완료사진·재실

**티켓 모델 추가/변경**

- **카테고리 = 10종 확정**: `electric` / `water` / `air_conditioning_heating` / `wifi` / `furniture` /
  `appliance` / `cleaning_condition` / `supplies` / `damage` / `other` (표시 라벨은 상단 Categories 표,
  ko·ja·en). 모바일 폼의 기존 8종(`hvac`/`lock`/`internet`/`amenities` 등)을 이 10종으로 **교체**.
  enum `maintenance_category`.
- **상태 enum에 `cancelled`(무효) 추가** → `open`/`in_progress`/`resolved`/`closed`/**`cancelled`**.
  잘못된·중복 신고는 하드삭제 대신 `cancelled`로 남겨 감사 흔적 유지(삭제는 정말 불필요할 때만).
- **재오픈 허용**: 기본은 정방향 전이지만, `resolved`/`closed`를 **다시 `open`/`in_progress`로 되돌릴 수
  있다**(실제로 안 고쳐진 경우). 재오픈 시 `completed_at` 초기화.
- **`resolution_image_urls text[]` 추가**: 현장이 '해결' 처리 시 **선택적 완료(수리 후) 사진** 첨부
  (신청 사진 `image_urls`와 분리, ≤5장, 강제 아님). `resolution_memo` + `completed_at`과 함께 저장.

**대시보드/모바일 강화**

- **재실 중 경고(파생)**: 예약 연동으로 그 방에 **지금 손님이 있으면**(확정 예약 `check_in ≤ 오늘(Tokyo) <
  check_out`) 모바일 신청 화면·대시보드 카드/상세에 **'재실 중' 배지**. 저장값이 아니라 조회 시 계산.
- **오래된 미해결 강조**: `open` 접수 후 기준 시각(**기본 24시간**, 상수) 초과한 미해결 건을 현황 보드에서
  경고색으로 강조.
- **건물 전체(공용부) 리포트**: room 없이 건물만인 신고("건물 전체")도 대시보드 목록·보드에서 필터·표시.
