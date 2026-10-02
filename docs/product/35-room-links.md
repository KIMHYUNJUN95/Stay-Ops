# 35. 룸 링크 — 객실별 리스팅 링크

> 상태: **구현(2026-10-02)** · 관리자 웹 `/admin/ops/room-links` · 모바일은 아직(대시보드 먼저)
> 원본: STAY ARI Manager `src/components/RoomLinksDashboard.jsx` + `src/constants/roomLinks.js`(Firestore `roomLinks/{companyId}`)
> 관련: [31 이식 현황](31-stay-ari-migration-overview.md) · [32 운영 관리자 영역](32-ops-admin-area.md) · 시안: Claude Design `a3c6ed81-b1de-4f3a-aab4-da60487a139c`(1b · 1b v2)

## 무엇을 위한 화면인가

리스팅이 많고 숙소마다 달라서, 「이 방 리스팅이 어디지?」를 빨리 찾아 **호스트 화면(리스팅 편집)** 을 열거나 **손님용
링크** 를 복사하는 화면이다(사용자 설명, 2026-10-02). 저쪽 Room Links 의 기능(건물 · 객실 · Airbnb / Booking.com · 호스트
/ 게스트 링크 · 편집)을 옮기되, 저쪽의 구조 문제를 고쳤다.

| 저쪽 | 우리 |
| --- | --- |
| Firestore 문서 하나에 `{건물: {객실 이름: {host, guest}}}` 를 **통째로 덮어쓰기** — 두 사람이 동시에 고치면 나중 저장이 앞의 것을 지움 | 유닛 × 채널 **한 줄씩**(`room_listing_links`) — 한 칸을 고치면 그 줄만 바뀐다 |
| 객실을 **이름**(`A201` · `K202호` · `2층` · `SKY/101`)으로 찾음 | 우리 객실 유닛(`rooms.id`)에 붙는다 — 이름 매칭 없음 |
| 권한 검사 없음 · 문구 영어 하드코딩 | `room_links.access` 개인 부여 · 서버 재검증 · ko/ja/en |
| 같은 리스팅 ID 가 두 방에 붙어도 모름(실제 복사 실수 있었음) | 「리스팅 ID 중복」 표시 |

## 진입 · 권한

- 사이드바 맨 아래 **「운영 관리자」** 묶음의 「룸 링크」(`ops-room-links`, 아이콘 `Link2`). 데스크톱 판매 캘린더와 같은 묶음.
- 권한 키 **`room_links.access`** — 판매 캘린더(`ops_admin.access`)와 **따로 준다**(사용자 결정: 「이것도 사용자에서
  권한별로 똑같이 줄지 말지 정할 수 있어야 한다」). 리스팅 확인은 가격을 만지지 않는 사람도 하기 때문이다.
  - 정책은 `ops_admin.access` 와 같다: 대표 · 전무는 역할로 받고, 나머지는 **사용자 상세 → 권한** 에서 개인 부여.
    기한 없음 · 차단 없음 · 개발자 통과.
  - 페이지(`requireAdminPageSession` + `canAccessRoomLinks`, 없으면 `/admin` 으로) · 서버 액션 · RLS 가 같은 키로 막는다.
    메뉴 숨김은 편의다.
- 같은 김에 사용자 상세의 권한 이름표에 `ops_admin.access`(운영 관리자 — 판매 캘린더)도 넣었다 — 전에는 키 이름이 그대로 보였다.

## 화면 (시안 1b)

건물 목록 → 객실 카드 → 오른쪽 상세 패널. `src/components/admin/ops/room-links-console.tsx` · `room-links.css`.

- **위**: 제목 · 집계(객실 · 리스팅 · 게스트 링크 없음 · 리스팅 ID 중복) · 검색(객실 · 유닛 · 리스팅 ID · 게스트 링크).
- **왼쪽 건물**: 캘린더 탭 순서(`CALENDAR_BUILDING_ORDER`), 건물별 리스팅 수.
- **가운데 객실 카드**: 판매 캘린더와 **같은 행 키**(`opsUnitRoomKey`)로 유닛을 묶는다 — 아라키초A `201` 카드 안에 유닛
  `201` · `201_2`. 유닛 칩: 초록 = 지금 판매 중(모든 방), 주황 = 게스트 링크 없음.
- **오른쪽 패널**: 건물 이름 · 객실 · 유닛 목록 · **건물 주소**(건물 정보 `property-map-links` / 저장된 운영 정보, 사용자 언어)
  + 지도. 주소가 없으면 「건물 주소 미입력」(STAY ARI · 사노 — 사용자가 STAY ARI 주소를 주기로 함).
  유닛마다 카드 하나: 「지금 판매 중 / 쉬는 계정」, 그 아래 채널 두 줄.
  - **Airbnb**: 리스팅 ID · 「리스팅 ID 중복」 · 호스트(리스팅 편집 화면) 열기 · 게스트 링크 복사 · 열기 · 메모 · 편집(연필).
  - **Booking.com**: 엑스트라넷 · 게스트 링크. 비어 있으면 한 줄(「아직 링크가 없어요 + 엑스트라넷 · 게스트 링크 추가」).
- **지금 판매 중 / 쉬는 계정**(모든 방 — 유닛 하나인 방도, 2026-10-02 사용자 지시): 판매 캘린더의 활성 · 비활성과 같은 값 — Beds24 **날짜별 최소숙박**
  (`room_daily_rates.min_stay` 1~49 = 활성, `isActiveUnitMinStay`). 단 **오늘 하루로 정하지 않고 오늘부터 30일 중 활성 밤이
  가장 많은 계정**을 판매 중으로 본다(`pickSellingUnits`, 같으면 둘 다 · 운영 종료 유닛은 제외).
  - 이유: 계정이 바뀌는 무렵엔 두 계정이 며칠 겹쳐 열린다 — 2026-10-01~04 아라키초A `201`(여름) · `201_2`(겨울) 둘 다 활성이라
    오늘 하루로 보면 둘 다 「판매 중」이었다(사용자 지적, 2026-10-02).
  - 유닛이 하나인 방은 30일 중 하루라도 활성이면 판매 중.
  - 날짜(「~10/4까지」 등)는 보여 주지 않는다 — 판매 중인지 아닌지만(사용자 결정, 2026-10-02).
  - 요금 칸이 하나도 없는 유닛만 `rooms.external_minimum_stay` 로 대신한다(한 시점 스냅샷이라 전환일을 못 따라감).
- **편집**: 채널 줄의 연필 → 호스트 · 게스트 · 메모(선택, 200자). Airbnb 호스트 칸에 **리스팅 ID 숫자만** 넣어도 편집 화면
  주소를 만든다. 셋 다 비우고 저장하면 그 줄을 지운다(「비우기」). 저장 뒤 알림 · 목록 갱신.
- 빈 상태: 객실 없음 · 검색 결과 없음.

## 데이터

`public.room_listing_links` (마이그레이션 `202610020001`) — [04 데이터 모델](../engineering/04-data-model.md).

| 열 | 뜻 |
| --- | --- |
| `room_id` · `channel` | 유닛 하나 × `airbnb` / `booking` — 둘이 유일(`room_listing_links_room_channel_key`) |
| `listing_id` | Airbnb 리스팅 ID. 링크에서 읽는다(`/hosting/listings/editor/<id>` · `/rooms/<id>` · `/manage-your-space/<id>`) |
| `host_url` · `guest_url` | 호스트 화면 · 손님용 링크 |
| `memo` | 200자 |
| `updated_by` · `updated_at` | 마지막으로 고친 사람 · 시각 |

규칙(순수, 테스트 `room-links-model.test.ts`): `src/lib/room-links-model.ts` — 묶기(`groupRoomLinks`: 운영 종료 유닛은 링크가
있을 때만), 중복 ID(`findDuplicateListingIds`), 입력 검증(`parseRoomLinkInput`: http(s) 만, 채널 도메인 — Airbnb `airbnb.*` ·
`abnb.me`, Booking `booking.com`).

## 데이터 이관 (2026-10-02, 마이그레이션 `202610020002`)

저쪽 **실제 저장값**(Firestore `roomLinks`, 2026-09-24 수정본 — 상수 파일보다 새것)을 읽기 전용으로 받아 옮겼다.

- **객실은 리스팅 ID 로 맞췄다.** 외부 리뷰 원본(`external_reviews.raw_payload->>'listing_id'`)이 Beds24 유닛 ↔ Airbnb 리스팅을
  이미 묶고 있어, 저쪽 호스트 링크 속 ID 와 대조했다. 결과: **90 유닛 전부 확정, 게스트 링크 89**(`OkuboCC` 는 저쪽에도 없음).
- 저쪽 「SKY」 26 = **STAY ARI Apartment Hotel** O101~O310. 「다이쿄초」(7)는 그중 5개의 옛 이름(같은 ID · 다른 게스트 링크
  `…gyoen`)과 우리에 없는 B01 · B02 라 **옮기지 않았다**.
- 가부키초 K(4~9월) = 우리 `202#` 계열, KK(10~3월) = 우리 `K202` 계열. 상수 파일의 K202 ID 오류는 Firestore 쪽에선 고쳐져 있었다.
- Booking.com: 저쪽에도 0건.
- 이미 있는 줄은 건드리지 않는다(`on conflict do nothing`).

## 남은 것

- [ ] STAY ARI 주소(사용자 제공 예정) → `property-map-links.ts` 에 STAY ARI 항목 추가.
- [ ] 모바일 화면(시안부터).
- [ ] (선택) 판매 캘린더 객실 이름 옆에서 바로 열기(시안 1d).
