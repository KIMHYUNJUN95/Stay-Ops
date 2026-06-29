# Customer Complaint Workflow (고객 컴플레인 기록)

## Purpose

에어비앤비·부킹닷컴 등 OTA 플랫폼에서 발생하는 고객 불만·리뷰를 조직 내부에서
구조화된 기록으로 남기고 공유하기 위한 기능이다.

담당자가 OTA 플랫폼에서 직접 컴플레인을 확인한 후 캡처 이미지와 함께 기록하면
조직 전원이 열람할 수 있다. 처리 완료 여부를 추적하고 댓글로 대응 방법을 공유한다.

컴플레인은 공지사항과 달리 **수신자를 지정하지 않는다**. 조직 전체가 공개 대상이며,
발생한 문제와 대응 과정을 투명하게 공유하는 것이 목적이다.

---

## Write Permission

컴플레인을 작성할 수 있는 역할:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff

작성 불가:

- Field Manager
- Staff
- Part-time Staff

---

## Read Permission

조직 내 모든 활성 구성원이 열람 가능하다 (조직 전체 공개).

---

## Comment Permission

| 역할 | 댓글 가능 여부 |
|------|--------------|
| Developer / Super Admin | ✓ |
| Owner | ✓ |
| Office Admin | ✓ |
| CS Staff | ✓ |
| Field Manager | ✓ |
| Staff | ✓ |
| Part-time Staff | ✗ |

---

## Status

컴플레인은 2단계 상태를 가진다.

| 상태 | 의미 |
|------|------|
| `open` | 미처리 (기본값) |
| `resolved` | 처리 완료 |

상태 변경 권한:

- **작성자**: 본인 컴플레인 open ↔ resolved 전환 가능
- **Owner / Office Admin**: 전체 컴플레인 상태 변경 가능
- **CS Staff**: 본인이 작성한 컴플레인만 상태 변경 가능

---

## Platform Source (플랫폼 출처)

컴플레인을 기록할 때 출처 플랫폼을 선택한다.

| 값 | 표시명 |
|----|--------|
| `airbnb` | Airbnb |
| `booking` | Booking.com |
| `google` | Google |
| `tripadvisor` | TripAdvisor |
| `jalan` | じゃらん |
| `rakuten` | 楽天トラベル |
| `other` | その他 / 기타 |

---

## Required Fields

```txt
id
organization_id
created_by_user_id
title
platform
status
image_urls
created_at
updated_at
```

Optional fields:

```txt
description          -- 상세 내용·경위 설명
platform_ref         -- 리뷰 URL 또는 예약번호 (외부 참조)
property_id          -- 건물 연결
property_name        -- 건물명 스냅샷
room_id              -- 객실 연결
room_label           -- 객실명 스냅샷
reservation_id       -- 예약 연결
guest_name           -- 고객명 직접 입력 (예약 없을 때)
resolved_at
resolved_by_user_id
```

---

## Context Link (건물·객실·고객 연결)

컴플레인은 선택적으로 건물, 객실, 예약에 연결할 수 있다.

연결 방식은 할일(tasks) 기능과 동일한 패턴을 따른다:

- 건물만 연결 (`property_id` only)
- 건물 + 객실 (`property_id` + `room_id`)
- 건물 + 객실 + 예약 (`property_id` + `room_id` + `reservation_id`)
- 예약 없이 고객명만 (`guest_name` 텍스트 직접 입력)

`property_name` / `room_label` 은 연결 시점의 텍스트 스냅샷으로 저장된다.
건물·객실이 나중에 삭제되더라도 기록이 보존된다.

---

## Image Attachments

캡처 이미지를 첨부할 수 있다. OTA 플랫폼의 리뷰·메시지 화면 스크린샷을 주로 사용한다.

제한:

- 컴플레인당 최대 5장
- 장당 최대 8MB

Current implementation:

- `request-images` Supabase Storage 버킷 공유 사용
- 경로: `{org_id}/complaint-images/{complaint_id}/{filename}`
- 댓글 이미지 경로: `{org_id}/complaint-comment-images/{complaint_id}/{comment_id}/{filename}`
- 클라이언트 측 압축 후 업로드 (long edge 1600px, quality 0.75)

---

## Comments (댓글)

컴플레인에는 댓글을 달 수 있다. Part-time Staff를 제외한 전 구성원이 댓글 가능.

댓글에도 이미지를 최대 5장 첨부할 수 있다 (대응 기록, 내부 공유 자료 등).

댓글 CRUD:

- **작성**: Part-time Staff 제외 전원
- **수정**: 댓글 작성자 본인만
- **삭제**: 댓글 작성자 또는 Owner / Office Admin / Super Admin

---

## Mobile UI

### 목록 화면

URL: `/mobile/complaints`

- 최신순 정렬
- 필터: 플랫폼, 건물, 상태 (open / resolved)
- 각 항목: 플랫폼 뱃지, 제목, 건물·객실명, 날짜, 상태 인디케이터, 이미지 첨부 아이콘

### 작성 화면

URL: `/mobile/complaints/new`

구성:

1. 플랫폼 선택 (필수)
2. 제목 (필수)
3. 내용·경위 설명 (선택)
4. 건물·객실·예약 context picker (tasks 패턴 재사용)
5. 고객명 직접 입력 (예약 연결 없을 때)
6. 이미지 업로드 (최대 5장)

작성 권한이 없는 역할에게는 작성 버튼을 표시하지 않는다.

### 상세 화면

URL: `/mobile/complaints/[id]`

구성:

1. 플랫폼 출처 칩 + 날짜
2. 제목
3. 연결된 건물 / 객실 / 예약 / 고객명 메타 블록
4. 내용 본문
5. 이미지 그리드 (탭 → 라이트박스 핀치줌)
6. 상태 토글 (작성자·관리자에게만 표시)
7. 댓글 스레드

---

## Admin UI

### 어드민 목록

URL: `/admin/complaints`

- 전체 조직 컴플레인 목록
- 플랫폼 / 건물 / 상태 필터 + 날짜 범위 필터
- 작성자 표시

### 어드민 상세

URL: `/admin/complaints/[id]`

- 모바일 상세와 동일한 구성
- 어드민은 모든 컴플레인의 상태를 변경할 수 있다

---

## Server Actions

```txt
src/app/mobile/complaints/actions.ts
  createComplaint(input)               -- 오피스 이상만
  updateComplaint(id, patch)           -- 작성자만, open 상태일 때
  deleteComplaint(id)                  -- 작성자·Owner·Admin만
  resolveComplaint(id)                 -- 작성자·Owner·Office Admin
  reopenComplaint(id)                  -- 작성자·Owner·Office Admin

  createComplaintComment(complaintId, body, imageUrls)
  updateComplaintComment(commentId, body)
  deleteComplaintComment(commentId)
```

---

## RLS / Org Isolation

- 모든 `customer_complaints` 행은 `organization_id` 로 격리된다.
- **읽기**: `has_active_membership(organization_id)` 또는 platform admin
- **쓰기**: 서버 액션이 service_role 클라이언트로 처리 (RLS는 읽기만 제어)

관련 마이그레이션:

```txt
202606290001_customer_complaints.sql
```

---

## Open Questions

- 컴플레인 알림: 새 컴플레인 등록 시 전체 알림 또는 특정 역할에만 알림을 보낼지.
- 심각도(severity) 레벨 추가 여부 (낮음/중간/높음) — 현재 MVP에는 포함하지 않음.
- Field Manager도 향후 작성 권한을 부여할지 (현재는 열람·댓글만).
- 어드민 대시보드에서 플랫폼별·기간별 통계 집계 기능 여부.
