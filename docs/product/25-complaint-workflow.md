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

## Rating Risk Rules (confirmed)

외부 리뷰는 플랫폼 원점수와 판정 결과를 함께 저장·표시한다. 플랫폼별 척도와 세부 평점 항목을 억지로
같은 점수 체계로 환산하지 않는다.

| 플랫폼 | 점수 기준 | 위험도 |
|---|---:|---|
| Airbnb | 3.0 이하 | `risk` (위험) |
| Airbnb | 3.0 초과 | `normal` |
| Booking.com | 7.0 | `risk` (위험 시작) |
| Booking.com | 7.0 미만 | `critical` (매우 위험) |
| Booking.com | 7.0 초과 | `normal` |

- Airbnb 1~2점에 별도 `critical`을 둘지는 아직 결정하지 않았다. 현재는 3점 이하를 모두 `risk`로
  취급한다.
- 위험도는 사용자가 편집하는 필드가 아니라 플랫폼·원점수에서 서버가 일관되게 계산한다.
- 점수가 없거나 범위를 검증할 수 없는 리뷰는 위험도를 계산하지 않고 `unrated`로 보관한다.

### Provider-specific review content and detailed scores

- 전체 평점은 위험도 판정과 기본 정렬에 사용한다. 세부 평점은 출처가 제공한 경우에만 상세에서 보조 정보로
  표시하며, 위험도를 다시 계산하거나 서로 다른 플랫폼의 세부 항목을 비교하는 기준으로 쓰지 않는다.
- 세부 평점은 `rating_breakdown` 원본 구조로 보존한다. 플랫폼마다 항목명·점수 척도·제공 여부가 다르므로
  `청결/위치/...` 같은 StayOps 공통 고정 컬럼을 만들지 않는다.
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

## External Review Fields (planned)

```txt
id, organization_id, provider, external_review_id,
rating_value, rating_scale, risk_level, rating_breakdown,
reviewed_at, imported_at, source_updated_at,
property_id, property_name, room_id, room_label, reservation_id,
guest_display_name, review_text, positive_review_text, negative_review_text, raw_payload,
linked_complaint_id, created_at, updated_at
```

- `provider`: v1은 `airbnb` 또는 `booking`만 허용한다.
- `(organization_id, provider, external_review_id)`는 중복되지 않아야 한다.
- `rating_value`/`rating_scale`은 출처 원점수 보존용이다. 위험도·정렬은 검증된 원점수로 계산한다.
- `rating_breakdown`은 제공된 플랫폼별 세부 점수의 원본 구조다. 값이 없을 수 있으며, 공통 스키마로
  정규화하지 않는다.
- `review_text`, `positive_review_text`, `negative_review_text`는 모두 nullable이다. 특히 Booking.com은
  긍정·부정 본문 없이 점수만 제공할 수 있다.
- `raw_payload`는 장애 조사·매핑 보완을 위한 서버 전용 원문 보관이며, UI에 그대로 노출하지 않는다.
- `linked_complaint_id`는 해당 리뷰로부터 만든 수동 컴플레인 하나를 가리킨다. 하나의 리뷰를 여러 티켓으로
  중복 전환하지 않도록 서버가 제어한다.

---

## Review Translation (confirmed)

외국어 리뷰는 원문을 항상 보존하고, 사용자가 요청한 경우에만 앱 언어(`ko`, `ja`, `en`)로 번역한다.
번역은 외부 리뷰의 보조 정보이며, 원문을 대체하거나 수정하지 않는다.

### User behavior

- 외부 리뷰 상세에서 현재 앱 언어가 원문 언어와 다를 때 `번역 보기`를 제공한다.
- 첫 요청은 서버가 원문 언어를 자동 감지해 해당 앱 언어로 번역한다. 사용자가 원문과 번역문을 전환할 수 있다.
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

`source_text_hash`가 현재 원문과 다르면 이전 번역을 표시하지 않고 다음 상세 요청 때 새 번역을 만든다.
번역은 외부 리뷰와 같은 조직에만 연결하며, 외부 리뷰 삭제/정리 정책이 정해질 때 함께 cascade 정책을
확정한다.

---

## Beds24 Collection and Credit Policy

외부 리뷰는 Beds24 API를 **수집 전용**으로 사용하고, StayOps DB를 운영 화면의 유일한 조회 원본으로 쓴다.

- 채널별(Airbnb, Booking.com) 하루 1회 기본 동기화로 시작한다. 즉, 조직당 기본 최대 2회 수집이다.
- 초기 도입/복구 때만 제한된 과거 기간(기본 최근 90일)을 가져오며, 이후에는 중복 키 UPSERT로 증분 반영한다.
- 웹·모바일 목록, 정렬, 필터, 상세 진입은 Beds24 호출을 절대 만들지 않는다.
- Beds24 응답의 요청 비용·남은 5분 크레딧·리셋 시각을 동기화 로그에 기록한다. 잔여 크레딧이 낮으면
  리뷰 동기화를 다음 주기로 미루며 예약 웹훅 처리보다 우선하지 않는다.
- API 토큰은 서버 환경변수에서만 사용·재사용한다. 브라우저, 문서, 로그에 토큰을 노출하지 않는다.

Beds24 예약 웹훅 우선 원칙은 유지한다. 리뷰는 웹훅이 아닌 정기 수집이 필요하더라도, 예약/객실 연결은
이미 로컬에 수집된 예약과 객실 마스터를 우선 사용한다.

---

## Planned UX / IA (visual design deferred)

### Mobile

- `/mobile/complaints`: 수동 컴플레인과 외부 리뷰를 구분해 탐색할 수 있는 통합 진입점
- `/mobile/complaints/new`: 기존 수동 등록. 플랫폼·제목·내용·건물/객실/예약·고객명·사진 입력
- `/mobile/complaints/[id]`: 수동 컴플레인 상세, 상태·댓글·이미지
- `/mobile/complaints/reviews/[id]` (planned): 외부 리뷰 원문, 원점수, 위험도, 건물/객실/예약 문맥,
  연결된 컴플레인 또는 전환 액션, 제공된 세부 점수, 텍스트가 있을 때만 원문/자동 번역 전환

모바일에서는 현장 입력을 방해하지 않는 수동 등록을 우선한다. 외부 리뷰는 읽기·문맥 확인과 권한 있는
사용자의 전환까지만 제공한다. 생성·상태·댓글·전환·번역 결과는 대시보드와 공통 데이터 원본에 즉시
저장되며, 모바일 전용 복사본을 만들지 않는다.

### Admin dashboard

`/admin/complaints` (planned)는 사무실/CS의 통합 검토 콘솔이다. 공용 어드민 테이블·필터·우측 상세 패널
패턴을 사용하며 별도 디자인 체계를 만들지 않는다.

- 뷰: `수동 컴플레인`과 `외부 리뷰`를 명확히 구분
- 외부 리뷰 기본 정렬: 위험도 우선 → 낮은 원점수 순 → 최신 리뷰순
- 외부 리뷰 필터: 플랫폼, 위험도, 건물, 객실, 리뷰 날짜 범위
- 수동 컴플레인 필터: 플랫폼, 상태, 건물, 객실, 등록 날짜 범위, 작성자
- 행/상세 공통 정보: 플랫폼, 원점수와 위험도(리뷰), 건물, 객실, 예약 문맥, 날짜, 연결 여부. 상세에서는
  출처가 제공한 세부 점수와 Booking.com 긍정/부정 본문을 조건부로 표시
- 상세에서 권한 있는 사용자는 외부 리뷰를 수동 컴플레인으로 전환하거나 연결된 컴플레인으로 이동한다.
- 표시할 수 없는 객실은 비어 있는 값처럼 숨기지 않고 `객실 정보 없음` 상태를 명확히 보여준다.

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

- Airbnb 1~2점도 `critical`로 분리할지
- 외부 리뷰 동기화 실패 알림의 수신 역할과 재시도 UI
- 외부 리뷰에 대한 내부 메모를 리뷰 자체에 둘지, 연결된 수동 컴플레인 댓글만 사용할지
- 플랫폼별/기간별 집계와 export의 필요 시점
