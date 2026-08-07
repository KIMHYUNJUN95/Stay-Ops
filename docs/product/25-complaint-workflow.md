# Customer Complaint & External Review Workflow (고객 컴플레인·외부 리뷰)

## Purpose

StayOps의 컴플레인 영역은 다음 두 종류의 운영 데이터를 한곳에서 본다.

1. **수동 컴플레인** — 직원이 고객 연락, 현장 이슈, OTA 메시지 등에서 직접 등록하는 내부 처리 기록
2. **외부 리뷰** — Beds24를 통해 Airbnb·Booking.com에서 수집하여 원문과 평점을 확인하는 읽기 중심 기록

두 데이터는 같은 것이 아니다. 낮은 평점의 외부 리뷰를 자동으로 컴플레인으로 만들지 않는다. 사무실/CS가
검토 후 실제 조치가 필요할 때만 외부 리뷰를 수동 컴플레인으로 전환·연결한다. 이 원칙은 불필요한 업무
티켓과 Beds24 API 호출을 모두 줄인다.

모바일과 대시보드는 별도 기능이나 별도 복사본이 아니다. 두 화면은 같은 조직의 `customer_complaints`,
`external_reviews`, `review_translations`를 읽고 같은 연결 상태를 사용한다. 화면은 역할과 작업 밀도에 맞게
다르되, 어느 쪽에서 만든 수동 컴플레인·상태 변경·댓글·리뷰 전환도 다른 쪽에서 같은 기록으로 확인한다.

이번 문서는 **기획 재설계만** 다룬다. 화면 시각 디자인과 코드·DB 마이그레이션 구현은 다음 작업으로
분리한다.

---

## Scope and Non-goals

### Included

- 기존 모바일 수동 컴플레인 등록·상세·댓글·상태 처리 흐름 유지 및 재설계 기준 정의
- Beds24 기반 Airbnb / Booking.com 외부 리뷰의 로컬 수집·조회
- 평점, 위험도, 건물, 객실, 날짜, 플랫폼으로 리뷰를 찾는 운영 조회
- 선택 기간의 건물별·객실별 외부 리뷰 평점 요약
- 외부 리뷰의 필요 시점 번역(한국어·일본어·영어)과 번역 결과 재사용
- 외부 리뷰를 근거로 한 수동 컴플레인 생성 및 상호 연결
- 대시보드에서 수동 컴플레인 관리와 외부 리뷰 검토

### Excluded from v1

- Airbnb·Booking.com 원문에 대한 StayOps 내 답글 작성·전송
- 외부 리뷰 자동 컴플레인 생성, 자동 알림, AI 요약·감정 분석
- 화면에서 Beds24를 즉시 호출하는 새로고침/필터링
- 리뷰 통계 대시보드, CSV/Excel export, 담당자 배정, 별도 severity 입력
- OTA에 없는 객실 정보를 추정해 표시하는 동작

---

## Data Domain and Link Rule

### Manual complaint (`customer_complaints`)

직원이 직접 작성·수정·처리하는 내부 운영 기록이다. 기존 `open` / `resolved` 상태와 댓글, 이미지,
건물·객실·예약 문맥은 유지한다.

수동 컴플레인은 일반 입력으로도 만들 수 있고, 외부 리뷰 상세에서 **컴플레인으로 등록**을 선택하여
만들 수도 있다. 후자의 경우 원 리뷰 ID와 리뷰 당시의 플랫폼·평점·본문·문맥 스냅샷을 함께 보존한다.

### External review (`external_reviews`, planned)

Beds24가 제공하는 Airbnb 또는 Booking.com 리뷰의 로컬 사본이다. 원문·평점·리뷰 시각은 외부 출처가
정하는 값이며 StayOps에서 수정하거나 삭제하지 않는다. 동기화가 갱신할 수 있으며, 내부 처리 기록은
연결된 수동 컴플레인에 남긴다.

### Room mapping rule

외부 리뷰에는 건물과 객실을 모두 보여주는 것을 목표로 한다. 다만 객실은 Beds24 payload의 예약/객실
식별자와 StayOps 예약·객실이 **신뢰성 있게 매칭되는 경우에만** 연결한다. 매칭 근거가 없으면 건물만
표시하거나 `객실 정보 없음`으로 표시하며, 날짜나 이름만으로 객실을 추정하지 않는다.

---

## Rating Risk Rules (confirmed 2026-08-04)

외부 리뷰는 플랫폼 원점수와 판정 결과를 함께 저장·표시한다. 플랫폼별 척도와 세부 평점 항목을 억지로
같은 점수 체계로 환산하지 않는다.

| 플랫폼 | 점수 기준 | 위험도 |
|---|---:|---|
| Airbnb | 3 **이하** (경계 포함) | `risk` (문제) |
| Airbnb | 3 초과 | `normal` |
| Booking.com | 7.0 **이하** (경계 포함) | `risk` (문제) |
| Booking.com | 7.0 초과 | `normal` |

- 위험도는 `unrated` / `normal` / `risk` **3값**이다. 이전 초안의 Booking `critical`(7.0 미만) 단계와
  Airbnb 1~2점 분리안은 2026-08-04에 폐기했다. 두 플랫폼 모두 단일 경계 하나만 쓴다.
- 경계값은 **위험 쪽에 포함**한다. Airbnb 3점과 Booking 7.0점은 `risk`다.
- Airbnb `overall_rating`은 API가 정수(int32)로 돌려주므로 실질 `risk` 구간은 1·2·3점이다.
- 위험도는 사용자가 편집하는 필드가 아니라 플랫폼·원점수에서 서버가 일관되게 계산한다.
- 점수가 없거나 범위를 검증할 수 없는 리뷰는 위험도를 계산하지 않고 `unrated`로 보관한다.

### 전량 수집 원칙

`risk` 판정은 **분류**이지 수집 필터가 아니다. 조직의 외부 리뷰는 점수와 무관하게 전량 저장한다.
문제 리뷰만 저장하면 아래 "Period Rating Summary"의 건물·객실 평균 평점이 성립하지 않고, Airbnb
엔드포인트에는 애초에 점수·날짜 필터가 없어 서버에서 분류하는 것 외의 선택지도 없다.

### Provider-specific review content and detailed scores

- 전체 평점은 위험도 판정과 기본 정렬에 사용한다. 세부 평점은 출처가 제공한 경우에만 상세에서 보조 정보로
  표시하며, 위험도를 다시 계산하거나 서로 다른 플랫폼의 세부 항목을 비교하는 기준으로 쓰지 않는다.
- 세부 평점은 `rating_breakdown` 원본 구조로 보존한다. 플랫폼마다 항목명·점수 척도·제공 여부가 다르므로
  `청결/위치/...` 같은 StayOps 공통 고정 컬럼을 만들지 않는다.
- **세부 점수 항목명은 화면에서만 현지화한다 (2026-08-06 확정).** 저장되는 `rating_breakdown`의 키와
  구조는 플랫폼이 준 그대로 두고, 상세 화면에서 표시할 때만 `dictionary.complaints.breakdownLabels`
  (ko/ja/en)로 라벨을 바꾼다. 이전에는 `clean` → `Clean`처럼 영문 키를 그대로 보여 줬으나, 운영 담당자가
  읽는 화면에서 영어 항목명이 그대로 노출되는 것은 다국어 원칙에 어긋나므로 변경했다.
  - 사전 키는 소문자·영숫자로 정규화해 조회한다 (`check_in` / `checkIn` / `Check-In` → `checkin`).
  - 사전에 없는 항목은 종전과 같이 읽기 좋은 영문(`Check In`)으로 폴백한다. 플랫폼이 새 항목을 추가해도
    화면이 비지 않으며, 사전에 키를 추가하면 그때부터 번역된다.
  - 파싱·라벨 매핑은 `src/lib/external-review-rules.ts`의 `parseReviewBreakdown()` 하나로 통일한다
    (모바일 상세와 어드민 상세 패널이 같은 로직을 두 벌 들고 있던 것을 합쳤다).
- **Booking.com**은 긍정 리뷰와 부정 리뷰를 별도 본문으로 제공할 수 있으므로, 두 원문·번역을 구분하여
  표시한다. 둘 중 하나만 있거나 둘 다 없을 수 있다.
- Booking.com은 리뷰 본문 없이 **점수만** 제공할 수 있다. 이 경우에도 외부 리뷰 행을 정상 수집·표시하며,
  전체/세부 점수와 건물·객실·날짜만 보여 준다. 본문 없음은 오류·누락 상태가 아니다.
- 번역 버튼은 실제 텍스트가 있는 긍정/부정 본문에만 제공한다. 점수만 있는 리뷰에는 표시하지 않는다.

---

## Permissions

### Manual complaint

작성 가능 역할:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff

작성 불가 역할: Field Manager, Staff, Part-time Staff.

조직 내 모든 활성 구성원은 읽을 수 있다. 댓글은 Part-time Staff를 제외한 전 구성원이 작성할 수 있다.
상태 변경은 기존 계약을 유지한다: 작성자는 본인 건, Owner / Office Admin은 전체, CS Staff는 본인 작성
건만 `open ↔ resolved` 전환한다.

### External review

- 읽기: 같은 조직의 모든 활성 구성원 및 platform admin
- 수집·수정: 사용자 직접 권한이 아닌 서버 전용 Beds24 동기화 경로만 허용
- 외부 리뷰에서 수동 컴플레인 생성: 위 수동 컴플레인 작성 역할만 허용

모든 조회와 연결은 `organization_id`를 반드시 기준으로 한다.

### Cross-surface consistency contract

- 모바일과 대시보드의 목록·상세는 동일한 조직 스코프와 동일한 외부 리뷰 ID / 컴플레인 ID를 사용한다.
- 모바일에서 만든 수동 컴플레인은 대시보드 수동 컴플레인 목록에, 대시보드에서 상태 변경하거나 리뷰를
  컴플레인으로 전환한 결과는 모바일 목록·상세에 반영된다.
- **양쪽 등록 폼은 같은 서버 경로를 쓴다** (2026-08-06). 모바일 `createComplaintAction`과 대시보드
  `createManualComplaintAction`은 UI만 다르고 둘 다 `createComplaint`를 부른다. 권한·조직 스코프·
  제목/플랫폼/이미지 검증은 그 한 곳에만 있다. 화면별 저장 경로나 별도 검증 규칙을 만들지 않는다.
- 외부 리뷰 수집과 번역 캐시는 서버에서 한 번만 수행한다. 모바일/대시보드 각각이 별도로 Beds24·DeepL을
  호출하거나 동일 리뷰를 중복 저장해서는 안 된다.
- 갱신 전파는 구현 단계에서 공용 재검증/실시간 구독 정책으로 정하되, 오래된 화면 데이터로 중복 전환·
  잘못된 상태 변경이 일어나지 않도록 모든 mutation은 서버에서 최신 연결 상태와 권한을 다시 검증한다.
- 각 화면에서 노출하는 필드명·위험도 계산·`객실 정보 없음` 처리·원문/번역 표기는 같은 도메인 규칙을
  공유한다. 플랫폼마다 다른 점수 척도는 두 화면 모두 원점수로 표시한다.

---

## Manual Complaint Fields

필수 필드는 기존과 같다.

```txt
id, organization_id, created_by_user_id, title, platform, status,
image_urls, created_at, updated_at
```

선택 필드: `description`, `platform_ref`, `property_id`, `property_name`, `room_id`, `room_label`,
`reservation_id`, `guest_name`, `resolved_at`, `resolved_by_user_id`.

외부 리뷰에서 전환한 수동 컴플레인에는 계획된 `external_review_id` 연결값과 리뷰 스냅샷을 추가한다.
일반 수동 등록에는 이 값이 비어 있다. 건물명·객실명은 연결 시점 스냅샷도 저장하여 마스터 변경/삭제 뒤에도
기록을 보존한다.

이미지는 기존 정책을 유지한다: 컴플레인 및 댓글 각각 최대 5장, 장당 최대 8MB, `request-images` 버킷,
클라이언트 압축 후 업로드. 컴플레인 본체는 MVP hard delete, 댓글은 `deleted_at` soft delete다.

---

## External Review Fields (planned, 2026-08-04 API 조사 반영)

```txt
id, organization_id, provider, external_review_id,
rating_value, rating_scale, risk_level, rating_breakdown,
reviewed_at, imported_at, source_updated_at,
property_id, property_name, room_id, room_label, reservation_id,
guest_display_name, headline, source_language_code,
review_text, positive_review_text, negative_review_text, private_feedback,
ota_reply_text, ota_replied_at, raw_payload,
linked_complaint_id, created_at, updated_at
```

- `provider`: v1은 `airbnb` 또는 `booking`만 허용한다.
- `(organization_id, provider, external_review_id)`는 중복되지 않아야 한다.
- `rating_value`/`rating_scale`은 출처 원점수 보존용이다. 위험도·정렬은 검증된 원점수로 계산한다.
- `source_reservation_id`는 **제공자가 쓰는 예약 번호**다. Airbnb는 `reservation_confirmation_code`,
  Booking.com은 `reservation_id`(Beds24 bookingId)를 담는다. 화면에 보여 주는 «예약 ID»가 이 값이다.
  `reservation_id`(uuid)는 로컬 예약 행으로의 링크이며 사람이 읽을 값이 아니라 노출하지 않는다.
- `rating_breakdown`은 제공된 플랫폼별 세부 점수의 원본 구조다. 값이 없을 수 있으며, 공통 스키마로
  정규화하지 않는다. Airbnb는 `category_ratings[]`, Booking.com은 `scoring{clean, facilities, location,
  services, staff, value}` 구조를 그대로 담는다.
- `review_text`, `positive_review_text`, `negative_review_text`는 모두 nullable이다. 특히 Booking.com은
  긍정·부정 본문 없이 점수만 제공할 수 있다.
- `headline`은 Booking.com `content.headline`(리뷰 제목)이다. Airbnb에는 대응 필드가 없어 항상 null이다.
- `source_language_code`는 Booking.com `content.language_code`다. 값이 있으면 번역 시 언어 자동 감지를
  건너뛰어 DeepL 사용량을 아낀다. Airbnb는 제공하지 않으므로 자동 감지로 되돌아간다.
- `private_feedback`은 **Airbnb 전용**이다. 게스트가 공개 리뷰와 별도로 호스트에게만 보낸 비공개 내용이며,
  OTA에 공개되지 않는다. 점수가 없는 텍스트이므로 **위험도·평점 집계에 절대 반영하지 않는다.** 화면에서는
  공개 리뷰와 시각적으로 구분해 표시한다(비공개 배지). Booking.com에는 대응 필드가 없다.
- `ota_reply_text` / `ota_replied_at`은 Booking.com `reply{text, last_change_timestamp}`다. 이미 OTA에
  달린 답글을 **읽기 전용으로 표시**하기 위한 값이다. StayOps에서 답글을 작성·전송하는 기능은 v1 범위 밖이며
  이 필드가 그 범위를 넓히지 않는다.
- `raw_payload`는 장애 조사·매핑 보완을 위한 서버 전용 원문 보관이며, UI에 그대로 노출하지 않는다.
  Beds24 리뷰 엔드포인트가 Beta/Alpha라 스키마가 바뀔 수 있으므로 보존 가치가 크다.
- `linked_complaint_id`는 해당 리뷰로부터 만든 수동 컴플레인 하나를 가리킨다. 하나의 리뷰를 여러 티켓으로
  중복 전환하지 않도록 서버가 제어한다.

### 플랫폼별 필드 가용성 (실측)

두 엔드포인트가 주는 정보가 **비대칭**이다. 없는 값을 추정으로 채우지 않는다.

| 항목 | Airbnb | Booking.com |
|---|---|---|
| 객실 식별 | 쿼리한 `roomId`로 **확정** | 응답에 없음 → `reservation_id` 역조회 필요 |
| 예약 식별 | `reservation_confirmation_code` 제공 (Airbnb 확인 코드) | `reservation_id`(Beds24 bookingId) 제공 |
| 게스트 이름 | 리뷰에는 **없음** (`reviewer_id`만) → 매칭된 예약의 `guest_name`으로 채움 | `reviewer.name` 제공 |
| 리뷰 제목 | 없음 | `content.headline` |
| 원문 언어 | 없음 (자동 감지) | `content.language_code` |
| 비공개 피드백 | `private_feedback` | 없음 |
| OTA 답글 | 없음 | `reply` |
| 본문 | `public_review` 단일 | `positive` / `negative` 분리 |

즉 **객실 매핑 신뢰도는 Airbnb가 높고, 게스트 이름은 Booking.com만 리뷰 자체에서 온다.** Booking.com
리뷰의 객실은 `reservation_id`로 로컬 `reservations`를 조회해 얻으며, 로컬에 해당 예약이 없으면 `room_id`를
null로 두고 `객실 정보 없음`으로 표시한다.

#### Airbnb 예약 매칭 (2026-08-06 정정)

초기 기획은 "Airbnb는 예약 ID를 제공하지 않는다"로 적혀 있었으나 **사실이 아니다.** 보존해 둔
`raw_payload`를 실측한 결과 Airbnb 리뷰 **2,214건 전부**가 `reservation_confirmation_code`
(예: `HMRWNK5RQW`)를 갖고 있었다. Beds24 bookingId가 아니라서 `source_reservation_id` 역조회로는
잡히지 않았을 뿐이고, **같은 코드가 우리 예약의 `raw_payload->>apiReference`에 저장돼 있다.**

- 수집 시 조직 범위 안에서 확인 코드로 예약을 찾아 `reservation_id`와 `guest_display_name`을 채운다.
- **객실은 예약에서 가져오지 않는다.** 조회한 `roomId`가 이미 확정값이라 더 신뢰도가 높다.
  Booking.com과 반대 방향이다.
- 매칭 실패 시 두 값 모두 null로 둔다. 추정하지 않는다는 원칙은 그대로다.
- **작성자 이름 자체는 여전히 Airbnb가 주지 않는다** (`reviewer_id` 숫자 ID뿐). 화면에 보이는 이름은
  리뷰가 아니라 **매칭된 예약**에서 온 값이다.

**커버리지 한계 (2026-08-06 실측).** 매칭률은 리뷰가 아니라 **예약 보유 범위**가 결정한다. 로컬
`reservations`가 2026-04-22부터만 있어 전체 2,214건 중 222건(10%)만 매칭된다. 반면 **2026-05-01 이후
리뷰는 222/233 = 95%**가 매칭된다. 과거분까지 채우려면 Beds24 예약 백필을 과거로 더 돌려야 하며 이는
별도 작업이다. 매칭된 222건은 **전부** 예약에 게스트 이름이 있었다.

#### 화면에 보여 주는 예약 식별자

`external_reviews.source_reservation_id`에 **제공자가 쓰는 예약 번호**를 저장하고 이 값을 표시한다
(Airbnb 확인 코드 / Booking.com bookingId). 운영자가 OTA 익스트라넷에서 그대로 검색할 수 있는 값이라야
의미가 있기 때문이다. `reservation_id`(uuid)는 우리 내부 링크이며 화면에 노출하지 않는다 — 이전 구현은
Booking.com 상세에서 이 uuid를 «예약 ID»로 그대로 보여 주고 있었다.

### 수집 시 제외 규칙 (Airbnb)

Airbnb 리뷰는 **양방향**이다. 호스트가 게스트에게 쓴 리뷰까지 그대로 저장하면 안 된다.

- `reviewer_role`이 게스트인 리뷰만 저장한다. 호스트 작성 리뷰는 버린다.
- `submitted`가 false이거나 `hidden`이 true인 리뷰는 저장하지 않는다.
- `reviewee_response` / `responded_at`은 호스트 응답 문맥이며 v1에서는 저장하지 않는다.

---

## Review Translation (confirmed)

외국어 리뷰는 원문을 항상 보존하고, 사용자가 요청한 경우에만 앱 언어(`ko`, `ja`, `en`)로 번역한다.
번역은 외부 리뷰의 보조 정보이며, 원문을 대체하거나 수정하지 않는다.

### User behavior

- 외부 리뷰 상세에서 현재 앱 언어가 원문 언어와 다를 때 `번역 보기`를 제공한다.
- 첫 요청은 서버가 원문 언어를 판별해 해당 앱 언어로 번역한다. Booking.com은 `source_language_code`가
  있으면 그 값을 쓰고, 없거나 Airbnb면 자동 감지로 되돌아간다. 사용자가 원문과 번역문을 전환할 수 있다.
- 같은 `리뷰 + 본문 종류 + 목표 언어` 조합은 저장된 번역을 즉시 재사용한다. 목록 화면, 정렬, 필터에서는 번역 요청을
  만들지 않는다.
- 번역은 `자동 번역`임을 명시한다. 번역 실패·무료 한도 도달 시 원문은 계속 열람 가능하다.

### Provider and budget rule

- v1 제공자는 **DeepL API Free**다. 무료 한도는 월 500,000자이며, 문자 수는 원문 입력 길이 기준으로
  계산된다. 출처: [DeepL API usage limits](https://developers.deepl.com/docs/resources/usage-limits).
- 기본 예상량은 하루 최대 5건, 월 약 150개 리뷰다. 번역을 실제로 연 상세에서만 1회 요청하고 결과를
  재사용하므로, 원문이 매우 길지 않은 일반 리뷰 운영량에는 적합하다.
- 월 사용량과 한도를 서버에서 조회·기록한다. 450,000자에 도달하면 새 자동 번역 요청을 중단하여
  무료 한도 초과를 막고, 다음 월 갱신 뒤 재개한다. 이미 저장된 번역은 계속 표시한다.
- 번역 API 키는 서버 환경변수에만 둔다. 브라우저·클라이언트 로그·문서에 키를 노출하지 않는다.

### Planned data shape

```txt
review_translations (planned)
  id, organization_id, external_review_id, source_part,
  target_locale, source_locale,
  translated_text, provider, translated_at,
  source_text_hash, created_at, updated_at
  unique (external_review_id, source_part, target_locale)
```

`source_part`는 `review` / `positive` / `negative` / `headline` / `private` 다섯 값이다. `private`는
Airbnb 비공개 피드백이며, 번역 결과도 상세에서 비공개 영역 안에 표시한다.

`source_text_hash`가 현재 원문과 다르면 이전 번역을 표시하지 않고 다음 상세 요청 때 새 번역을 만든다.
번역은 외부 리뷰와 같은 조직에만 연결하며, 외부 리뷰 삭제/정리 정책이 정해질 때 함께 cascade 정책을
확정한다.

---

## Period Rating Summary (confirmed)

외부 리뷰가 쌓이면 선택 기간 내 리뷰만 기준으로 건물별 평점과, 적용 가능한 건물의 객실별 평점을
함께 확인한다. 이는 리뷰 원점수를 집계한 운영 지표이며, 수동 컴플레인의 상태나 번역 여부는 평점에
영향 주지 않는다.

### Aggregation rule

- 집계 기준일은 외부 리뷰의 `reviewed_at`이다. 선택 기간 밖 리뷰와 리뷰 날짜가 없는 행은 기간 평점에
  포함하지 않는다.
- 건물 평점은 해당 건물의 기간 내 전체 리뷰로 계산한다. 객실 평점은 신뢰성 있게 객실이 연결된 기간 내
  리뷰만 계산한다.
- Airbnb(5점)와 Booking.com(10점)은 원점수 척도가 다르므로 하나의 평균으로 합치지 않는다. 각 건물·객실에
  **플랫폼별 평균 원점수 + 리뷰 수**를 함께 제공한다. 두 플랫폼을 합친 단일 종합 평점은 이번 범위에 없다.
- 리뷰가 없는 기간은 0점이 아니라 `리뷰 없음`으로 표시한다. 객실 매핑이 없는 리뷰는 건물 평점에는
  포함할 수 있어도 객실 평점에는 포함하지 않는다.
- 별도 집계 테이블을 먼저 만들지 않는다. `external_reviews` 로컬 데이터에서 조직·기간·플랫폼·건물/객실
  조건으로 서버 집계해 두 화면이 같은 결과를 사용한다. 성능 문제가 확인될 때만 캐시/집계 구조를 추가한다.

### 문제 리뷰 집계 (confirmed 2026-08-04)

평균 평점만으로는 "어느 객실이 문제인지"가 드러나지 않는다. 리뷰 수가 많은 객실은 낮은 점수 몇 건이
평균에 묻히기 때문이다. 그래서 건물·객실 요약은 평균과 **문제 건수를 함께** 제공한다.

- 각 건물 행과 객실 행은 플랫폼별로 `평균 원점수` / `리뷰 수` / `문제 리뷰 수`(`risk_level = 'risk'`)를
  함께 낸다. 문제 비율(문제 수 ÷ 리뷰 수)도 함께 제공해 리뷰 수가 다른 객실을 비교할 수 있게 한다.
- 문제 건수는 평균 평점을 대체하지 않는다. 둘은 같은 기간·같은 리뷰 집합에서 나온 별개 지표다.
- 요약의 문제 건수에서 **해당 건물·객실의 문제 리뷰 목록으로 바로 내려갈 수 있어야 한다.** 이 드릴다운이
  이 집계의 주 사용 목적이다.
- 객실이 연결되지 않은 리뷰(`room_id` null)는 건물 문제 건수에는 포함하되 객실 행에는 넣지 않는다.
  건물 합계와 객실 합계가 어긋날 수 있으므로 화면에서 `객실 미연결 N건`을 별도로 밝힌다.
- 오쿠보 독채 규칙(아래)이 적용되는 건물은 객실 행 없이 건물 문제 건수만 제공한다.
- `unrated` 리뷰는 평균과 문제 건수 어느 쪽에도 넣지 않으며, 리뷰 수에만 별도로 밝힌다.

### Okubo detached-house rule

오쿠보의 운영 단위는 모두 독채이므로 **건물 평점 하나가 곧 해당 독채의 평점**이다. 오쿠보 건물에서는
객실별 평점 영역·객실 순위·객실 평균·객실 문제 건수를 만들지 않는다. 내부 객실 데이터가 존재하더라도 리뷰
집계 화면에서는 건물 단위로만 합산한다.

판정 근거는 **정규화된 객실 라벨이 건물명으로 접히는지**다:
`getCanonicalRoomLabel(propertyName, roomLabel) === getCanonicalPropertyName(propertyName)`
(`src/lib/room-label-normalization.ts`). 접히면 그 건물은 단일 운영 단위이므로 객실 행을 만들지 않는다.
`src/lib/home.ts`의 "room key == property → 건물만 표시"와 같은 규칙이며, 오쿠보는 이 함수 안에서
이미 그렇게 접힌다. 건물 이름 문자열로 직접 분기하지 않는다.

> **`property_type = 'standalone'`을 쓰지 않는 이유 (2026-08-05 실측 후 정정).**
> 이 문서 초안은 `properties.property_type = 'standalone'`을 판정 근거로 지정했으나, 원격 마스터를
> 확인해 보니 **16개 건물이 전부 `standalone`**이었다 — 객실 22개짜리 Arakicho A, 20개짜리
> Kabukicho까지 포함된다. 즉 유지되지 않는 기본값이고, 그대로 쓰면 모든 건물의 객실 행이 사라져
> 이 화면의 존재 이유인 객실별 문제 파악이 정확히 불가능해진다. 마스터가 실제 값으로 정비되면
> 그때 `property_type` 기반으로 되돌리는 것이 더 낫다.

### Date range

기간의 기본값, 빠른 기간 버튼, 직접 선택 방식, 비교 기능 여부는 실제 UI 설계 단계에서 정한다. 구현 전에는
임의의 최근 30일/월간 기본값을 제품 규칙으로 고정하지 않는다. 어떤 기간을 선택하든 위의 동일한 집계 규칙을
적용한다.

---

## Beds24 Collection and Credit Policy (2026-08-04 API 조사로 재작성)

외부 리뷰는 Beds24 API를 **수집 전용**으로 사용하고, StayOps DB를 운영 화면의 유일한 조회 원본으로 쓴다.

### 실제 엔드포인트 계약 (조사 확정)

| | Airbnb | Booking.com |
|---|---|---|
| 엔드포인트 | `GET /channels/airbnb/reviews` | `GET /channels/booking/reviews` |
| Beds24 성숙도 | **Beta** | **Alpha** |
| 필수 파라미터 | `roomId` (룸타입 단위) | `propertyId` + `from`(YYYY-MM-DD) |
| 날짜 필터 | **없음** | 있음 |
| 페이지 크기 | 100건, `pages.nextPageExists` | 100건, 동일 |

로컬 호출 키는 이미 존재한다: `rooms.external_room_id`(Airbnb `roomId`),
`properties.external_property_id`(Booking `propertyId`), `reservations.source_reservation_id`
(Booking 리뷰의 `reservation_id` 역조회용). 별도 매핑 테이블을 새로 만들지 않는다.

### 수집 주기 (confirmed 2026-08-04)

- **룸타입/건물 단위로 하루 1회(아침 8시 JST)** 동기화한다. 이전 초안의 "채널별 하루 1회 =
  조직당 최대 2회"는 API가 단위 파라미터를 필수로 요구하므로 성립하지 않아 폐기했다.
  하루 2회에서 1회로 줄인 것은 2026-08-05 결정이다 — 리뷰는 체크아웃 며칠 뒤에 달려 실시간성이
  필요 없고, Airbnb 50건 상한에 하루 만에 도달할 일도 없다.
- 따라서 1회 주기의 기본 호출 수는 `(Airbnb 연동 룸타입 수) + (Booking 연동 건물 수)`이며, 페이지네이션이
  발생하면 그만큼 늘어난다. 하루 총량은 그 2배다.
- 연동되지 않은(=`external_room_id` / `external_property_id`가 없는) 객실·건물은 호출하지 않는다.
- 초기 도입/복구 때만 제한된 과거 기간(기본 최근 90일)을 가져온다. **Booking.com만 `from`으로 서버 측
  제한이 가능하고, Airbnb는 날짜 파라미터가 없어 전량 응답을 받은 뒤 StayOps에서 기간을 잘라낸다.**
  이후에는 중복 키 UPSERT로 증분 반영한다.
- 웹·모바일 목록, 정렬, 필터, 상세 진입은 Beds24 호출을 절대 만들지 않는다.
- Beds24 응답의 `X-RequestCost`, `X-FiveMinCreditLimit-Remaining`, `X-FiveMinCreditLimit-ResetsIn`을
  동기화 로그에 기록한다. 잔여 크레딧이 낮으면 남은 대상의 리뷰 동기화를 다음 주기로 미루며, 예약 웹훅
  처리보다 우선하지 않는다. 중단 지점은 다음 주기가 이어받는다.
- API 토큰은 서버 환경변수에서만 사용·재사용한다. 브라우저, 문서, 로그에 토큰을 노출하지 않는다.

두 엔드포인트가 Beta/Alpha이므로 응답 스키마 변화에 대비해 `raw_payload`를 항상 보존하고, 파싱 실패는
해당 리뷰 1건만 건너뛰고 나머지 수집을 계속한다.

Beds24 예약 웹훅 우선 원칙은 유지한다. 리뷰는 웹훅이 아닌 정기 수집이 필요하더라도, 예약/객실 연결은
이미 로컬에 수집된 예약과 객실 마스터를 우선 사용한다.

---

## Planned UX / IA (visual design deferred)

### Mobile

- `/mobile/complaints`: 수동 컴플레인과 외부 리뷰를 구분해 탐색할 수 있는 통합 진입점
  - **건물명은 화면에서 현지화한다 (2026-08-07).** `external_reviews.property_name` 에는 Beds24
    원본(`Arakicho A`, `Okubo_A (B棟)` …)이 들어 있는데 이건 운영 식별자이지 사용자에게 보여줄
    이름이 아니다. 캘린더·청소와 **같은 경로**(`getCanonicalPropertyName` → `localizePropertyName`
    + `dictionary.cleaning.buildingLabels`)로 바꿔 ko/ja/en 어디서든 읽히게 한다.
    - 건물 필터 칩의 **값은 정규화 이름**이다. 같은 건물이 원본 표기만 다르게 여러 개 들어와도
      칩이 쪼개지지 않는다.
    - 목록 칩과 카드 하단 건물명이 **같은 라벨**을 쓴다. 서로 다르면 같은 건물인지 알 수 없다.
    - **객실 라벨은 변환하지 않는다** — 현장에서 부르는 식별자 그대로여야 한다.
    - 저장 데이터는 그대로다. 표시 단계에서만 바꾼다.
- `/mobile/complaints/new`: 기존 수동 등록. 플랫폼·제목·내용·건물/객실/예약·고객명·사진 입력
- `/mobile/complaints/[id]`: 수동 컴플레인 상세, 상태·댓글·이미지
- `/mobile/complaints/reviews/[id]` (planned): 외부 리뷰 원문, 원점수, 위험도, 건물/객실/예약 문맥,
  연결된 컴플레인 또는 전환 액션, 제공된 세부 점수, 텍스트가 있을 때만 원문/자동 번역 전환

모바일에서는 현장 입력을 방해하지 않는 수동 등록을 우선한다. 외부 리뷰는 읽기·문맥 확인과 권한 있는
사용자의 전환까지만 제공한다. 생성·상태·댓글·전환·번역 결과는 대시보드와 공통 데이터 원본에 즉시
저장되며, 모바일 전용 복사본을 만들지 않는다. 외부 리뷰 탐색에서는 선택 기간의 건물 평점과, 오쿠보가 아닌
건물의 객실별 평점을 같은 집계 규칙으로 확인할 수 있다.

### Admin dashboard

`/admin/complaints` (planned)는 사무실/CS의 통합 검토 콘솔이다. 공용 어드민 테이블·필터·우측 상세 패널
패턴을 사용하며 별도 디자인 체계를 만들지 않는다.

- 뷰 3개: `수동 컴플레인` / `외부 리뷰` / `문제 객실`. 뷰 전환은 서버 렌더 한 번으로 끝내기 위해
  쿼리스트링(`?view=`) 기반 `<a>`(`next/link`)로 렌더한다. 다른 콘솔의 `<button>` 방식과 요소는
  다르지만 공용 `.cviewbar` + `.lviews` pill 탭으로 **동일하게 보여야 한다** — 공용 `.lviews` 스타일은
  `<button>`과 `<a>`를 함께 겨냥한다(`admin-console.css`). 콘솔별 전용 탭 스타일을 새로 만들지 않는다.
- 외부 리뷰 기본 정렬: **최신 리뷰순(`reviewed_at` 내림차순)** (confirmed 2026-08-06). 위험도·낮은
  원점수는 별도 `문제만` 토글과 `문제 객실` 뷰가 맡으므로, 목록 자체는 최신순으로 고정한다.
  (이전엔 위험도 우선 → 낮은 원점수 → 최신 순이었으나, 날짜가 뒤섞여 보여 최신순으로 변경.)
- 외부 리뷰 필터: 플랫폼, 위험도, 건물, 객실, 리뷰 날짜 범위. **플랫폼(`전체`/`Airbnb`/`Booking.com`)과
  위험도(`전체`/`문제만`)는 각각 `.cxseg` 세그먼트로 제공하며 서로 독립적으로 조합된다** (구현 2026-08-06).
  Airbnb와 Booking.com은 척도가 달라(5점 vs 10점) 나눠 보는 것이 기본 사용 흐름이다.
- 수동 컴플레인 필터: 플랫폼, 상태, 건물, 객실, 등록 날짜 범위, 작성자
- **수동 컴플레인 직접 등록** (구현 2026-08-06): 수동 컴플레인 뷰 카드 헤더 오른쪽에 공용 `chipbtn`
  `+ 컴플레인 등록` 버튼을 두고, 누르면 공용 `.panel` 우측 슬라이드오버에 등록 폼이 열린다. 목록이 비어
  있을 때도 버튼은 보인다 — 빈 목록이 곧 첫 등록 시점이다.
  - 저장은 모바일 등록과 **같은 도메인 함수**(`createComplaint`)를 부른다. 화면별 저장 경로를 따로
    만들지 않는다(아래 Cross-surface consistency).
  - 입력: 제목(필수), 내용, 플랫폼, 평점, 연결, 고객명, 사진(최대 5장 — 모바일과 동일 정책).
    평점은 척도가 있는 플랫폼에서만 뜬다(`direct`/`other`는 별점 개념이 없다).
  - **연결 방식 3가지**를 세그먼트로 고른다: `예약 연결` / `건물 · 객실` / `연결 안 함`.
  - 진입점 노출은 `canWriteComplaint`로 판단하고, 실제 권한은 서버 액션이 다시 검증한다.

#### 왜 「건물 · 객실 직접 선택」이 필요한가 (2026-08-06)

모바일 등록 폼은 **예약을 고르는 길 하나뿐**이다. 그런데 전화·워크인·자사 홈페이지처럼 **Beds24를
거치지 않고 들어온 예약**은 예약 피커 목록에 아예 없다. 그 결과 그런 건은 건물·객실이 빈 채로 등록되어
「문제 객실」 집계에서 통째로 빠졌다. 대시보드 등록 폼은 객실 마스터에서 건물·객실을 직접 고르는 경로를
추가해 이 구멍을 막는다.

- 자유 텍스트가 아니라 **마스터에서 고르게 한다.** 표기가 흔들리면 객실별 집계가 같은 키로 묶이지 않는다.
- 선택지는 예약 캘린더·청소가 쓰는 것과 같은 활성 객실 집합(`getActiveRoomCatalogServer`)이며, 같은
  물리 객실에 어카운트가 둘 붙어 있어도 선택지는 하나로 합친다.
- `연결 안 함`도 유효한 선택이다. 어느 방 건인지 모르는 컴플레인도 등록 자체는 가능해야 한다.
- **수동 컴플레인 삭제** (구현 2026-08-06): 각 행에 삭제 버튼(휴지통)을 두고, 누르면 중앙 정렬 확인
  모달(공용 `.modal` + `.btn--danger`)을 거친다. 컴플레인 본체는 MVP **hard delete**이며 되돌릴 수 없고
  연결된 댓글·처리 기록도 함께 사라지므로 확인 UX를 유지한다 (CLAUDE.md §9). 삭제 버튼은 **작성자 본인
  또는 조정 권한(owner/office_admin/super-admin)**일 때만 노출하며, 실제 권한은 `deleteComplaint`가
  서버에서 다시 검증한다. 삭제는 redirect 없이 목록을 그 자리에서 갱신한다.
- 행/상세 공통 정보: 플랫폼, 원점수와 위험도(리뷰), 건물, 객실, 예약 문맥, 날짜, 연결 여부.
- **목록 행에서 리뷰 본문을 전량 표시한다** (구현 2026-08-06). 상세 패널을 열지 않아도 Booking.com은
  긍정/부정을 2단(긍정 왼쪽·부정 오른쪽)으로, Airbnb는 공개 리뷰 본문을 1단으로 보여준다. 본문이 없는
  점수만 리뷰는 `점수만` 배지와 안내 문구로 표시한다. 발췌·말줄임 없이 전체 문장을 노출한다.
- 상세 패널에서는 그 위에 추가로 출처가 제공한 세부 점수, Airbnb 비공개 피드백, OTA 답글(읽기 전용),
  자동 번역 토글, 수동 컴플레인 전환을 조건부로 제공한다.
- **상세 패널 열림/닫힘은 `?review=` 쿼리로 서버 렌더**되지만, 닫기(스크림 클릭·X·Esc)는
  `ReviewDetailOverlay`(클라이언트)가 **즉시 슬라이드아웃**시키고 URL 동기화는 뒤에서 처리한다 —
  force-dynamic 서버 왕복을 기다리느라 닫힘이 지연되던 문제를 없앤다 (구현 2026-08-06).
- 상세에서 권한 있는 사용자는 외부 리뷰를 수동 컴플레인으로 전환하거나 연결된 컴플레인으로 이동한다.
- 표시할 수 없는 객실은 비어 있는 값처럼 숨기지 않고 `객실 정보 없음` 상태를 명확히 보여준다.

#### `문제 객실` 뷰 (confirmed 2026-08-04)

선택 기간의 리뷰를 건물·객실로 집계해 **어느 객실이 문제인지**를 한 화면에서 판별하는 뷰다. 이 화면이
외부 리뷰 기능의 주 운영 목적이며, 개별 리뷰 목록보다 상위에 둔다.

- 건물 행 → 객실 행으로 펼치는 2단 구조. 각 행은 플랫폼별로 `평균 원점수` / `리뷰 수` / `문제 건수` /
  `문제 비율`을 보여준다. Airbnb(5점)와 Booking.com(10점)은 같은 열에 합치지 않고 분리한다.
- 기본 정렬은 문제 비율 내림차순이며, 문제 건수·평균 평점으로도 정렬할 수 있다.
- 행의 문제 건수를 누르면 그 건물·객실의 문제 리뷰만 필터된 `외부 리뷰` 뷰로 이동한다.
- `property_type = 'standalone'` 건물은 객실 행을 펼치지 않고 건물 행 하나만 제공한다.
- 객실이 연결되지 않은 리뷰는 건물 행에 `객실 미연결 N건`으로 별도 표기한다.
- 기간 선택은 공용 `AdminDateRangePicker` / `DateRangeFormField`를 쓴다. 전용 캘린더를 만들지 않는다.
- 리뷰가 없는 기간은 0점이 아니라 `리뷰 없음`으로 표시한다.

#### 외부 리뷰 상세에서 조건부로 보이는 영역

- Booking.com: `headline`, `positive` / `negative` 분리 본문, `scoring` 세부 점수,
  OTA에 이미 달린 답글(`ota_reply_text`, 읽기 전용 — StayOps에서 답글을 쓰지 않는다)
- Airbnb: `category_ratings` 세부 점수, 공개 리뷰 본문, **비공개 피드백**
- 비공개 피드백은 `비공개` 배지와 함께 공개 리뷰와 시각적으로 분리한다. 직원이 OTA 공개 내용으로
  오해하지 않게 하는 것이 이 구분의 목적이다.

시각 디자인, 카드 구성, 컬러와 아이콘은 디자인 작업에서 결정한다. 위 목록 밖의 차트·내보내기·자동화 UI는
이번 범위에 넣지 않는다. 대시보드의 변경도 모바일과 공통 데이터 원본에 저장되며 별도 사무실 전용
컴플레인·리뷰 레코드를 만들지 않는다.

---

## Existing Implementation and Migration Boundary

현재 모바일 수동 컴플레인 백엔드는 `src/lib/complaints.ts`,
`src/app/mobile/complaints/actions.ts`, migration `202606290001_customer_complaints.sql`에 존재한다.
이번 기획은 그 동작을 즉시 바꾸지 않는다.

구현 작업에서는 새 migration으로 `external_reviews` 및 필요한 연결 필드를 추가하고, DB 타입과 RLS를 함께
갱신한다. 이미 적용된 migration은 수정하지 않는다. 구현 완료 전까지 `/admin/complaints`는 전용 라이브
화면이 아니며, 예약 캘린더의 컴플레인 진입은 기존 모바일 수동 등록 딥링크를 유지한다.

---

## Deferred Decisions

- 외부 리뷰 동기화 실패 알림의 수신 역할과 재시도 UI (알림은 개발 막바지 일괄 구현 대상)
- 외부 리뷰에 대한 내부 메모를 리뷰 자체에 둘지, 연결된 수동 컴플레인 댓글만 사용할지
- export의 필요 시점 (v1 범위 밖. 추가할 때는 `AdminExportButtons` + Excel·PDF 동시 규약을 따른다)
- 기간 선택의 기본값과 빠른 기간 버튼 구성 (UI 디자인 단계에서 확정)

### Resolved on 2026-08-04

- ~~Airbnb 1~2점도 `critical`로 분리할지~~ → 분리하지 않는다. `critical` 단계 자체를 폐기하고 두 플랫폼
  모두 경계 포함 단일 `risk`로 통일했다 (Airbnb ≤3, Booking ≤7.0).
- ~~외부 리뷰 수집 단위와 주기~~ → 룸타입/건물 단위 하루 1회(08:05 JST). API가 `roomId` / `propertyId`를 필수로
  요구해 "채널별 1회"는 성립하지 않는다.
- ~~플랫폼별/기간별 집계의 필요 시점~~ → v1에 포함한다. `문제 객실` 뷰가 그 형태다.
