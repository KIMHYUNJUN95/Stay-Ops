# Admin Web Information Architecture

## Purpose

The admin web app is the daily operations console for office/admin users.

It should not be treated as a secondary or optional tool. The mobile app serves field execution, while the admin web app serves oversight, management, and coordination.

## Surface Boundary

The admin dashboard is a desktop/web surface, not the mobile app rendered responsively. Mobile/tablet
requests to `/admin*` are redirected to `/mobile` before the dashboard page renders. This includes
direct shared links and auth/onboarding/OAuth flows that carry a stale `next=/admin*` value.
Mobile routes also do not fall back to `/admin` when organization context is missing; they route to
`/mobile/unavailable` so the app surface stays isolated.

The inverse responsibility also holds at the product level: app work should live under `/mobile`, and
dashboard management/oversight should live under `/admin`.

## High-Priority Admin Screens

All of the following screens are frequently used and should be considered core admin web areas.

## 1. Dashboard

Purpose:

- Show today's operational situation quickly.

Widgets:

- Today's check-ins
- Today's check-outs
- Occupied rooms/properties
- Empty rooms/properties
- Cleaning in progress
- Cleaning completed
- Open maintenance requests
- New lost items
- Pending order/supply requests
- Important announcements

## 2. Calendar / Occupancy

Purpose:

- See room/property occupancy and schedules by date.

Important views:

- Month view
- Week view
- Day view
- Room/property timeline
- Check-in/check-out schedule
- Empty room/property visibility

## 3. Check-In / Check-Out

Purpose:

- Review guest movement for the day.

Important information:

- Guest name
- Room/property
- Check-in date/time
- Check-out date/time
- Manual early check-out time
- Reservation source
- Guest notes
- Cleaning status

## 4. Cleaning Status

Purpose:

- Track cleaning execution.

Important information:

- Room/property
- Status
- Started at
- Completed at
- Total cleaning time
- Staff
- Notes/photos

Export:

- Excel download in Korean
- PDF download in Korean
- Available to Office Admin and Field Manager or higher roles

## 5. Maintenance Requests

Purpose:

- Manage reported room/property/facility problems.

Important information:

- Location
- Issue type
- Priority
- Status
- Assigned role/person if used
- Photos
- Comments
- Created at
- Completed at

## 6. Lost and Found

Purpose:

- Track found items, storage, and return status.

Important information:

- Item name
- Photo
- Found location
- Found date/time
- Storage location
- Related guest/reservation if known
- Status
- Return record

## 7. Order and Supply Requests

Purpose:

- Review and process item/supply requests.

Important information:

- Requested item
- Quantity
- Requester
- Property/location
- Priority
- Status
- Approval/fulfillment status

## 8. Announcements

Purpose:

- Create and manage internal notices.

Important features:

- Create announcement
- Mark important
- Target by role/property
- Read tracking
- Pin notice if needed

## 9. Staff Management

Purpose:

- Manage users, roles, invitations, and active status.

Important features:

- Invite by email
- Create invite code
- Assign role
- Deactivate user
- View active users

## 10. Attendance Roster / 출근자 명단

Purpose:

- 사무실에서 당일 및 과거 날짜의 실제 출근자를 한눈에 파악한다.
- 예상 명단(사무실이 알고 있는 실제 근무 예정자)과 대조해 부정출근을 즉시 감지하는 것이 핵심 목적이다.
  시스템이 부정출근을 "막는" 것이 아니라, 누가 찍었는지를 투명하게 보여줌으로써 사무실이 직접 이상 여부를 판단한다.

### 당일 실시간 명단 (Today's Live Roster)

- 해당 날(Tokyo date) 출근 기록이 있는 직원만 표시 — 아직 출근 전인 직원은 포함하지 않는다.
- 항목별 표시 정보:
  - 이름 / 직책(역할)
  - 출근 시각 및 사이트
  - 현재 상태: **근무 중** / **휴게 중** / **퇴근 완료** (퇴근 시각 포함)
- 출근 시각 순 정렬 (가장 일찍 출근한 사람이 상단).
- 실시간 갱신 또는 페이지 새로고침 시 반영.

### 날짜별 조회 (Date-based Roster)

- 날짜 피커로 과거 임의의 날을 선택해 해당 날의 출근자 명단을 조회한다.
- 표시 항목은 당일 명단과 동일; 당일은 열린 세션도 포함, 과거는 완료/무효 세션도 포함.
- 미래 날짜는 선택 불가.

### 세션 상태 범례

| 상태 | 의미 |
|------|------|
| 근무 중 | 출근 후 퇴근 미기록 (open) |
| 휴게 중 | 현재 휴게 세션 진행 중 |
| 퇴근 완료 | 정상 퇴근 완료 (completed) |
| 검토 필요 | 자정 초과 또는 이상 감지 (review_required) |
| 무효 | 관리자 무효 처리 (invalid) |

### 권한

- `owner`, `attendance_payroll_admin`, `office` 역할에게 읽기 허용.
- 자신의 세션만 볼 수 있는 일반 직원(`part_time`, `field_staff`)은 접근 불가.

### 구현 위치 (예정)

- **관리자 웹** `/admin/attendance/roster` — 데스크탑 콘솔 전용.
- 데이터 레이어: `attendance_sessions` + `attendance_breaks` 조회 (org 범위, 날짜 필터).
  `getCurrentOpenSession` / `getAttendanceHistory` 패턴을 admin-scoped 버전으로 재사용.
- **미구현** — 관리자 대시보드 1차 구현 시 함께 작업 예정.

## 11. Inventory

Purpose:

- Track stock and supplies.

This is important, but detailed inventory design needs separate planning.

## Navigation Direction

Recommended admin web navigation:

```txt
Dashboard
Calendar
Check-In/Out
Cleaning
Maintenance
Lost & Found
Orders
Announcements
Recurring Work
Attendance (출근자 명단 · 보정 검토 · 급여 확정)
Users
Settings
```

Inventory is intentionally excluded from the first MVP navigation because it is a future module.
Attendance roster, correction review, and payroll finalization are deferred to the admin dashboard build phase.

Implementation note:

- The admin sidebar contract is implemented in `src/config/navigation.ts`.
- The initial admin shell is implemented in `src/components/shell/admin-shell.tsx`.
- `/admin/settings` is the first implemented settings hub.
- `/admin/settings/organization` supports Developer / Super Admin organization creation.
- `/admin/settings/invite-codes` supports invite-code creation, listing, and deactivation.
- `/admin/settings/attendance` supports **owner-only** attendance site setup and QR issue/reissue.
- Future admin screens should use the shared admin navigation contract instead of creating local sidebar definitions.

## Design Note

The admin web app should feel like a dense but clear operations console, not a marketing-style dashboard.
