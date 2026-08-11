# Decision Log

This file records important project decisions.

## 2026-08-11 컴플레인 → 게스트 피드백 개명 (표시명 한정)

이 모듈은 수동 컴플레인 외에 Airbnb·Booking.com 외부 리뷰 전체(좋은 평 포함)와 문제 객실 집계를
함께 다룬다. 「컴플레인」은 세 뷰 중 하나만 가리켜 기능 이름으로는 좁았다.

- 기능 표시명은 `게스트 피드백` / `ゲストフィードバック` / `Guest Feedback`로 통일한다.
- 모바일 내비게이션 라벨만 축약형(`피드백` / `ゲストの声` / `Feedback`)을 쓴다. 하단 탭 라벨은
  10.5px · 폭 ~72px이라 풀네임이 줄바꿈돼 탭바 높이를 밀어낸다. 일본어는 기존 최장 탭 라벨
  (`スタッフ一覧`, 6자) 이내로 맞춘다.
- **라우트·내비 id·DB 테이블·i18n 네임스페이스는 바꾸지 않는다.** 북마크와 저장된
  `profiles.bottom_nav_tabs` 값이 깨지지 않아야 한다.
- 컴플레인 **엔티티**를 가리키는 문구(`수동 컴플레인`, `컴플레인 등록/삭제/전환`)는 그대로 둔다.
  개명 대상은 기능 이름 하나다.

## 2026-08-07 Mobile recurring-task detail delete parity

- A mobile task detail opened from a concrete recurring occurrence must offer the same two choices as the admin console occurrence row: skip only that date or delete the whole series.
- The occurrence query is navigation context only. The server validates it against the stored recurrence rule and anchor before enabling per-occurrence behavior.
- Detail pages opened without a valid occurrence keep the whole-task delete confirmation, because there is no single date to skip.

## 2026-08-06 Admin/Mobile multilingual hardcoding closure

- All ordinary visible copy and accessibility names under `/admin/*` and `/mobile/*` use the shared `ko`/`ja`/`en` dictionaries or locale-aware `Intl` formatting. Direct English/Korean/Japanese literals are not an accepted shortcut.
- System-authored lost-and-found restore history is persisted as a locale-neutral marker and translated for the current viewer. This avoids permanently storing the administrator's UI language in shared operational data.
- The prescribed Japanese `休暇届` remains a fixed Japanese business document regardless of the signed-in UI locale. It is documented as an intentional domain-template exception to the UI hardcoding check.

## 2026-08-03 Todo 업무일지 — 단일 Slack 채널 수동 전송

### 결정

- 모바일 `/mobile/tasks`와 대시보드 `/admin/tasks`의 기존 업무일지 생성·편집 양식은 바꾸지 않는다.
  보고서 모달의 `Slack으로 보내기`는 사용자가 최종 수정한 textarea 본문을 그대로 전송한다.
- 전송 대상은 조직별 선택 UI가 없는 **단일 회사 업무일지 채널**이다. `SLACK_DAILY_REPORT_WEBHOOK_URL`
  서버 환경변수의 Incoming Webhook만 사용하며, URL은 브라우저·소스·문서·감사 로그에 저장하거나 노출하지 않는다.
- 전송자 Slack 계정 매칭은 만들지 않는다. 기존 보고서 본문의 담당자 줄이 실제 작성자를 나타내며, Slack
  메시지는 StayOps 웹훅/앱 명의로 전송된다.
- 권한은 기존 업무일지 생성 권한과 동일하다. 버튼 노출과 별개로 서버가 생성 권한·Tokyo 날짜·비어 있지 않은
  보고서를 다시 확인한다. Slack이 수락한 성공 전송만 `audit_logs.task_daily_report_slack_sent`에
  작성자·날짜·문자 수를 남기며 본문은 남기지 않는다.
- 웹훅 미설정, Slack 전송 실패, 40,000자 초과는 성공으로 표시하지 않고 각 화면의 현지화된 오류로 돌려준다.

### 범위 밖

- Slack 사용자 계정 연결, 멘션·DM·채널 선택, Slack 수신/버튼 액션, 자동 예약 발송, 메시지 수정·삭제

## 2026-07-31 설정 3화면 리디자인 — 마스터·디테일 (Claude Design 초안 1b 채택)

### 문제

설정 · 조직 설정 · 출퇴근 QR **3화면만 구형 Tailwind `Card`/`Button` 조합으로 남아 있었다.**
청소·분실물·주문·근태·린넨 콘솔은 이미 `.adm` 디자인 시스템(`admin-console.css`)으로 이식됐는데
설정만 안 돼서, 여백·타이포·카드 그림자·표 밀도가 전부 따로 놀았다. 취향 문제가 아니라 이식 누락이다.

### 결정

- Claude Design 으로 초안 3개(콘솔 표준 이식 / 마스터·디테일 / QR 인쇄물 중심)를 뽑아
  **1b 마스터·디테일**을 채택했다(사용자 결정).
- **새 시각 언어를 만들지 않는다.** 기존 `.adm` 토큰과 프리미티브(`.card`/`.qtbl`/`.fld`/`.kv`/
  `.pill`/`.btn`/`.chipbtn`/`.lvsubtab`)를 그대로 쓴다. 페이지 전용 CSS는 마스터·디테일 그리드와
  결과 배너 정도만 `settings-console.css` 에 둔다.
- **출퇴근 QR**: 좌측 표에 전 현장의 QR 상태(준비됨/조치 필요/미발급)를 한눈에, 우측에 선택한 현장의
  현장 정보·QR·발급 이력·기억된 기기. 린넨·청소 콘솔의 목록+상세 패턴과 같은 구조다.
  "오쿠보C에 QR이 있나?" 를 클릭 없이 알 수 있어야 한다는 것이 이 구조를 고른 이유다.
- **조직 설정**: 같은 마스터·디테일 구조(좌 조직 목록 / 우 편집·삭제 + 신규 생성)로 통일했다.
  설정 섹션 안에서 조작 방식이 화면마다 바뀌지 않게 한다.
- **설정 인덱스**: 카드가 단순 링크가 아니라 현재 상태(현장 수 / QR 준비됨 / 조치 필요)를 함께
  보여준다.
- 설정 섹션에 탭 바(`SettingsSubnav`)를 추가했다. 시각 표현은 공용 `.lvsubtabs`/`.lvsubtab`
  프리미티브를 그대로 쓰고, 근태 콘솔의 `AttendanceSubnav` 와 같은 역할이다.

### 함께 고친 것

- **조직 설정 카드가 모두에게 보이는데 페이지는 플랫폼 개발자만 들어갈 수 있었다** — 누르면
  forbidden 으로 튕겼다. 카드 노출을 페이지 권한과 맞췄다.
- 초대코드는 2026-07-13 에 `/admin/users/invites` 로 옮겨져 설정 탭에 없다(문서상 확인).

### 검증

`npm run lint` 0 errors, `npm run build` 통과, `npx tsc --noEmit` 통과, `npm test` 97/98
(실패 1건은 기존 `no-hardcoded-i18n`, 신규 파일 관련 0건 — 오히려 45→43건으로 줄었다).
신규 문구는 ko/ja/en 동시 추가. 디자인 초안:
`https://claude.ai/design/p/ef1582a1-8794-4f9b-bdbf-c0e020cb22f4`


## 2026-07-31 근태 기기 기억 (Trusted Device) — 재로그인 없이 打刻

### 배경

같은 날 도입한 QR 카메라 딥링크에서 아이폰은 Safari 로만 열린다. iOS 는 홈 화면 PWA 와 Safari 의
저장소가 분리돼 로그인 세션을 공유하지 않아, QR 로 들어올 때마다 재로그인을 요구받는다.
로그인 수단(구글/이메일)을 바꿔도 이 구조는 해소되지 않는다.

### 결정 — 권한 모델 변경 (사용자 승인)

- **한 번 로그인해 실제로 打刻에 성공한 기기**를 기억하고, 그 다음부터는 인증 세션 없이도
  **출근/퇴근 打刻만** 가능하게 한다. 신규 테이블 `attendance_trusted_devices`.
- **권한 경계 — 이 자격증명은 出退勤 打刻 두 가지만 허용한다.** 근무 이력·급여·정정·프로필·다른
  모듈·어드민은 전부 불가이며 여전히 정상 세션을 요구한다. `middleware.ts` 의 보호 경로는 넓히지
  않았고, 신원 대체는 `submitAttendanceScan` 과 QR 진입 화면에서만 일어난다.
- GPS 필수 + 사이트 반경 검증은 그대로다 → 쿠키만으로 현장 밖에서 打刻할 수 없다. 즉 대리 출근
  위험은 기존과 동일하다.
- 조직 멤버십이 `active` 가 아니면 즉시 무효 — 퇴사·정지 처리하면 기기도 함께 죽는다.
- 진입 화면에 **"○○○님으로 기록됩니다"** 를 명시해 다른 사람으로 잘못 찍히는 것을 막는다.

### 선택한 값

- **유효기간 180일 슬라이딩**(사용자 결정). 쓸 때마다 다시 180일. 반년 미사용 시 자동 소멸.
- **관리자 해지 UI 를 이번에 함께 구현**(사용자 결정). 어드민 → 설정 → 근태의 「기억된 기기」 목록.
  분실·퇴사 시 즉시 끊을 수 있어야 장기 자격증명을 두는 것이 정당화된다. 해지는 `audit_logs`
  (`attendance_trusted_device_revoke`)에 남는다.
- 쿠키는 HttpOnly · Secure · SameSite=Lax · **`Path=/mobile/attendance`** — 근태 경로 요청에만 실린다.
- **원문 토큰은 DB 에 저장하지 않는다.** sha256 해시만 보관해 DB 유출 시 재사용을 막는다.
- 발급은 화면 진입이 아니라 **打刻 성공 직후**다. "실제로 현장에서 쓴 기기"라는 근거가 있는 시점.
- 로그아웃 시 쿠키 삭제 + DB 폐기. 같은 기기에서 다른 사람이 打刻하면 이전 자격증명을 폐기하고 재발급.

### 채택하지 않은 대안

- **세션 수명만 연장** — 언젠가 만료되면 같은 문제가 재발한다. 전체 권한을 가진 세션을 장기간
  살려두는 것이 근태 전용 자격증명보다 노출이 크다.
- **패스키(WebAuthn)** — 재로그인 비용을 Face ID 1회로 낮출 뿐 여전히 로그인이다. Supabase 기본
  제공이 아니라 구현 부담도 크다.
- **네이티브 래퍼 + Universal Links** — 아이폰에서 앱을 직접 여는 유일한 방법이지만 PWA-first
  방향을 뒤집는 결정이라 이번 범위에서 제외.

### 부수 효과

iOS 전용 대책이 아니다. 안드로이드·PWA 사용자도 세션이 만료되면 같은 혜택을 받는다.

### 검증

마이그레이션을 연결된 Supabase 프로젝트에 적용 완료. `npm run lint` 통과(0 errors),
`npm run build` 통과, `npm test` 기존 실패 1건 외 전부 통과.
상세: `docs/product/24-attendance-workflow.md` → "Trusted Device",
`docs/engineering/05-rls-permissions.md`.

## 2026-07-31 근태 QR — 휴대폰 기본 카메라 딥링크 도입

### 결정

- 근태 QR 의 인코딩을 **토큰 문자열 → 절대 URL** 로 바꾼다.
  `https://<앱주소>/mobile/attendance/capture?token=att_…`
  기존에는 토큰만 담아서, 기본 카메라로 찍으면 열 수 있는 게 없어 아무 반응이 없었다.
- **토큰 값 자체는 바꾸지 않는다.** 앱 내 스캐너가 URL 과 토큰-only 두 형식을 모두 받으므로
  이미 현장에 붙어 있는 인쇄물은 앱에서 계속 동작한다. 카메라 기능을 쓰려면 QR 재출력·교체가 필요하다.
- QR 의 기준 주소는 **`NEXT_PUBLIC_APP_URL`** 이다(요청 호스트 아님). QR 은 인쇄물이라, 관리자가
  LAN IP 로 접속한 상태에서 뽑으면 현장에서 안 열리는 QR 이 찍힌다. 주소 미설정이면 예전처럼
  토큰만 담는다 — 깨진 링크를 인쇄하는 것보다 낫다.
- 건물 QR 에는 방향 정보가 없으므로, 링크로 들어오면 **진입 화면에서 출근/퇴근을 고르게 한다**
  (사용자 결정). 서버 자동 판단(열린 세션 유무)이나 건물당 QR 2장은 채택하지 않았다 — 전자는 의도치
  않은 퇴근 위험, 후자는 인쇄물·관리 대상이 2배가 된다.
- 로그아웃 상태로 QR 을 찍으면 **토큰을 `next` 에 실어** 로그인 후 같은 화면으로 복귀시킨다.

### 확인된 기기 제약 (기능 한계로 명시)

- **Android**: 카메라 → 링크 배너 → URL 이 PWA scope(`/`) 안이라 **설치된 앱 창으로 열린다.** 의도대로 동작.
- **iOS**: 카메라 → **Safari 로만** 열린다. 홈 화면 PWA 로 넘기는 표준 방법이 iOS 에 없다
  (Universal Links 는 네이티브 앱이 있어야 한다). iOS 16.4+ 는 standalone PWA 와 Safari 의 저장소가
  분리돼 재로그인이 필요할 수 있다. 직원 기기가 iOS/Android 혼재라 **앱 내 스캔 동선은 그대로 유지**한다.

### 보안 — 변경 없음

토큰이 URL 에 노출돼도 판정은 `submitAttendanceScan` 이 전부 다시 한다: 동일 조직의 활성 토큰 +
활성 사이트 + GPS 필수 + 사이트 반경 이내. 링크만 받아서는 현장 밖에서 인증되지 않으므로 대리 출근
위험은 이전과 동일하다. 진입 화면의 사이트 이름 조회는 표시용이며 인증이 아니다.

### 검증

`extractAttendanceToken` 하위호환 테스트 4종(구형 토큰-only / 신형 URL / 다른 호스트·추가 파라미터 /
무효 입력) 통과. `npm run lint` 통과(0 errors), `npm run build` 통과.
상세: `docs/product/24-attendance-workflow.md` → "QR Deep Link".

## 2026-08-04 컴플레인 — Beds24 리뷰 API 실측으로 수집·위험도·스키마 확정

2026-07-30 재기획의 미검증 가정을 Beds24 OpenAPI 스펙(`https://beds24.com/api/v2/apiV2.yaml`)으로
실측해 수정했다. 두 엔드포인트는 실존하나 계약이 기획 가정과 달랐다.

### 실측 결과

- `GET /channels/airbnb/reviews` (**Beta**) — `roomId` 필수, **날짜 필터 없음**, 100건/페이지
- `GET /channels/booking/reviews` (**Alpha**) — `propertyId` + `from` 필수, 100건/페이지
- 호출 키는 이미 로컬에 있다: `rooms.external_room_id`, `properties.external_property_id`,
  `reservations.source_reservation_id`. 새 매핑 테이블이 필요 없다.

### 결정

- **수집 단위·주기: 룸타입/건물 단위 하루 2회.** "채널별 하루 1회 = 조직당 최대 2회"는 API가 단위
  파라미터를 필수로 요구해 성립하지 않아 폐기했다. 1주기 호출 수는 `(Airbnb 룸타입 수) + (Booking 건물 수)`
  + 페이지네이션이다.
- **초기 90일 제한은 Booking.com만 서버 측(`from`)에서 가능**하고, Airbnb는 전량을 받아 StayOps에서
  잘라낸다.
- **위험도는 `unrated` / `normal` / `risk` 3값.** Airbnb ≤3, Booking.com ≤7.0이 `risk`이며 **경계값 포함**.
  이전 초안의 Booking `critical`(<7.0)과 Airbnb 1~2점 분리안은 폐기했다. Airbnb `overall_rating`이 정수라
  실질 위험 구간은 1~3점이다.
- **리뷰는 점수와 무관하게 전량 저장한다.** 위험도는 분류이지 수집 필터가 아니다. 문제 리뷰만 저장하면
  건물·객실 평균 평점이 성립하지 않고, Airbnb는 애초에 점수·날짜 필터가 없다.
- **`문제 객실` 뷰를 v1에 포함한다.** 건물 → 객실 2단 집계에 플랫폼별 `평균 / 리뷰 수 / 문제 건수 /
  문제 비율`을 함께 두고, 문제 건수에서 해당 객실의 문제 리뷰 목록으로 드릴다운한다. 평균만으로는
  리뷰가 많은 객실의 저평점이 묻히기 때문이다.
- **스키마 5개 컬럼 추가**: `headline`(Booking 리뷰 제목), `source_language_code`(Booking 원문 언어 →
  DeepL 자동 감지 생략으로 사용량 절감), `private_feedback`(Airbnb 비공개 피드백),
  `ota_reply_text` / `ota_replied_at`(Booking 기존 답글, 읽기 전용). `review_translations.source_part`에
  `headline` / `private`를 추가한다.
- **비공개 피드백은 수집·표시하되 점수 계산에서 제외한다.** OTA 비공개 내용이므로 목록·집계 쿼리에서
  선택하지 않고 상세에서만 `비공개` 배지와 함께 공개 리뷰와 분리해 보여준다.
- **Airbnb 리뷰는 양방향이므로 게스트 작성분만 저장한다.** `reviewer_role` 기준으로 거르고,
  `submitted=false` / `hidden=true`는 저장하지 않는다.
- **필드 가용성이 플랫폼마다 비대칭임을 계약으로 명시한다.** Airbnb는 예약 ID·게스트 이름이 없고 객실이
  확정적이며, Booking.com은 객실이 없고 예약 ID·게스트 이름이 있다. 없는 값을 추정으로 채우지 않는다.
- **오쿠보 독채 판정은 `properties.property_type = 'standalone'`** 으로 한다. 건물 이름 문자열로 분기하지
  않는다.
- 두 엔드포인트가 Beta/Alpha이므로 `raw_payload`를 항상 보존하고, 파싱 실패는 리뷰 1건만 건너뛴다.

### 문서

`docs/product/25-complaint-workflow.md`, `docs/product/05-admin-web-ia.md`,
`docs/engineering/04-data-model.md`, `docs/engineering/05-rls-permissions.md` 동시 갱신.

## 2026-07-30 컴플레인 재기획 — 수동 컴플레인과 Beds24 외부 리뷰를 분리·연결

### 결정

- 기존 `customer_complaints`는 직원이 직접 등록·처리하는 수동 컴플레인으로 유지한다.
- Beds24에서 수집하는 Airbnb·Booking.com 리뷰는 별도 `external_reviews` 로컬 도메인으로 둔다. 외부
  리뷰를 낮은 평점이라는 이유만으로 자동 컴플레인으로 만들지 않는다.
- 실제 조치가 필요한 리뷰만 작성 권한자가 수동 컴플레인으로 전환·연결한다. 이때 원 리뷰 ID·점수·본문·문맥
  스냅샷을 남기고 동일 리뷰의 중복 전환은 서버에서 막는다.
- 위험 판정: **Airbnb 3점 이하 = 위험**, **Booking 7.0점 = 위험, 7.0점 미만 = 매우 위험**. Airbnb의
  별도 매우 위험 구간은 이번에 정하지 않는다.
- 외부 리뷰는 Beds24 API를 UI에서 직접 호출하지 않는다. 조직별·채널별 하루 1회 기본 수집, 초기/복구 시
  최근 90일 제한 수집, 로컬 UPSERT·캐시 조회를 원칙으로 한다. 요청 비용/남은 크레딧을 기록하고 예약
  웹훅 처리보다 리뷰 수집을 우선하지 않는다.
- 외국어 외부 리뷰는 **DeepL API Free**로 필요할 때만 현재 앱 언어(ko/ja/en)로 번역하고, 동일
  리뷰·본문 종류·목표 언어의 결과를 캐시한다. 목록/필터에서는 번역하지 않는다. 월 500,000자 무료 한도에 대해
  450,000자 안전 한도를 두며, 도달 시 새 번역을 다음 월까지 중단하고 원문·기존 번역은 계속 제공한다.
- 플랫폼별 세부 점수는 `rating_breakdown` 원본 구조로 보관하고 제공된 경우에만 상세에 표시한다.
  Booking.com의 긍정/부정 본문은 분리 보관하며, 본문 없이 점수만 존재하는 리뷰도 정상 데이터로 수집·표시한다.
  (**2026-08-06 갱신** — 보관 구조는 그대로지만 **표시 라벨은 현지화**한다. 아래 항목 참고.)
- 객실은 Beds24의 예약/객실 식별자와 로컬 데이터가 신뢰성 있게 매칭될 때만 표시한다. 추정 매핑은 금지한다.
- 모바일과 대시보드는 같은 조직의 수동 컴플레인·외부 리뷰·번역 캐시를 공유한다. 화면별 복사 테이블이나
  별도 Beds24/DeepL 호출을 만들지 않으며, 어느 화면의 처리 결과도 다른 화면에서 같은 ID와 연결 상태로
  확인한다.
- 선택 기간의 평점은 로컬 외부 리뷰를 건물·객실로 집계한다. Airbnb와 Booking.com은 원점수 척도가 달라
  플랫폼별 평균 원점수·리뷰 수를 따로 표시하고, 단일 종합 평점으로 합치지 않는다. 오쿠보는 전부 독채라
  건물 평점 하나만 제공하고 객실별 평점은 제공하지 않는다. 기간 UI/기본값은 실제 설계 단계에서 결정한다.
- 현 작업은 기획·문서만이다. 시각 디자인, API/DB/RLS 구현, 새 어드민 화면은 후속 작업에서 함께 진행한다.

### 범위 밖

- OTA 답글 전송, 자동 티켓/알림, AI 분석, 통계·export, 담당자 배정

상세 계약은 Product `25`, Beds24 연동은 Engineering `01`, 계획 스키마/RLS는 Engineering `04`/`05`에
동일하게 반영한다.

## 2026-07-30 린넨 반품 콘솔 — Excel · PDF 내보내기 추가 (범위 밖 결정 번복)

### 결정

- `/admin/linen-return` 에 **Excel + PDF 내보내기를 추가한다.** 같은 날 두 번(오전 기획, 오후 디자인
  확정) "대시보드 v1에서 Excel/PDF export 는 범위 밖"으로 적었던 결정을 번복한다. 사무실이 세탁업체
  청구서를 대조하려면 기간별 반품 내역을 파일로 넘길 수 있어야 한다는 요구가 확인됐다.
- **새 양식을 만들지 않는다.** 근태·청소·주문 콘솔이 쓰는 공용 계약(CLAUDE.md §4b)을 그대로 따른다:
  버튼은 `<AdminExportButtons>`(`chipbtn` + lucide `Download` 한 쌍), 서버는 같은 입력으로
  `buildAdminTableWorkbookBase64` / `buildAdminTableReportHtml`, 푸터·로케일은
  `buildAdminExportMeta(session)`. 초록 원장 색과 레이아웃도 그대로다.
- **Excel 과 PDF 는 항상 같이 낸다.** CSV·클라이언트 `Blob` 다운로드·`/api/admin/export/*` 라우트는
  만들지 않는다.
- **한 파일에 시트 2개** — 「린넨 반품 기록」 + 「품목별 수량」. 콘솔의 두 탭과 1:1로 맞춰서, 사무실이
  기록 목록과 품목 합계를 한 파일에서 대조할 수 있게 한다. (공용 빌더가 원래 `sheets[]` 를 받도록
  설계돼 있어 새 기능 추가 없이 가능했다. 인쇄본은 두 번째 섹션에 page break 가 들어간다.)
- 제목 앞 라벨에 **기간 + 적용 필터(건물 · 품목 · 등록자)** 를 함께 찍는다. 파일만 받아도 어떤 조건의
  자료인지 알 수 있어야 한다.
- 내보내는 값은 **화면에 그린 그대로**를 클라이언트가 서버 액션에 넘긴다(청소·주문·근태와 동일 패턴).
  단, 품목 필터는 드롭다운이 실제로 보이는 「기록」 뷰에서만 적용한다 — 「품목별 수량」 뷰에서 내보낼 때
  기록 시트만 몰래 좁혀지면 두 시트의 조건이 어긋나기 때문이다.
- 내보내기 로케일은 서버가 `session.user.preferredLanguage` 에서 정한다. 클라이언트는 로케일을 넘기지
  않는다(공용 규칙).

### 공용 빌더 버그 수정 — `wrap` 열 잘림 (같은 날)

내보낸 xlsx 에서 메모 열의 두 번째 줄부터가 잘려 보이는 문제를 확인했다. 원인은 린넨이 아니라
**공용 빌더**(`admin-table-workbook.ts`)가 모든 데이터 행 높이를 18pt 로 고정하고 있던 것이다 —
명시적 행 높이가 있으면 Excel/LibreOffice 는 줄바꿈 자동 맞춤을 하지 않는다. 청소 비고, 주문 등
`wrap: true` 를 쓰는 모든 화면이 같은 증상이었다.

- 고정 18pt 대신 **열 너비 대비 표시 폭으로 줄 수를 추정해 필요한 만큼만 행을 키운다**(전각 2칸으로
  계산, 최대 12줄, 줄바꿈 없는 행은 18pt 유지). 색·서식·레이아웃은 그대로다.
- 회귀 가드로 `src/lib/__tests__/admin-table-workbook.test.ts` 를 추가했다. 이 빌더는 4개 이상의
  콘솔이 공유하므로 한 번 깨지면 전부 깨지는데, 파일을 열어보기 전에는 드러나지 않는 종류의 버그다.

### 검증

공용 빌더에 린넨 2시트 입력을 넣는 스모크 테스트로 xlsx(zip `PK` 시그니처)와 인쇄 HTML(두 섹션 +
page break) 생성을 확인했고, 행 높이 테스트 3개 통과(단일 줄 18pt / 3줄 45pt / 비-wrap 열 무시).
`npm run lint` 통과(0 errors), `npm run build` 통과.

## 2026-07-30 어드민 린넨 반품 콘솔 — 디자인 확정 + 구현 완료

### 결정

- `/admin/linen-return` 을 같은 날 확정된 Claude Design 핸드오프(`린넨 반품 콘솔 (admin).html`)
  그대로 구현했다. 사이드바 운영 그룹에 `린넨 반품` 항목을 추가했다.
- 뷰는 **「기록」 / 「품목별 수량」 2개 탭**이다. 「기록」은 반품 한 건이 한 행이고, 행 안에 전체
  품목·수량을 항상 노출한다. 「품목별 수량」은 같은 조건의 품목별 대조표이며, 행을 누르면 그
  품목으로 「기록」 뷰를 좁힌다.
- **같은 날 오전의 "대시보드 v1에서 품목별 집계는 범위 밖" 결정을 이 항목으로 번복한다.**
  확정된 디자인이 품목별 수량 뷰를 포함하고, 사무실의 실제 대조 업무(세탁업체 청구 대조)가
  품목별 합계를 요구하기 때문이다. 월별 집계 대시보드와 Excel/PDF export 는 계속 범위 밖이다.
- 조회 기간은 URL(`?from=&to=`)로 관리하고 **서버에서 조직 스코프 쿼리로 좁힌다.** 건물·품목·
  등록자 필터만 이미 내려온 같은 조직 데이터 안에서 클라이언트가 좁힌다.
- 수정 가능 범위는 건물·품목/수량·메모·사진이다. `registered_at` / `registered_by_user_id` 는
  증빙값이라 UI에서 잠그고 서버 update payload 에도 넣지 않는다.
- 삭제는 MVP hard delete 이며 확인 모달을 유지한다(되돌릴 수 없으므로 undo 토스트 대상이 아니다).
- **감사 기록은 기존 `audit_logs` 테이블에 남긴다.** action 은 `linen_return_console_update` /
  `linen_return_console_delete`, target_type 은 `linen_return_record`. metadata 에 변경 전/후
  스냅샷(건물·품목/수량·메모·사진 수)과 원 등록 증빙값을 담는다. 새 마이그레이션은 필요 없었다.
- 계획 문서가 요구한 "reason(사유)" 는 **자유 입력 사유 대신 자동 변경 스냅샷으로 대체**했다.
  확정된 삭제 확인 디자인에 사유 입력 필드가 없고, 사유 필드를 추가하면 디자인을 벗어난다.
- 디자인 핸드오프의 **페이지 전역 타이포 스케일 업 블록은 의도적으로 이식하지 않았다.** 해당
  블록은 `.navi`/`.side__*`/`.toast`/`.btn` 등 모든 어드민 페이지가 공유하는 셸 요소까지 키우는데,
  이 페이지만 사이드바·버튼·토스트 크기가 달라지면 "하나의 운영 콘솔" 계약(CLAUDE.md §4)이
  깨진다. 린넨 전용 신규 요소(`.litem`/`.ltotal`/`.rofield`/`.leline`)는 핸드오프 값 그대로다.
- 디자인의 **"검토용 관리자 / 열람 전용" 전환 바는 구현하지 않았다.** 핸드오프 파일이 스스로
  "제품 UI 아님 — 검토용"이라고 표시한 프로토타입 장치이며, 실제 권한은 세션 역할(작성자 본인
  또는 owner/office_admin/cs_staff/field_manager)에서 파생한다.
- 등록자 필터의 "메뉴 안 검색"은 공용 `AdmDropdown` 에 `searchable` 모드로 추가했다. 별도 드롭다운을
  만들지 않았고, 관련 CSS 는 `admin-console.css` 의 공용 영역에 두어 다른 콘솔도 쓸 수 있게 했다.

### 여전히 범위 밖

- 대시보드 신규 등록, 상태 워크플로우
- 품목 마스터 관리, 월별 집계 대시보드, Excel/PDF export
- 모바일 흐름이나 기존 역할·권한 모델 변경

### 검증

`npm run lint` 통과(0 errors), `npm run build` 통과. 기준 문서:
`docs/product/19-linen-defect-workflow.md`, `docs/product/05-admin-web-ia.md`,
`docs/engineering/08-linen-defect-technical-design.md`.

## 2026-07-30 어드민 린넨 반품 — 사무실 기록 관리 콘솔로 범위 확정 (구현 전)

### 결정

- 현장 직원은 기존 모바일 `/mobile/linen-return/*`에서만 반품을 등록한다.
- 대시보드 예정 화면 `/admin/linen-return`은 사무실에서 기록을 확인·관리하는 콘솔이다.
- 사무실은 건물별·날짜별로 반품 **등록 시각, 건물, 전 품목, 품목별 수량/기록 총수량, 등록자**를 확인한다.
- 기본 조회는 Tokyo 이번 달·최신 등록순이며, 건물과 날짜/기간 필터를 제공한다.
- 대시보드는 모바일에서 이미 등록된 기록만 수정·삭제한다. 새 등록은 계속 모바일에서만 한다.
- 수정 가능 범위는 건물·품목/수량·메모·사진이다. 원래 등록 시각·등록자는 증빙값으로 보존한다.
- 삭제는 MVP hard delete이며, 확인 UX와 감사 기록을 필수로 둔다.

### 이번 범위에서 제외

- 대시보드 신규 등록, 상태 변경
- 품목 마스터 관리, 월별/품목별 집계, Excel/PDF export
- 모바일 흐름이나 기존 역할·권한 모델 변경
- UI 시각 디자인과 구현

### 이유

린넨 반품의 사무실 요구는 "언제·어디서·무엇을·얼마나·누가 반품 등록했는가"를 대조하고, 현장 입력의
오류를 사무실에서 바로 정정하는 것이다. 따라서 모바일의 새 등록 흐름은 중복하지 않되, 기존 기록의
수정·삭제 관리는 대시보드에 둔다.
상세 계약은 `docs/product/19-linen-defect-workflow.md`와 `docs/product/05-admin-web-ia.md`에 반영했다.

## 2026-07-22 SW 앱 셸 캐시 도입 — "HTML 미캐시" 결정 부분 번복 (콜드스타트 대응)

### 배경

iPhone 설치형 PWA 콜드스타트가 느리다는 대표님 지적. 원인 3종(① SW가 HTML 미캐시라 매 콜드런치가 풀
서버 렌더 대기 ② 홈 첫 바이트가 auth·쿼리 워터폴 뒤에 갇힘 ③ 가끔 Vercel 콜드스타트). ②는 세션 워터폴
병렬화 + 홈 스트리밍으로 이미 완화. ①이 "화면 뜨는" 체감의 가장 큰 요인.

### 결정

기존 SW는 **의도적으로 HTML/RSC를 캐시하지 않았다**("설치형 앱이 stale 콘텐츠에 갇히지 않도록"). 이번에
대표님이 **stale 트레이드오프를 감수하기로 승인**하여, **콜드런치 전체-문서 내비게이션에 한해
stale-while-revalidate 캐시**를 도입한다. 열자마자 이전 화면을 즉시 보여주고 백그라운드에서 재검증.

### 안전장치 (auth 앱이라 필수)

- **캐시 대상**: 성공(200)·동일출처·**비리다이렉트** HTML만. `/auth`·`/onboarding`·`/api`는 캐시 제외.
- **로그아웃/리다이렉트**: 재검증이 리다이렉트/에러면 stale 사본을 **캐시에서 제거**(로그인 페이지를 앱
  콘텐츠로 서빙하지 않음).
- **자동 최신화**: stale 표시 후 SW가 클라이언트에 메시지 → `ServiceWorkerRegister`가 `router.refresh()`로
  조용히 최신 서버 데이터를 당김(리다이렉트면 하드 `reload`). 즉시 뜨고 곧 최신으로 자가 교정.
- **범위**: 앱 내부 클라이언트(RSC) 이동은 이 핸들러가 건드리지 않음 → 실행 중 앱 데이터는 종전대로 라이브.

### 근거

대표님이 "화면 뜨는게 너무 느리다"며 SW 앱 셸 캐시를 명시적으로 선택(트레이드오프 고지 후). 파일:
`public/sw.js`, `src/components/pwa/service-worker-register.tsx`. `npm run lint`/`npm run build` 통과.

## 2026-07-22 대시보드 `체크인/아웃` 독립 메뉴 폐기 — 예약 캘린더로 통합

### 배경

- 관리자 사이드바에 `/admin/check-in-out` 메뉴가 남아 있었지만 실제 페이지는 플레이스홀더뿐이었다.
- 반면 실운영 기능은 이미 `/admin` 홈의 "예약 체크인/아웃" 요약 카드와 `/admin/calendar`의 `Today ops`
  (체크인 / 체크아웃 / 투숙중 / 셋팅 대상) 안에 구현되어 있었다.
- 결과적으로 사용성 이득 없이 IA만 중복되고, "독립 모듈이 따로 있다"는 잘못된 기대를 만들고 있었다.

### 결정

- 대시보드에서 **체크인/체크아웃은 독립 모듈로 두지 않는다.**
- 예약 체크인/체크아웃 운영은 계속 필요하지만, 이는 **예약 캘린더 통합 콘솔의 일부**로 본다.
- 사이드바의 `체크인/아웃` 항목은 제거한다.
- 기존 플레이스홀더 라우트 `/admin/check-in-out`도 함께 삭제한다.

### 영향

- 관리자 정보(Information) 그룹은 `예약 / 캘린더`, `공지·게시판`, `Todoist`, `설정`만 유지한다.
- 향후 체크인/체크아웃 관련 재기획이 있어도 우선 기준 표면은 `/admin/calendar`와 `/admin` 홈이다.
- 문서도 독립 "체크인/체크아웃 전용 보드"를 별도 1차 필수 화면으로 보지 않고, 예약 콘솔 안의 운영
  영역으로 정렬한다.

## 2026-07-22 어드민 공지 관리 콘솔 재기획 확정 (구현 전)

### 배경

- 모바일 공지 기능은 목록 / 상세 / 팝업 / 읽음 추적 기준이 이미 정리되어 있다.
- 반면 어드민 공지는 `/admin/announcements`에서 동작은 하지만, 다른 대시보드 모듈처럼 공용 운영 콘솔
  패턴으로 정리된 상태는 아니다.
- 현재 UI는 "좌측 고정 생성 카드 + 우측 리스트 + 별도 상세 페이지" 구조라, 감시/배포/감사 흐름이 한눈에
  읽히지 않고 댓글 레거시까지 함께 남아 있다.

### 결정

- 어드민 공지는 **모바일 읽기 화면의 복제본이 아니라 배포 관리 콘솔**로 재구성한다.
- 상태/기본 뷰는 **Published / Drafts / Archived** 3개다.
- **모바일에서 가능한 공지 기능은 대시보드에서도 모두 가능해야 한다.**
- 상단 요약은 **게시중 / 초안 / 중요 / 팝업 활성 / 미읽음 남은 중요 공지**를 우선한다.
- **작성 권한과 운영 권한은 분리한다.** 작성/초안 편집은 모바일 작성 가능 역할과 parity를 맞추고, 게시 /
  보관 / 삭제 / 전체 운영 관리는 더 강한 권한(owner / senior_managing_director / office_admin 기본)으로 본다.
- 읽음 추적은 **모든 공지에 존재**하지만, 운영상 우선 감시는 **중요 공지 미읽음** 위주로 둔다.
- 목록 행은 제목, 상태, 중요/고정/팝업, 대상, 작성자, 날짜, 읽음 요약을 고밀도로 보여준다.
- 행 클릭 시 우측 상세 패널에서 본문 / 첨부 / 읽음 현황 / 게시/보관/삭제 액션을 처리한다.
- 공지의 방향성상 **댓글은 어드민에서도 핵심 기능으로 유지하지 않는다.** 게시판/제안함과 역할을 분리하며,
  현재 어드민 댓글 UI는 레거시 클린업 대상으로 둔다.

### 범위 메모

## 2026-07-22 Todoist 명칭 통일

### 배경

- 모바일 `/mobile/tasks` 워크스페이스는 이미 실제 기능이 구현되어 있다.
- 반면 어드민 사이드바에는 같은 흐름과 연결될 화면이 `반복 업무`라는 별도 이름으로 남아 있었다.
- 이 상태는 사용자에게 별도 모듈처럼 보이게 만들어 IA를 불필요하게 복잡하게 만든다.

### 결정

- 모바일 `할 일`의 사용자 노출 명칭을 `Todoist`로 통일한다.
- 어드민 `반복 업무`의 사용자 노출 명칭도 `Todoist`로 통일한다.
- 현재 라우트 id와 경로(`tasks`, `/admin/recurring-work`)는 우선 유지할 수 있지만, 이는 구현 레거시일 뿐 제품 명칭은 아니다.
- 과거의 독립 `Recurring Work Scheduler` 문서는 현재 기준 화면 정의로 쓰지 않는다. 현재 기준은 모바일/어드민이 같은 Todoist 작업 도메인을 공유하는 것이다.

### 영향

- 모바일 내비게이션, 모바일 화면 타이틀, 어드민 사이드바, 관련 제품 문서는 모두 `Todoist` 기준으로 본다.
- 향후 어드민 `/admin/recurring-work`는 별도 스케줄러가 아니라 데스크톱 Todoist 관리 콘솔로 기획한다.

- 이번 사이클은 **문서 재기획만 확정**한다. 구현은 아직 시작하지 않는다.
- 코드 기준 현재 살아 있는 기능(생성, 상태 변경, 읽음 패널, 이미지, 팝업 후보 계산)은 재사용 후보다.
- 재기획 상세는 `docs/product/11-announcement-workflow.md` → "Admin Dashboard Management Console" 을
  기준으로 한다.

## 2026-07-22 숙소 매핑 중복(가부키초=176431) 근본 수정 — property_name을 마스터 기준으로 해결

### 증상

예약 캘린더에서 **가부키초가 "가부키초" + "176431" 두 건물로 쪼개져** 표시. `176431`은 가부키초의
Beds24 external_property_id. 같은 방(202#, 403#…)이 두 건물에 나뉘어 나타남.

### 원인

- **예약 property_name을 Beds24 payload 기준으로 저장**하는데, `/bookings` 응답에 `propName`이 빠진
  건은 코드가 **raw `propId`("176431")로 폴백** → 같은 건물이 두 이름으로 갈림.
- 게다가 `room-sync.ts`의 `upsertPropertyByExternalId`가 **매 동기화마다 property 마스터 이름을 payload
  값으로 무조건 덮어써서**, propName 없는 웹훅 한 번이면 마스터 이름 자체가 "176431"로 변질됨.
- `getCanonicalPropertyName`은 "Kabukicho"→"가부키초" 매핑은 있으나 raw id "176431"은 매핑이 없어 그대로
  노출. (제 웹훅 400 수정과 무관한, 이전부터 있던 매핑 결함. 라이브 웹훅이 살아나며 표면화)

### 수정 (코드 3곳 — 어느 경로든 건물 이름이 property 마스터 하나로 수렴)

1. `room-sync.ts`: propName이 없으면 **기존 property 마스터 이름을 raw external id로 덮어쓰지 않음**
   (상태만 active 갱신). 신규 property일 때만 최후수단으로 external id를 placeholder 사용.
2. `reservations-backfill.ts`: 예약 property_name을 payload propName 대신 **external_property_id로 조회한
   마스터 이름 우선**.
3. `process-webhook-booking.ts`: 웹훅도 raw propId 폴백 제거 → 동기화된 property 마스터(id)에서 이름 조회해
   우선 적용.

### 데이터 정정 (배포 후, 프로덕션)

- property 마스터 8개 이름 재확정(raw 숫자로 남은 것만): 176431→Kabukicho 등. 중복 property 없음.
- **raw-id 예약 property_name을 external_property_id 매칭으로 마스터 이름에 일괄 병합**(176431→Kabukicho,
  176430/280663/243936→각 마스터). 정정 후 사무실 org 예약은 **8개 건물로 클린**(raw-id 0건, 합계 1904).

검증: `npm run lint`(에러 0) / `npm run build` 통과. 최신 배포(commit `8fa6664`) 프로덕션 READY.

## 2026-07-22 Beds24 웹훅 전량 400 유실 — 근본 수정 (파싱 견고화 + 무손실 캡처)

### 배경 (재발 사고)

대표님이 "다카다노바바 7층 예약 고객 데이터가 누락된 것 같다"고 지적. 조사 결과 **7층만의
문제가 아니라 2026-07-17 이후 전 숙소의 신규·취소·변경 예약이 통째로 누락**된 상태였다.

- 예약 테이블 1,813건 전부 `updated_at`/`created_at`이 **2026-07-17 07:07:31에 정지** — 이후 생성·수정 0건.
- `beds24_webhook_events` 기록은 전부 `reconciliation`(수동)뿐, 라이브 `webhook` 수신은 **역대 0건**.
- Vercel 런타임 로그: Beds24가 웹훅을 지금도 분 단위로 보내고 있으나 **전부 HTTP 400**으로 거부됨.
- 원인: 웹훅 라우트가 예약 후보를 못 찾으면(`extractBeds24WebhookBookingCandidates`가 0건) **관측 로그를
  남기기 전에 400으로 조기 반환**해 버려, 5일치 예약이 흔적도 없이 사라졌다. 이는 2026-06-10 사고
  (Kabukicho 302 유실)와 같은 클래스의 "조용한 유실"의 재발이다.
- 400의 하위 원인은 확정 전(로그에 본문 미기록)이지만 유력 후보는 (a) 본문이 JSON이 아닌
  form-urlencoded, (b) 예약이 우리가 탐색하지 않던 envelope 키(`booking` 등) 아래로 옴 — **둘 다** 이번
  수정에서 견디도록 처리.

### 결정/작업 — "앞으로 데이터 누락은 절대 없어야 한다"(대표님 지시)

1. **본문 파싱 견고화** — 원본 텍스트를 1회 읽어 JSON *또는* `application/x-www-form-urlencoded`
   (JSON을 담은 폼 필드는 언랩)로 파싱. 전송 인코딩 때문에 유실되지 않음.
2. **Envelope 무관 추출** — `extractWithMatcher`가 고정 키 목록(`data/bookings/items/results`) 대신
   **모든 중첩 객체/배열을 재귀 탐색**(깊이 8 제한)하도록 일반화. 어떤 wrapper 키로 감싸도 예약을
   찾아낸다. 예약 매칭은 booking id + 체류일(또는 취소 신호) 필수라 오탐 없음. booking id로 중복 제거.
3. **무손실 캡처(핵심 계약)** — 예약을 하나도 못 뽑으면 **400으로 버리지 않고**, 전체 원본 본문 +
   `Content-Type`을 `beds24_webhook_events`에 저장(신규 컬럼 `raw_payload`/`content_type`, 마이그레이션
   `202607220001_beds24_webhook_raw_capture.sql`, 원격 적용 완료)하고 **2xx로 ACK**(Beds24 재시도 폭주
   방지). 부분 실패 배치도 원본을 남겨 재처리 가능. 성공 예약은 기존대로 raw 미저장(PII 최소화).
4. 관련 헬퍼: `recordBeds24WebhookRejection` 신설, `recordBeds24WebhookEvent`에 실패 시 raw 캡처 옵션 추가.

### 복구/운영 확인

- **7/17→현재 누락분 복구 — 완료 (2026-07-22).** 웹훅 수정은 소급되지 않으므로(이미 온 웹훅은 Beds24가
  재전송 안 함), 로컬 dev 백필 라우트(`/api/dev/beds24/backfill-reservations`, org=사무실
  `f393a735`, window `2026-06-01`→`2028-01-01`)로 Beds24 API에서 재풀해 upsert. 결과: fetch 1538 /
  upsert 1533(취소 474 반영) / 실패 0 / partial 없음. 사무실 org 예약 1813→**1904건**, 최원거리 체크인
  **2027-01-26**까지. 다카다노바바 7층 등 7/17 이후 신규 예약(예: 7/22 체크인 건) 정상 복구 확인. 스킵
  5건은 guestName/propertyName 없는 Beds24 플레이스홀더(오너 블록 추정, 실제 고객 예약 아님).
- **라이브 웹훅 실트래픽 검증 — 대기.** 새 배포(`4b1f1b2`) 이후 아직 Beds24 웹훅 미수신이라 2xx 전환
  확인은 다음 organic 웹훅 대기 중.
- **reconcile 자동 안전망 복원 — GitHub Actions로 이중화 (2026-07-22).** 원인 확정: `/api/beds24/reconcile`
  를 **수동 호출하면 HTTP 200**(fetch 882/upsert 880)으로 정상 작동 → 토큰·코드 정상, **유일한 문제는
  Vercel 크론 스케줄러가 엔드포인트를 아예 안 부르는 것**(24h 내 reconcile·reminders 둘 다 호출 0건, Hobby
  플랜/크론 설정 이슈로 추정). Vercel MCP로는 크론/env를 못 고치므로, **Vercel 크론에 의존하지 않는 외부
  트리거**를 추가: `.github/workflows/beds24-reconcile.yml`이 **6시간마다** reconcile 엔드포인트를
  `x-beds24-webhook-secret` 헤더로 호출(prod에서 200 확인). vercel.json 크론은 idempotent라 중복 트리거로
  그대로 유지(살아나면 이득, 안 살아도 무해). **설정(1회): GitHub repo Secret `BEDS24_WEBHOOK_SECRET`**
  (Vercel 값과 동일)를 추가해야 워크플로가 인증된다.
- **task reminders 크론 미발화는 현재 정상.** 알림은 개발 막바지 일괄 구현 방침이라 지금 미가동이 맞다
  (reminders 엔드포인트는 `CRON_SECRET` 필요, 현재 404). 별도 조치 불필요.
- **미사용 org `현장 근무`(06445066)** — 멤버 0명·stale 예약 178건. 로그인 사용자가 없어 운영 영향 없음.
  삭제는 정책상 승인 필요하므로 보류(그대로 둠). 실운영 org는 `사무실`(f393a735) 하나.

검증: `npm run lint`(에러 0) / `npm run build`(성공) 통과. 상세는
`docs/engineering/07-environment-setup.md` → "Webhook ingestion hardening (2026-07-22)".

## 2026-07-17 Beds24 실연동 활성화 + 예약 캘린더 스케일 버그 수정

### 결정/작업

- **웹훅 실시간 연동 활성화.** Vercel 프로덕션에 `BEDS24_SYNC_PAUSED=false`·`BEDS24_DEFAULT_ORGANIZATION_ID`
  (사무실 org)·`BEDS24_API_REFRESH_TOKEN`을 설정하고 만료된 `BEDS24_API_TOKEN`을 삭제 → refresh token
  자동 발급 경로 활성화. invite code는 `/authentication/setup`으로 1회 교환해 refresh token 획득.
  웹훅은 8개 연동 숙소 전부에 설정됨(실시간 신규·취소 무손실).
- **운영 윈도우 확대 (당월+1 → 당월+미래 2달, 3개월).** `getOperationalWindow()` (`reservations-backfill.ts`).
  reconcile/크론이 이 창을 쓴다. 창은 **도착일(arrival) 기준 overlap**이라 예약 시점과 무관 —
  "1년 전 예약, 내일 체크인"도 잡힌다. 근거: 체크인이 당월+미래 2달 안이면 무손실이어야 한다는 요구사항.
- **광역 백필 기능.** `backfillBeds24Reservations`에 옵션 `from`/`toExclusive` (기본=운영 윈도우, 크론 불변),
  dev 라우트 `/api/dev/beds24/backfill-reservations`에 `from`/`to` 파라미터. 2026-06~2027-12 1회 백필로
  먼 미래 예약 seed(사무실 org 예약 1476→1815, 미래 확정 498, 2027-01까지).
- **데이터 정합 수정.** `Arakicho A`의 `external_property_id`가 null이라 예약 176430(최다 숙소)이 매핑 실패
  → `176430` 설정 후 전부 복구. 룸 마스터·인벤토리 재동기화. 테스트/artifact 예약 2건 삭제.
- **예약 캘린더 스케일 버그 3종 수정:**
  1. **크래시** — `listReservationInternalNotes`의 `.in(reservation_id, [510개])`가 URL 길이 초과로
     `fetch failed`. `chunk()` 헬퍼(`utils.ts`)로 200개씩 분할. 어드민+모바일 캘린더 공통 해결.
  2. **월-경계 바 누락** — `admin-reservation-console.tsx`에서 체크아웃이 다음달 1일인 예약이
     `checkOutDay(=1)`로 계산돼 0.75칸 점으로 찌부러짐. `endsAfterMonth` 판정을 `>` → `>=`로 수정
     (월말까지 clamp). 모바일·프린트 뷰는 date-diff/clamp 방식이라 애초에 정상.
  3. **룸 라벨 표시** — 어드민 청소 콘솔이 표시용 `room`에 raw `canonicalRoomLabel`("501_2")을 노출
     → `getDisplayRoomLabel`/`getDisplaySessionRoomLabel` 적용해 "501"로. 매칭용 `roomKey`는 raw 유지.
     모바일·어드민 캘린더는 이미 display 함수 사용.
- 검증: tsc·lint·build 통과.

## 2026-07-16 주문·비품 어드민 운영 콘솔 재구축 — 기획 확정 (구현 전)

### 배경

청소·수리·점검·분실물 어드민이 모두 공용 **운영 콘솔** 패턴(KPI + 뷰 전환 + 우측 상세 패널 + 공용
primitives)으로 재구축됐는데, `/admin/orders`만 **구형 플랫 목록**으로 남아 대시보드에서 혼자 이질적이었다.
이를 같은 계약으로 맞춘다.

### 결정 — 콘솔 설계

- **성격**: 감시 + 이력 + **능동 처리** + 예외 개입(분실물과 동급의 처리형 콘솔).
- **4뷰**: ① 현황 보드(승인대기/주문대기/주문완료 3칼럼) ② 목록·이력 ③ **배송 예정(월 캘린더)** ④ 종결.
- **배송 캘린더를 어드민에 신설** — 그동안 모바일 전용이라 비어 있던 어드민 캘린더 공백을 해소. `order_requests`
  의 `delivery_date`/range에서 파생(스키마 변경 없음). 날짜별로 **어느 건물·누가 신청·무슨 비품·언제 배송**을
  보여주고 **건물별 필터**를 둔다.
- **모바일↔대시보드 관리 대칭(parity)** — 요청자가 모바일에서 넣은 것(품목·상품 링크·사진·긴급도·건물)을
  관리자가 상세 패널에서 전부 보고 처리. 특히 **상품 링크(Amazon/IKEA 검색으로 붙인 URL)는 도메인 배지 +
  클릭 가능한 앵커**로 렌더(콘솔에 도메인 배지 추가).
- **긴급도(urgency) 노출** — 지금까지 UI에 없던 긴급 배지 + 필터 + 정렬 우선순위를 추가.
- **거절 건 재오픈** — `closed → requested` 되돌리기(분실물 복원과 같은 예외 개입). 배송 컬럼 초기화.
  서버 액션 신규 1종. 문서의 Open Question("거절 건 재제출")을 해소.
- **재사용**: 데이터 헬퍼·능동 처리 서버 액션(`updateOrderRequestStatus`/`updateOrderDeliveryDate`/삭제)·
  내보내기(Excel/PDF)는 전부 기존 것. **DB 스키마 변경 없음.**
- **범위 밖**: 알림(막바지 일괄 구현 방침), 입고/`received` 활성화·비품 카탈로그·재고·단가(별도 워크플로 확장).

상세 명세는 `docs/product/10-order-request-workflow.md` → "주문·비품 어드민 운영 콘솔".

**Status update (2026-07-16): 구현 완료.** 위에서 기획한 대로 `/admin/orders`를 4뷰 운영 콘솔로
구현했다(현황 보드 / 목록·이력 / 배송 예정 캘린더 / 종결). 계획 단계에서 "스키마 변경 없음 · 신규 액션
재오픈 1종"으로 정했던 것이 구현 중 범위가 넓어졌다 — 실제로는 **신규 마이그레이션
`202607190001_orders_console.sql`이 `order_requests`에 `admin_memo text`(nullable) 컬럼을 추가**했고
(RLS 정책 불변, 원격 Supabase 적용 완료), **신규 서버 액션이 4종**(`rejectOrder`/`reopenOrder`/
`correctOrderStatus`/`editOrder`, `src/app/admin/orders/actions.ts`)으로 늘었다. VM 레이어
`src/lib/admin-orders.ts`(`getAdminOrders`)가 DB의 `received` 상태를 콘솔 표시에서 `ordered`로
매핑한다(콘솔은 4개 표시 상태만 사용: requested/approved/ordered/closed). 배송 예정 캘린더는 계획대로
어드민에 신설(건물 필터 포함), 긴급도(urgency) 배지·필터·정렬도 계획대로 노출했다. 구 상세 라우트
`/admin/orders/[id]`는 콘솔 우측 패널로 대체되어 고아 라우트가 됐고 **2026-07-17에 삭제**했다(파일·
`[id]` 디렉토리 제거, 공유 헬퍼는 모바일 상세에서 계속 사용). 마이그레이션 `orders_console`는 원격
`schema_migrations`에 version `20260717005554`로 등록(2026-07-17). 기존 내보내기(Excel/PDF)·승인/
주문처리/배송일수정/삭제 액션은 계획대로 재사용했다. `npm run lint` / `npm run build` 통과. 상세는 `docs/product/10-order-request-workflow.md` → "주문·비품
어드민 운영 콘솔 (구현 완료 — 2026-07-16)".

## 2026-07-16 분실물 자동 폐기 · 폐기 내역 90일 · 자동 삭제 확정 (2026-07-15 "수동 폐기" 대체)

### 배경

2026-07-15에는 "2주 만료를 자동 이관·자동 삭제하지 않고 사람이 수동 폐기"로 정했지만, 대표님이
**"매번 수동으로 폐기·삭제할 수 없다(운영 부담)"**고 지적했다. 원래 계획도 2주 뒤 자동 처리였다.

### 결정 — 자동 생애주기

- **자동 폐기**: 등록일 + 14일 경과 & 미반환 & 미연장 → 시스템이 자동으로 `disposed` 처리하고 **폐기
  내역**으로 이동. (D-3에 `disposal_scheduled` 임박 표시로 올려 연장 기회를 준다.)
- **폐기 내역 90일 보관**: 폐기된 건은 폐기일 + 90일 동안 보관(손님 문의·분쟁 대비).
- **자동 하드 삭제**: 폐기일 + 90일 경과 → 레코드 완전 삭제(되돌릴 수 없음). CLAUDE.md "user-triggered
  hard delete" 기본값에 대한 **명시적 승인 예외**(대표님 승인).
- **연장 예외**: `hold_until` 연장 건은 그 날짜까지 자동 폐기 제외.
- **수동 병존**: 조기 폐기·반환·연장·상태 정정·(잘못된 등록) 수동 삭제는 그대로. 수동 삭제는 감사 기록
  없이 즉시 하드 삭제.

### 화면 — 폐기 내역 뷰 신설 (대표님 요구)

콘솔이 **4뷰**가 된다: 현황 보드 / 목록·이력 / 반환완료 / **폐기 내역**. 폐기 내역은 각 건의 **삭제
예정일(폐기+90일) D-day**와 삭제 임박(D-7) 배지를 보여준다. 상세 명세는
`docs/product/09-lost-found-workflow.md` → "뷰 구성".

### 구현 메모

"자동 폐기(14일)"·"자동 삭제(폐기+90일)"는 **매일 1회 스케줄 작업**(Supabase pg_cron 또는 Vercel Cron)이
필요하다. 상수: `LOST_FOUND_STORAGE_DAYS=14`, `LOST_FOUND_DISPOSAL_RETENTION_DAYS=90`,
`LOST_FOUND_DUE_SOON_DAYS=3`, `LOST_FOUND_PURGE_SOON_DAYS=7`. **구현은 아직 시작하지 않았다.**

**Status update (2026-07-16): 구현 완료 (빌드 그린).** 위에서 기획한 대로 `/admin/lost-found`를 4뷰
운영 콘솔로 구현했다(현황 보드 / 목록·이력 / 완료(반환+폐기) / 폐기 내역). 반환 방식은 최종적으로
**`delivery`(배송) / `pickup`(방문 수령)** enum(`lost_return_method`)으로 확정·구현됐다(기획 초안의
`shipped`/`picked_up` 명칭은 채택되지 않음). 자동 생애주기는 `public.lostfound_auto_dispose()` /
`public.lostfound_auto_purge()`(SECURITY DEFINER) + pg_cron 매일 1회로 마이그레이션
`202607180001_lostfound_console.sql`에 구현됐고 **원격 Supabase 프로젝트에 적용 완료(2026-07-16,
MCP)**다 — pg_cron 확장 활성화 + 배치 잡 2종(`lostfound-auto-dispose` / `lostfound-auto-purge`)
등록까지 확인됨. `npm run lint` / `npm run build` 통과. 상세는
`docs/product/09-lost-found-workflow.md` → "대시보드 분실물 관리 콘솔" 참고.

**복원(restore) 추가 (2026-07-16):** 완료(폐기/반환) 건을 다시 보관중으로 되돌리는 **복원**을 예외 개입에
추가했다(관리자 실수·고객 재방문 대응). 사용자 결정: (1) 복원 대상 = **폐기 + 반환 둘 다**, (2) 복원 후
상태 = **보관중**, 보관 시계 = **복원일+14일**(자동 폐기 배치가 발견일+14 기준으로 즉시 재폐기하지
않도록), (3) 복원 이력은 **처리 메모에 append**(삭제는 무기록이지만 복원은 감사 흔적을 남김). 서버 액션
`restoreLostItem`(`disposed`/`returned`만 허용, `handled_*`·반환정보 초기화), 상세 패널 예외 개입 존
버튼 + `restore` 모달. 스키마 변경 없음(기존 컬럼만). `npm run lint` / `npm run build` 통과.

## 2026-07-15 대시보드 분실물 관리 콘솔 — 기획 확정 (구현 전)

### 배경

대시보드에서 분실물을 **관리·열람**할 콘솔을 기획했다. 대표님 방향: 대시보드에서 등록할 일은 거의
없고(등록은 현장 모바일), 등록된 분실물을 관리·감시하는 용도. 매커니즘은 수리·점검 콘솔과 같되,
회사 분실물 정책이 다르다 — **보관 2주 후 폐기, 고가 물품은 기간 연장, 반환은 배송 또는 직접수령**.

### 결정 (3개 갈림길, 대표님 확정)

1. **처리 범위 = 능동 처리까지 포함.** 수리·점검 콘솔은 순수 감시(처리는 전부 모바일)였지만, 분실물은
   배송 반환·만료 폐기를 **사무실이 대시보드에서 직접** 한다. 감시 + 이력 + 예외 개입 + **능동 처리 3종
   (반환 · 폐기 · 보관 연장)**. 현장 모바일 반환과 병존.
2. **반환 방식 = 구조화.** 배송(`shipped`) / 직접수령(`picked_up`)을 별도 필드로, 배송이면 송장번호를
   기록한다(`return_method` / `return_tracking_no`). 자유 메모만으로 두지 않는다 — 통계·필터·이력용.
3. **폐기 정책 = 수동 + 연장.** ~~2주(14일) 경과를 자동 이관·자동 삭제하지 않는다.~~ **→ 2026-07-16에
   자동 폐기 + 폐기 내역 90일 + 자동 삭제로 대체됨(위 항목).** 연장(`hold_until`) 개념과 '고가' 플래그
   없음(연장으로만 표현, `is_high_value` 컬럼 없음)은 유지.

### 추가 확정 (2026-07-15) — 구현 착수 전 결정 전부 확정됨

- **무효(void) 상태 없음 — 삭제만.** 잘못된·중복 등록은 하드 삭제로 정리하고 **감사 기록을 남기지
  않는다.** 예외 개입 = 상태 정정 + 삭제.
- **보관 시계 = 등록일(`found_at`) + 14일** ("등록한 날로부터 2주 뒤까지").
- **내보내기 없음.** 완료 뷰 포함 콘솔에 Excel/PDF 내보내기를 두지 않는다(수리·점검과 동일). 현재
  `/admin/lost-found`의 `LostFoundExportBar`는 콘솔 재구축 시 제거.

전체 기획 명세(뷰 구성·모달·필요 스키마·권한)는 `docs/product/09-lost-found-workflow.md` →
"대시보드 분실물 관리 콘솔 — 기획" 참고. **구현은 아직 시작하지 않았다.**

**Status update (2026-07-16): 구현 완료.** 자세한 구현 내역은 위 "2026-07-16 분실물 자동 폐기 · 폐기
내역 90일 · 자동 삭제 확정" 항목의 "Status update" 참고.

## 2026-07-14 어드민 캘린더 / 내보내기 공용 캐논 확정 (절대 규칙)

### 배경

화면마다 날짜 선택 UI와 내보내기 방식이 제각각이었다. 분실물·수리점검·주문은 네이티브
`<input type="date">` 2개 + CSV 링크, 연차 이력은 클라이언트 Blob CSV, 근태 수당·연차 잔여는 아예
동작하지 않는 스텁 버튼, 청소 기록·근태 급여·교통비만 제대로 된 Excel/PDF였다. 대표님 지시:
**"청소 기능 기록 탭의 캘린더와 내보내기 버튼을 기준으로 전면 통일하고, 앞으로 개발할 기능에도
절대 규칙으로 적용할 것."**

### 결정 1 — 캘린더는 3개 프리미티브뿐

`AdminDateRangePicker`(기간) / `AdminDatePicker`(하루) / `AdminMonthPicker`(월) 셋만 쓴다.
폼 제출용은 `DateRangeFormField` / `DateFormField` 래퍼.

- **어드민 콘솔에서 네이티브 `<input type="date">` 신규 사용 금지.**
- 캐논 크롬은 청소 기록 범위 피커의 `.calpop`(292px / radius 16 / padding 14 / 30px nav / 34px 셀).
  `.adp__*`(단일일), `.amp__*`(월)의 팝오버 CSS를 여기에 맞춰 정렬했다. 셋은 lockstep으로 유지한다.
- `AdminMonthPicker`는 **월 선택 개념 그대로 유지**(급여/교통비/수당). 검토했지만 범위 피커로 바꾸지
  않기로 확정 — 월 단위 정산은 범위 선택과 다른 조작 개념이다. 시각만 통일한다.

### 결정 2 — 내보내기는 Excel + PDF 2종, 컨트롤 1개, 템플릿 1개

- 컨트롤: `<AdminExportButtons>` (`chipbtn` + lucide `Download` ×2). 화면별 자체 버튼 금지.
- 서버: `buildAdminTableWorkbookBase64()` / `buildAdminTableReportHtml()` — **동일 입력 구조**를 받아
  각각 .xlsx와 인쇄용 HTML을 낸다. 초록 원장 서식은 `attendance-payroll-workbook.ts` 상수 재사용.
- **Excel과 PDF는 항상 함께.** 한쪽만 있는 화면은 미완성으로 본다.
- **CSV 전면 폐기.** `/api/admin/export/[resource]` 라우트, `lib/export/admin-export.ts`,
  `lib/export/csv.ts`, `lib/export/admin-reservations.ts`, `ExportCsvLink` 전부 삭제.
  대표님 확정: CSV 페이지는 버튼만 갈아끼우지 말고 **실제 Excel+PDF로 교체**할 것.
- 스텁 버튼(근태 수당 / 연차 잔여)은 **이번 사이클에 실제 구현**할 것 — 대표님 확정.
- 내보내기 로케일은 **서버가** `session.user.preferredLanguage`에서 해결한다
  (`buildAdminExportMeta`). 클라이언트는 로케일을 넘기지 않는다.
- 공용 문구는 `dictionary.admin.shared` 네임스페이스(ko/ja/en) 하나로 통합. 기능별 중복 키 제거.

### 적용 범위 (2026-07-14 구현 완료)

| 화면 | 캘린더 | 내보내기 |
| --- | --- | --- |
| 청소 기록 | 기준(변경 없음) | 공용 빌더로 위임 (서식 동일) |
| 분실물 / 수리·점검 / 주문·비품 | native date ×2 → `DateRangeFormField` | CSV → **Excel + PDF 신규** |
| 연차 이력 | 필터 없음 → `AdminDateRangePicker` **신규** | Blob CSV → **Excel + PDF 신규** |
| 연차 잔여 | 입사일 편집 → `AdminDatePicker` | 스텁 → **실구현** (전체 + 1인) |
| 연차 신청 모달 | native date ×2 → `AdminDatePicker` | — |
| 근태 수당 | (월 피커 유지) | 스텁 → **실구현** (요약 + 시급 이력 2시트) |
| 근태 급여 / 교통비 | (월 피커 유지) | 이미 캐논 — 변경 없음 |

**범위 밖(사유 명시):** 예약 캘린더 월 뷰 = 피커가 아니라 캘린더 *뷰*. `/onboarding`·`/account`의
native date = `.adm` 콘솔 밖(모바일 디자인 언어).

Status: **Confirmed & implemented (2026-07-14).** 절대 규칙은 `CLAUDE.md` §4a/§4b와
`docs/product/05-admin-web-ia.md`에 기록. 앞으로 추가되는 모든 어드민 화면에 무조건 적용한다.

## 2026-07-14 조직 모델 방향 — 단일 조직 + 현장/사무실 뷰 라벨 (조직 간 공유 아님)

### Org model — single org + field/office view label, NOT cross-org data sharing

- 대표님 의도: "조직은 나눠져 있어도 같은 팀이라 데이터가 이어져 보여야 하고, 조직만 나눠서 볼 뿐."
- **결정: 조직을 여러 개로 쪼개 데이터를 공유하는 방향(Option B)은 채택하지 않는다.** 그건 전 테이블
  RLS·쿼리·멤버십을 갈아엎고 조직 격리(확정 계약, CLAUDE.md 규칙 6)를 약화시키는 대규모·고위험 작업.
- **채택(Option A): 조직은 그대로 테넌트 경계로 두고, 한 조직 안에 "현장/사무실"(사이트/부서) 라벨을
  뷰·필터 차원으로 추가**한다. 데이터는 한 조직 안에서 자연히 전부 공유되고, 화면에서 현장/사무실로
  나눠 보기만 한다. RLS 재설계 불필요.
- **미정(설계 필요):** 라벨을 무엇에 붙일지(멤버십이 유력), 어느 화면에서 필터로 쓸지, 값이 고정
  현장/사무실인지 일반 사이트 목록인지. 별도 기획 사이클에서 확정 후 구현.
- 조직 CRUD(이름 변경·빈 조직 삭제·생성)는 이 방향과 무관하게 유지(개발자가 서로 다른 고객 팀=서로 다른
  조직을 관리하는 용도).

Status: Direction confirmed (2026-07-14). 설계·구현 대기. 아직 데이터 모델 변경 없음.

**Status update (2026-07-14): Phase 1 implemented.** 라벨은 `memberships`에 붙는 것으로 확정 —
새 `teams` 테이블(`kind` = field/office, `name`은 향후 하위팀용)을 추가하고 `memberships.team_id`로
연결. 마이그레이션 `supabase/migrations/202607140001_teams.sql` 작성 완료(조직별 현장/사무실 기본 팀
시딩 + 기존 멤버 role 기반 백필 + RLS: 활성 멤버 SELECT, 쓰기는 서비스롤 서버 액션만) — **DB에는 아직
미적용**. `/admin/users/[id]`에 소속(현장/사무실/미지정) 드롭다운+저장, `/admin/users` 목록에 소속
컬럼+필터 추가(`setMemberTeam` 서버 액션, `getOrgTeams` 헬퍼). tsc 0 / lint 0. **후속 단계(미구현):**
팀 CRUD(하위팀 생성)와 근태/청소/대시보드 화면의 팀 필터. 상세: `docs/product/01-user-roles.md`,
`docs/engineering/04-data-model.md` → `teams`, `docs/planning/06-current-status.md`.

## 2026-07-13 어드민 드롭다운 단일 표준화 (`.dd`) — 칩형 드롭다운 폐기

### Single admin dropdown standard — `.dd` (AdmDropdown), chip dropdown retired

- **어드민 콘솔의 드롭다운은 사용자 화면의 `.dd`(`AdmDropdown`) 하나로 통일.** 화면마다 다른
  드롭다운을 두지 않는다. 값 편집·필터·정렬 전부 이 컴포넌트만 쓴다. 네이티브 `<select>`를 폼에서
  대체할 땐 `DdFormSelect`(숨은 input 래퍼)를 쓴다.
- **구 칩형 `ChipDropdown`(`.adp` 드롭다운)은 폐기·삭제.** 근태 큐(출근·연차)의 필터 4곳을 `.dd`로
  이관했고 컴포넌트 파일(`admin-chip-dropdown.tsx`)을 삭제했다. 초대(invites) 페이지의 네이티브
  `<select>` 2곳도 `.dd`로 교체.
- `.dd` CSS를 `users-console.css` → **`admin-console.css`로 이동**(AdminShell이 전 `.adm` 페이지에
  로드)하고, 컴포넌트를 `components/admin/users/` → **`components/admin/shared/`로 이동**해 공용화.
- **후속(2026-07-14): 두 번째 커스텀 드롭다운 `AdminSelectField`(`.selfield`)도 폐기·삭제.** 근태 수기
  세션 모달·수당 섹션 3곳을 `.dd`로 이관(`AdmDropdown`에 `disabled` prop 추가), `.selfield` CSS 제거.
  초대 페이지 만료일 네이티브 `<input type="date">`도 `AdminDatePicker`(폼 래퍼 `DateFormField`)로 교체.
  이로써 어드민 드롭다운/선택 컨트롤은 `.dd` 하나로 완전 일원화(달력형 피커는 별개 컨트롤로 유지).
- 달력형 피커(`AdminDatePicker`/`TimePicker`/`MonthPicker`)와 `.adp`/`.chipbtn` 시각 언어는 드롭다운이
  아닌 별개 컨트롤이라 그대로 유지(날짜/월 피커 등에서 계속 사용).

Reason: 역할 드롭다운(사용자)·칩 필터(근태)·네이티브 select(초대 등)로 드롭다운이 화면마다 달라
일관성이 깨졌다. 청소 등 신규 대시보드를 만들기 전에 단일 표준으로 못박음(2026-07-13).

Status: Confirmed + 구현 완료 (2026-07-13). tsc 0 / lint 0 errors. 청소 대시보드 기획도 `.dd` 사용으로 기록됨.

## 2026-07-13 초대코드(팀코드) 관리를 설정에서 사용자 화면으로 이전

### Invite-code (team code) management moved from Settings into the Users screen

- Moved `/admin/settings/invite-codes` → `/admin/users/invites`, so the full member lifecycle
  (invite → manage role/status → deactivate → delete) lives in one place instead of being split
  between Settings and Users. `/admin/users` and `/admin/users/invites` are now linked by a shared
  "멤버 목록"/"멤버 초대" pill tab switcher (`src/components/admin/users/users-section-tabs.tsx`).
  Old links to `/admin/settings/invite-codes` still resolve — the page there is now a redirect stub.
- Gate unified: `canManageInvites` (`src/app/admin/settings/actions.ts`) no longer hardcodes
  `owner`/`office_admin`/`senior_managing_director` role checks. It now defers to
  `actorCanManageUsersInOrg` (`src/lib/user-management-access.ts`) — developer, or an org membership
  with `manage_users = true` — the same gate that already protects `/admin/users`. This also fixes a
  standing bug where `senior_managing_director` (전무) couldn't create invite codes because the old
  hardcoded role array omitted that role.
- **Not changed:** the default-role grant ceiling inside `createInviteCode` — developer/owner/전무 may
  pick any invite category, everyone else (i.e. `manage_users` delegates without one of those roles)
  is still limited to `officeAdminAssignableRoles`. This mirrors `canAssignRole`'s manual role-change
  tiering and stops a delegate from self-service-granting `office_admin`-or-above via invite code.
- The settings page's invite-code card was removed; `/admin/settings` now only lists organization
  (and, for org top admins, attendance) settings.
- New page (`src/app/admin/users/invites/page.tsx`) reuses the old create-form + list + deactivate
  markup, restyled with the `.adm`-scoped `users-console.css` primitives (`ui-card`, `ui-btn`,
  `ui-input`, `ui-badge`, `ctitle`, `chint`) instead of shadcn `Card`/`Button`/`Input`, to match the
  visual tone of the rest of the users console.
- Known gap carried over, not fixed in this change: `getManageableOrganizations` (the org picker for
  the invite-create form) still filters by `role in (owner, office_admin)` rather than `manage_users`.
  A `manage_users` delegate who holds neither role would pass the page gate but see zero organizations
  to pick from. Flagged for a follow-up once it's clear whether `manage_users` delegates are expected
  to hold cross-org invite scope.

Impact:
- `src/app/admin/settings/actions.ts`
- `src/app/admin/settings/invite-codes/page.tsx` (now a redirect stub)
- `src/app/admin/settings/page.tsx`
- `src/app/admin/users/invites/page.tsx` (new)
- `src/app/admin/users/page.tsx`
- `src/components/admin/users/users-section-tabs.tsx` (new)
- `src/components/admin/users-console.css`
- `src/lib/i18n.ts`
- `docs/product/05-admin-web-ia.md`

## 2026-07-10

### Onboarding recovery UX hardened: visible login return path and actionable duplicate-phone handling

- The profile-setup onboarding wizard now exposes an explicit `로그인으로 돌아가기 / Back to login / ログインに戻る` action on every step, not only on some footer states. The action signs the user out and returns to `/auth/login` while preserving the selected language.
- Reason: users can enter onboarding through the wrong Google/email account and previously had no obvious escape path once they moved past the intro screen.
- Duplicate phone-number handling stays an account-level uniqueness rule, but the UX is now recoverable:
  - when profile submit fails with `phone_duplicate`, onboarding jumps the user back to the phone-number step
  - the phone step shows a visible error/explanation telling the user to either enter a different number or return to login and use the existing account that already owns the number
- This is a UX hardening change only. No role, schema, or uniqueness-policy change was made.

Impact:
- `src/app/onboarding/onboarding-wizard.tsx`
- `src/app/onboarding/page.tsx`
- `src/lib/i18n.ts`
- `docs/product/04-organization-invitations.md`
- `docs/product/17-user-profile-directory.md`
- `docs/planning/06-current-status.md`

### Attendance allowance design accepted for busy-day staffing coverage

- **Implemented 2026-07-10** (migration `202607100001`): table + calculation + admin/mobile display +
  Excel/PDF export + finalized-snapshot `allowance_breakdown`. See
  `docs/engineering/11-attendance-payroll-technical-design.md` → "As-built — attendance allowances".
- Planned a new **근태 추가수당 / attendance allowance** layer for cases where the company pays extra on
  busy or short-staffed days to secure enough workers.
- Confirmed terminology: use **추가수당 / allowance**, not "bonus" or "incentive". This is operational
  staffing coverage pay, not a discretionary bonus.
- Confirmed boundary: do **not** write one-off busy-day amounts into `hourly_rate_history`. That table
  remains the base contractual/default hourly-rate history. Allowances are a separate pay calculation
  layer and must be preserved in finalized payroll snapshots.
- MVP allowance types:
  - `daily_fixed`: a fixed extra amount paid once per worker/date when the worker has valid paid work.
  - `hourly_extra`: an extra hourly amount multiplied by recognized paid minutes for the date.
- MVP targeting: a Tokyo operating date, applying either to all hourly workers or to one specific
  worker. Site/role/time-window/work-type targeting stays deferred.
- Permission direction: create/cancel and org-wide views stay with `owner` /
  `attendance_payroll_admin`; workers may see only allowances applied to their own pay view.
- Finalized-month rule: allowance changes are blocked once a user-month is finalized; operators must
  reopen the month, change allowances, then re-finalize.

Impact:
- `docs/product/21-attendance-payroll-workflow.md`
- `docs/engineering/11-attendance-payroll-technical-design.md`
- `docs/engineering/04-data-model.md`
- `docs/engineering/05-rls-permissions.md`

## 2026-07-09 (2)

### Invite-code creation UI extended to office_admin / field_manager; owner and cs_staff stay manual

- `src/config/roles.ts` has always defined 5 invite categories (`INVITE_CATEGORIES` /
  `inviteCategoryToRole`), but the actual invite-code creation UI
  (`src/app/admin/settings/invite-codes/page.tsx`) and its server-side validation
  (`src/app/admin/settings/actions.ts`) only ever allowed picking `staff`/`part_time_staff` as the
  default role — a known, documented gap (`docs/product/04-organization-invitations.md`). Discovered
  while reviewing whether the new permission-override feature (`docs/product/27`) interacts with the
  signup/role-assignment path.
- Fixed: `inviteDefaultRoles` in both files now also includes `office_admin` and `field_manager`. No
  new i18n needed — `dictionary.roles` and `dictionary.*.inviteCategories` already had labels for
  every role/category, they just weren't reachable from this screen.
- `owner` stays excluded: it needs a separate single-use invite-code flow that doesn't exist yet, and
  handing out a shareable multi-use code that grants org ownership is a meaningfully bigger risk than
  the other roles.
- `cs_staff` stays excluded: it has no invite category at all by original design (admin-assigned
  only, per the comment in `roles.ts`) — this was intentional, not a gap, so it's untouched.
- Both remain reachable only via manual role change at `/admin/users/[id]` (`updateMemberRole`),
  which already has its own tiered permission check (`canAssignRole`).

Why: this was flagged as unrelated to the permission-override feature currently being designed, but
the user asked to fix genuine gaps found along the way rather than deferring them, since letting a
documented-but-unfixed limitation sit indefinitely is its own form of drift between docs and code.

Impact:
- `src/app/admin/settings/invite-codes/page.tsx`, `src/app/admin/settings/actions.ts`
- `docs/product/04-organization-invitations.md`

## 2026-07-09

### Admin reservation calendar dashboard v1 implemented

- Implemented the first real `/admin/calendar` dashboard slice using the accepted admin-calendar
  direction from `docs/product/15-reservation-calendar.md`: dense room/date month board first, with
  no financial data and a secondary reservation inspector.
- The page is now a single integrated reservation console with 4 views:
  - month board
  - today ops
  - room status
  - building info
- Reused the same reservation-to-room mapping policy as the mobile calendar so the admin console does
  not drift on room resolution, fallback rows, or the no-drop policy for reservations that do not map
  cleanly to the active room catalog.
- Confirmed policy: the dashboard does **not** expose a real manual Beds24 reconcile action.
  The new top-right refresh chip is intentionally passive (`router.refresh()` only), because
  `/api/beds24/reconcile` remains secret-protected and is not part of the normal admin permission
  surface.
- Confirmed policy: building access/address info in the new `Building info` view is currently sourced
  from `src/lib/property-map-links.ts`, and in-page edits are browser-session preview only. They are
  deliberately not persisted until a separate storage / permission decision is made.
- Confirmed policy: the reservation inspector's complaint action remains a placeholder toast because a
  real `/admin/complaints` route is not implemented yet; we do not fake a broken deep link.
- Follow-up polish on the same dashboard slice:
  - the month-board date header must remain visible while the inner calendar grid scrolls vertically
  - `Today ops` uses reservation-driven `setting targets` instead of the earlier turnover/cleaning
    placeholder, matching the mobile cleaning smart-list rule for same-day arrivals without same-room
    departures
  - property-selection chips are label-only and centered; room-count badges were removed to reduce
    visual noise in the month-board filter row

Why: the user requested implementation of the reservation-calendar design handoff on the dashboard,
and the existing `/admin/calendar` page was still a much simpler month table + two lists. This ships a
real dashboard console while preserving existing permissions, Beds24 source-of-truth boundaries, and
the current operational-window rules.

Impact:
- `src/app/admin/calendar/page.tsx`
- `src/components/admin/calendar/admin-reservation-console.{tsx,css}`
- `src/lib/i18n.ts` (`admin.calendar.*`, `common.save`)
- `docs/product/15-reservation-calendar.md`
- `docs/product/05-admin-web-ia.md`
- `docs/planning/06-current-status.md`

### Unified permission-denied UX: mobile BottomSheet / admin bottom-center toast

- Added a shared `common.permissionDeniedTitle` / `common.permissionDeniedBody` i18n pair (ko/ja/en)
  and two reusable presentational components: `PermissionDeniedSheet`
  (`src/components/shell/permission-denied-sheet.tsx`, canonical `BottomSheet`, lock icon + title +
  body + close button — same visual language as the daily-report "forbidden" state) for `/mobile/*`,
  and `AdminToast` / `useAdminToast` (`src/components/admin/shared/admin-toast.tsx`, reuses the
  existing `.adm-toast` bottom-center pill CSS) for `/admin/*`.
- Wired into the two spots that previously collapsed an `unauthorized`/`forbidden` server-action error
  into a generic "삭제 실패"/"저장 실패" message: `DeleteConfirmButton`
  (`src/components/requests/delete-confirm-button.tsx`, admin-only) and `OrderActionBar`
  (`src/components/requests/order-action-bar.tsx`, used by both `/mobile/requests/orders/[id]` and
  `/admin/orders/[id]` — added a required `surface: "mobile" | "admin"` prop so it picks the right UI).
- Explicitly out of scope: screens that already had their own permission-denied messaging (daily
  report sheet, admin attendance approval queue, attendance correction form) were left untouched —
  this was a deliberate scoping choice, not an oversight, to avoid rewriting working code.
- The message body says "개발자에게 문의하세요" (contact the developer) per explicit user instruction,
  rather than "관리자에게 문의" (contact an org admin) — a deliberate product-copy choice, not the
  usual admin-escalation phrasing used elsewhere in the app.

Why: server-side permission checks already reject these actions correctly (see
`docs/engineering/05-rls-permissions.md`), but the client was showing an unhelpful generic failure
message that didn't tell the user *why* the action failed. This closes that specific UX gap without
touching the underlying authorization logic.

Impact:
- `src/lib/i18n.ts` (`common.permissionDeniedTitle`, `common.permissionDeniedBody`, `common.close`)
- `src/components/shell/permission-denied-sheet.tsx` (new)
- `src/components/admin/shared/admin-toast.tsx` (new)
- `src/components/requests/delete-confirm-button.tsx`
- `src/components/requests/order-action-bar.tsx`
- `src/app/admin/maintenance/[id]/page.tsx`, `src/app/admin/lost-found/[id]/page.tsx`
- `src/app/mobile/requests/orders/[id]/page.tsx`, `src/app/admin/orders/[id]/page.tsx`
- `docs/engineering/05-rls-permissions.md`

## 2026-07-07

### Annual leave: admin approval review (Phase 2, stage 2) implemented

- Built the admin-dashboard approval queue confirmed as scope on 2026-07-06: new route
  `/admin/attendance/leave`, a new "연차"/"年次"/"Leave" tab added to the attendance console subnav
  (`src/components/admin/attendance/attendance-subnav.tsx`). Server page
  (`src/app/admin/attendance/leave/page.tsx`) gates on `requireAdminPageSession` + `is_leave_approver`;
  non-approvers see a permission-denied card.
- Backend `src/lib/annual-leave-approvals-server.ts`: `getAdminLeaveQueue` (org-wide queue + summary),
  `getAdminLeaveApprovalDetail` (detail + balance-impact projection + same-period overlap),
  `approveLeaveRequestForApprover` (approval stamp: `status → approved`, records
  `approved_by_user_id`/`approved_role`/`approved_at`, only from `requested`),
  `rejectLeaveRequestForApprover` (`status → rejected`, reason optional per the 2026-07-06 policy). All
  four are service-role, org-isolated, and re-verify the caller is an approver. Server actions:
  `src/app/admin/attendance/leave/actions.ts` (approve/reject), `detail-actions.ts` (detail wrapper).
- Frontend `src/components/admin/attendance/leave-queue-client.tsx`: 3 summary cards, status-group
  tabs, leave-type filter, search, table, right-side detail panel — following the same dashboard
  list/detail-panel pattern as `/admin/attendance/queue`. i18n `admin.leaveConsole.*` +
  `attendanceConsole.tabLeave` added ko/ja/en.
- No new migration — reuses the approval/reject columns already added by
  `202607060002_annual_leave_requests.sql` and the `is_leave_approver()` helper.
- Explicitly out of scope this slice: the leave subnav's other 4 sub-tabs (팀 캘린더/직원 잔여·부여/
  승인자 관리/문서) are inactive placeholders only; branch filter, export, and proxy-submit are
  excluded; approval does not yet feed `computeAnnualLeaveSummary`'s `usedDays`/`specialUsedDays` (the
  detail panel's "잔여 영향" is a display-only projection); no applicant notification on approve/
  reject; document output (stage 3) remains not built.

Why: this closes out Phase 2 stage 2 of the annual-leave workflow per the build order confirmed
2026-07-06 (mobile-first, then admin approval). Scoping usage-deduction wiring and notifications out
of this slice keeps the review action itself (the part actually blocking approvers from doing their
job) shippable without waiting on the balance-calculation and notification work.

Impact:
- `src/app/admin/attendance/leave/{page.tsx,actions.ts,detail-actions.ts}` (new)
- `src/lib/annual-leave-approvals-server.ts` (new)
- `src/components/admin/attendance/leave-queue-client.tsx` (new),
  `attendance-subnav.tsx` (new "연차" tab)
- `src/lib/i18n.ts` (`admin.leaveConsole.*`, `attendanceConsole.tabLeave`, ko/ja/en)
- `docs/product/26-annual-leave-workflow.md`, `docs/product/05-admin-web-ia.md`,
  `docs/engineering/04-data-model.md`, `docs/planning/06-current-status.md`

## 2026-07-06 (7)

### Annual leave: swipe-to-delete for draft rows in history

- Added real delete (not just cancel) for draft leave requests, since a draft was never submitted —
  cancel doesn't apply, hard delete does. Reused the existing swipe-to-delete pattern from
  `src/components/notifications/notification-list.tsx` (`SwipeItem`) rather than inventing a new
  interaction: one row open at a time, 76px reveal, 40px commit threshold, spring-back animation,
  delete fires immediately on tapping the revealed button (no extra confirmation modal — the swipe +
  explicit tap is already a two-step deliberate gesture, matching the only existing precedent for this
  interaction in the app). Only draft rows get the swipe wrapper; other statuses are unaffected.
- `deleteLeaveRequestDraft` (`src/lib/annual-leave-requests-server.ts`, new): hard-deletes, self-scoped,
  only while `status = 'draft'`. `deleteLeaveRequestDraftAction`
  (`src/app/mobile/attendance/leave/actions.ts`, new) wraps it.
- Added a `trash` icon to `att-icons.tsx` (matching the hand-ported inline-SVG icon set's stroke
  style) instead of importing `lucide-react`'s `Trash2` as notifications does — keeps this feature's
  icon set visually consistent with itself rather than mixing icon libraries.
- New CSS (`leave.css`): `.lswipe*` classes for the reveal/delete-button layout, `.lrow-outer` to
  re-anchor the existing `.lrow + .lrow` spacing rule now that history rows are wrapped one level
  deeper (needed for the swipeable rows' own stacking context).
- i18n: `draftSwipeDelete` ("삭제"/"Delete"/"削除") added to all three locales; leave dict key count
  confirmed at 136/136/136 (no drift).

Why: draft deletion is a real gap (drafts have no other way to be removed), and swipe-to-delete
already exists once in this codebase — reusing that exact interaction/physics avoids introducing a
second, subtly different gesture pattern for the same underlying action.

Impact:
- `src/lib/annual-leave-requests-server.ts` (`deleteLeaveRequestDraft`)
- `src/app/mobile/attendance/leave/actions.ts` (`deleteLeaveRequestDraftAction`)
- `src/components/attendance/leave-history.tsx` (`SwipeableDraftRow`), `att-icons.tsx` (`trash`),
  `leave.css`

**Addendum:** tapping/clicking anywhere outside a swiped-open draft row now springs it closed too (not
just tapping the row itself or opening a different row) — a document-level `pointerdown` listener
scoped to each row while it's open, torn down once closed. This wasn't present in the
`notification-list.tsx` precedent either; added here as a small UX improvement on top of the reused
pattern.

**Bug fix:** tapping elsewhere to close a swiped-open row showed a brief red flash. Root cause:
`leave.css` was missing the `-webkit-tap-highlight-color: transparent` reset that its sibling files
(`attendance.css`, `transport.css`) already apply globally within their scope — every other button in
this app already had it, `leave.css` just never got it. Added the same `.lv *`/`.lv-sheet *` reset
block to `leave.css`, matching the existing project pattern exactly.

**Bug fix #2:** the tap-highlight fix didn't fully resolve it — a faint red edge was still visible
during/after the close animation. First attempt gave `.lswipe__content` its own `background: var(--card)`
**+ `border-radius: 15px`**, which was itself wrong and didn't fix it: `.lswipe__content` is the
element that slides via `translateX`, so while open or mid-animation its box sits away from the
container's true corners — rounding that same element rounds those off-corner positions too,
creating small red crescents where the `.lswipe__del` layer behind peeks through the curve exactly
at the row's edges during the slide. **Bug fix #3 (actual root cause):** removed `border-radius` from
`.lswipe__content` entirely, keeping only the opaque `background`. Rounding belongs solely on the
fixed outer `.lswipe` (`overflow: hidden` + `border-radius: 15px`), which correctly clips the plain
rectangular content into the right shape regardless of its horizontal offset — no rounded corners
mid-slide, so nothing red can peek through a curve that shouldn't exist there.

**Bug fix #4:** a full rectangular red ring (with a small gap between it and the card, like
`outline-offset`) was still visible around one row after closing via outside-tap — not a corner
bleed like #2/#3, shaped like a focus ring. Not confirmed against live DevTools (not available in
this session), but this file's own established convention is that custom-styled interactive elements
explicitly opt out of the default outline (`.finput` already does this) — `.lrow`, `.lswipe`, and
`.lswipe__delbtn` never got that treatment, so if any of them received `:focus-visible` (native
browser behavior on some platforms after a tap/click completes), the default ring would show. Added
`outline: none` to all three, matching the existing `.finput` pattern, rather than the global
`:focus-visible` ring (which is blue via `--ring`, not red) applying unexpectedly.

## 2026-07-06 (6)

### Annual leave: draft resume/continue-editing closes the mobile experience

- Found and fixed a real gap while confirming mobile was feature-complete: "임시저장" (save draft)
  persisted a real `draft` row, but no screen ever showed it again — `leave-home.tsx`'s recent list
  and `leave-history.tsx` both filtered drafts out, so a saved draft was effectively unrecoverable.
- `leave-history.tsx` no longer filters out drafts (they show under the "전체" filter tab with the
  existing muted "임시저장" chip); tapping a draft row now navigates to
  `/mobile/attendance/leave/new?id=<id>` instead of opening the read-only detail sheet.
- `/mobile/attendance/leave/new` accepts `?id=` to load and prefill an existing draft
  (`getMyLeaveRequest`); only rows still in `draft` status are treated as editable (a requested/
  decided row falls through to a blank new form instead).
- `updateDraftLeaveRequest` (`src/lib/annual-leave-requests-server.ts`, new) overwrites the draft's
  fields in place and, if the user submits (not saves-as-draft-again) this time, transitions it to
  `requested`. `submitLeaveRequestAction` gained an optional `requestId` to route to this instead of
  creating a new row.
- `leave-home.tsx`'s recent-requests teaser still excludes drafts (unchanged) — drafts are a
  history/edit concern, not a "recent activity" one.

Why: this was found by directly re-verifying "is mobile actually done" rather than trusting the
earlier checklist — the draft button existed and appeared to work, but had no way back. Confirmed
worth fixing now, per "finish mobile first."

Impact:
- `src/lib/annual-leave-requests-server.ts` (`updateDraftLeaveRequest`)
- `src/app/mobile/attendance/leave/actions.ts` (`submitLeaveRequestAction` requestId param)
- `src/app/mobile/attendance/leave/new/page.tsx`, `history/page.tsx`
- `src/components/attendance/leave-form.tsx` (draft prefill), `leave-history.tsx` (draft row → edit)

## 2026-07-06 (5)

### Annual leave: mobile team calendar (L5) wired to real approved-only, org-wide data

- Confirmed the mobile leave calendar shows every employee's leave (including the viewer's own), but
  only **approved** requests — pending/rejected/draft/cancelled stay private. This completes the last
  remaining mock piece of the mobile employee-facing annual-leave experience (per the "finish mobile
  first" build order confirmed earlier today).
- Migration `202607060003_annual_leave_approved_visibility.sql` (applied): additive SELECT RLS policy
  `annual_leave_requests_org_approved_select` grants org-wide read of `status = 'approved'` rows on
  top of the existing self-or-approver policy.
- `listApprovedLeaveForMonth` (`src/lib/annual-leave-requests-server.ts`, new) queries approved leave
  overlapping a given Tokyo month. `leave-calendar.tsx` converted from a hardcoded July-2026 mock
  (fake names, no navigation) to a real month grid with `?ym=` navigation and real applicant names
  (already denormalized on `annual_leave_requests.applicant_name`, no join needed).

Why: this was the one piece of mobile-side annual leave still fully mocked; wiring it closes out the
"mobile first" milestone before admin-dashboard work (approval queue, stage 2/3) begins.

Impact:
- `supabase/migrations/202607060003_annual_leave_approved_visibility.sql` (new, applied)
- `src/lib/annual-leave-requests-server.ts` (`listApprovedLeaveForMonth`)
- `src/components/attendance/leave-calendar.tsx`, `src/app/mobile/attendance/leave/calendar/page.tsx`
- `docs/engineering/04-data-model.md`, `05-rls-permissions.md`

## 2026-07-06 (4)

### Annual leave: approval queue is admin-dashboard scope; build order is mobile-first

- Confirmed the approval queue, approve/reject action, and document output (Phase 2 stage 2/3) belong
  on the **admin web dashboard** (`/admin/attendance/leave`, planned to mirror the existing
  correction-review queue at `/admin/attendance/queue`), not mobile — mobile is the employee
  submit/view surface, the PC dashboard is the manager review/approve surface.
- Confirmed rejecting a leave request does NOT require a reason, unlike attendance-correction
  rejection (which does) — noted so the eventual reject UI doesn't copy that requirement by default.
- Confirmed build order: finish the mobile employee-facing annual-leave experience completely first;
  the admin dashboard piece starts only afterward. Not a scope cut — just sequencing.

Why: this keeps the mobile/dashboard surface split consistent with the rest of the product (mobile =
field/employee, dashboard = office/manager), and avoids splitting attention across both surfaces
before either is solid.

Impact: `docs/product/26-annual-leave-workflow.md` (approval-location + reject-reason-optional +
build-order notes)

## 2026-07-06 (3)

### Annual leave: approval-workflow policy locked; Phase 2 stage 1 (request submission) implemented

- Confirmed the remaining open policy from `docs/product/26-annual-leave-workflow.md` against the
  actual paper form photo (休暇届): approver = any member flagged with a new
  `memberships.leave_approver_role` (`department_head` = 대표/CEO, `senior_managing_director` = 전무),
  either one approving completes the request (matches the doc's "either VP or CEO, one approval
  enough" — the paper form's 部署長/専務 stamp boxes map to those two roles, not a 3-step chain).
  Attachments are optional. E-signature is an approval "stamp" (button click, name+timestamp), not a
  drawn signature. Document output will replicate the paper form's exact layout once its own stage
  (3) is built — deferred because there's no PDF-generation library in the project yet; the interim
  plan is a print-optimized HTML view (browser print-to-PDF).
- Implemented **Phase 2, stage 1 only**: request submission + self-cancel. Migration
  `202607060002_annual_leave_requests.sql` adds `annual_leave_requests` (draft/requested/approved/
  rejected/cancelled) and `memberships.leave_approver_role` + `is_leave_approver()` helper (read-only
  RLS, same shape as `attendance_payroll_admin`/`can_manage_attendance_payroll`). Approve/reject
  action, approval queue UI, and document output are explicitly deferred to stage 2/3 — not built.
- `src/lib/annual-leave-requests-server.ts` (new): self-scoped create/cancel/list/get. Wired into
  `leave-form.tsx` (실제 제출/임시저장), `leave-home.tsx` (실제 최근 신청/대기 건수),
  `leave-history.tsx` (실제 목록 + 실제 취소), `leave-done.tsx`/`leave-cancel-done.tsx` (실제 신청
  데이터, no more MOCK constants).
- Converted the leave-request date pickers from a hardcoded July-2026 mock calendar to a real
  month/year-navigating calendar (`leave-date-picker.tsx`, mirroring `hire-date-picker.tsx`) — a
  necessary companion fix, since submitting to the real backend with fake hardcoded July-2026 dates
  would have been actively wrong regardless of when someone actually applies. `leave-form.tsx` now
  tracks real ISO date state instead of July-day integers.

Why: the approver-identity gap was the one thing genuinely blocking the approval backend (attachments/
e-signature were already effectively decided); confirming it against the real paper form let us lock
the whole policy in one pass instead of guessing. Submission is safe to build now because its shape
doesn't depend on the still-unbuilt approval action — a request can sit in `requested` status
indefinitely without needing stage 2 to exist.

Impact:
- `supabase/migrations/202607060002_annual_leave_requests.sql` (new, applied to the linked Supabase project)
- `src/types/database.ts` (annual_leave_requests, memberships.leave_approver_role)
- `src/lib/annual-leave-requests-server.ts` (new)
- `src/app/mobile/attendance/leave/actions.ts` (submit/cancel actions)
- `src/app/mobile/attendance/leave/{page,history/page,done/page,cancel-done/page}.tsx`
- `src/components/attendance/{leave-form,leave-date-picker,leave-home,leave-history,leave-done,leave-cancel-done}.tsx`
- `docs/engineering/04-data-model.md`, `05-rls-permissions.md`, `docs/product/26-annual-leave-workflow.md`

## 2026-07-06 (2)

### Annual leave: Phase 1 backend implemented (hire_date + balance baseline only)

- Scope confirmed as narrow on purpose: only `profiles.hire_date` + a self-entered leave-balance
  baseline are backed by real DB now. The request-submission/approval/e-signature/document workflow
  in `docs/product/26-annual-leave-workflow.md` remains an unimplemented planning draft — its
  approver identity, e-signature style, and document output are still unresolved, so building that
  backend now would risk being thrown away.
- Migration `202607060001_annual_leave_hire_date_baseline.sql`: adds `profiles.hire_date` (same
  pattern as `birth_date`) and a new `annual_leave_baselines` table (one row per user: `base_amount`,
  `bonus_amount`, `baseline_date`). RLS is read-only self-or-admin (`can_manage_attendance_payroll`),
  identical shape to `transport_reimbursement_reports` — all writes go through the service-role
  server action `setAnnualLeaveBaselineAction` (`src/app/mobile/attendance/leave/actions.ts`).
- `src/lib/annual-leave-server.ts` (new): `getAnnualLeaveBaseline` / `setAnnualLeaveBaselineForUser` /
  `getMyAnnualLeaveSummary` — server-only, self-scoped reads/writes, wraps the existing pure
  `computeAnnualLeaveSummary` (unchanged calculation logic, just given a real data source now).
- Removed the temporary `localStorage` bridge from `src/lib/annual-leave.ts`
  (`readLeaveBaseline`/`writeLeaveBaseline`/`LeaveBaselineInput`) now that it's replaced by the real
  backend. `leave-home.tsx` reverted from a client component back to a plain presentational component
  that receives `summary` as a prop from the server page instead of reading browser storage itself;
  `leave-exception.tsx`'s self-entry form now calls the server action instead of writing localStorage.
- `computeAnnualLeaveSummary`/`buildLeaveBuckets` gained an optional `bonusBaselineAmount` parameter
  (separate from `baselineAmount`) so a pre-existing 특별휴가 balance is tracked in the bonus pool,
  not folded into the 유급 휴가 pool — mirrors the `annual_leave_baselines.bonus_amount` column.

Why: the hire-date/balance piece was fully speced and tested (src/lib/annual-leave.ts,
annual-leave.test.ts) and had no more open policy questions, so it was safe to back with real
Supabase tables now. The approval/document workflow still has unresolved open questions (approver
identity, e-signature style, carryover beyond 2 years), so its backend is deliberately deferred rather
than guessed at.

Impact:
- `supabase/migrations/202607060001_annual_leave_hire_date_baseline.sql` (new)
- `src/types/database.ts` (profiles.hire_date, annual_leave_baselines)
- `src/lib/annual-leave-server.ts` (new), `src/lib/annual-leave.ts`
- `src/app/mobile/attendance/leave/actions.ts` (new), `leave/page.tsx`
- `src/components/attendance/leave-home.tsx`, `leave-exception.tsx`
- `docs/engineering/04-data-model.md`, `05-rls-permissions.md`, `docs/product/26-annual-leave-workflow.md`

**Migration applied 2026-07-06** to the linked StayOps Supabase project (`sspdgzkytkpmquqsfaup`) via
the Supabase MCP `apply_migration`. Verified `profiles.hire_date` exists and
`annual_leave_baselines_self_or_admin_select` RLS policy is in place; `get_advisors` showed no new
security issues introduced by this migration.

## 2026-07-06

### Annual leave: confirmed accrual table, 2-year carryover (partial), self-entry interim design

- Confirmed the exact accrual schedule: +6mo=10d, +1y6m=11d, +2y6m=12d, +3y6m=14d, +4y6m=16d,
  +5y6m=18d, +6y6m onward=20d/year (cap), plus a one-time +4-day bonus at the 4-year mark (outside
  the cap). Implemented as pure functions in `src/lib/annual-leave.ts`, covered by
  `src/lib/__tests__/annual-leave.test.ts`.
- Confirmed unused leave lapses 2 years after its grant date. What happens beyond 2 years is still
  unconfirmed pending an internal company check — kept as a single named constant
  (`LEAVE_EXPIRY_YEARS`) so it's a one-line change later.
- Interim decision (backend not started yet): the employee self-enters their hire date and current
  remaining leave balance directly (not admin-mediated), stored in browser `localStorage` only until
  a real `hire_date` column + balance ledger exist in Supabase. `leave-exception.tsx` (missing-hire-date
  screen) now collects this input instead of showing a "request setup" CTA; `leave-home.tsx` reads it
  and renders the auto-calculated balance instead of a hardcoded mock number.
- Half-day (AM/PM) leave requests now restrict the date-range picker to a single selectable day
  (`leave-date-picker.tsx`, `singleDay` prop) instead of allowing a multi-day range.
- Hire-date entry uses a new real single-date calendar bottom sheet (`hire-date-picker.tsx`) instead
  of a native `<input type="date">`. The native control renders the OS/browser's own calendar chrome
  (uncontrolled, unlocalized by this app — it was showing Korean regardless of the selected locale),
  which conflicts with the mandatory ko/ja/en multilingual rule. The new picker follows the same
  bottom-sheet visual pattern as `leave-date-picker.tsx` but does real month/year navigation (not a
  fixed mock month) since a hire date can be many years in the past.
- Fixed a Next.js RSC error introduced while making `leave-home.tsx`/`leave-exception.tsx` client
  components: they were receiving the whole `copy` i18n dictionary (which includes functions like
  `fDays`/`balExpire`) as a prop from a Server Component page, which Next.js disallows. Fixed by
  having them take a `locale: string` prop and call `getDictionary(locale)` internally instead —
  matching the existing pattern already used by `leave-form.tsx`.
- The hire-date calendar bottom sheet (`hire-date-picker.tsx`) gained a year-stepper + 12-month grid
  (tap the month/year label) so users don't have to page month-by-month back to their hire year.
- Confirmed the four leave-request types are NOT four labels on one balance — each has different
  balance/payment behavior: 경조 휴가(`annual`) is a fixed 3 paid days per request, independent of the
  hire-date accrual pool (extra days beyond 3 must come from the employee's own 유급휴가); 유급
  휴가(`paid`) draws from the hire-date accrual pool; 특별휴가(`special`) draws only from the one-time
  4-year +4-day bonus pool, never mixed with the accrual pool; 기타(`other`) is unpaid, no balance
  deduction. `computeAnnualLeaveSummary` now returns `baseRemaining`/`bonusRemaining` as two
  independent numbers (with independent `usedDays`/`specialUsedDays` inputs) instead of one merged
  total; `leave-form.tsx` auto-fills a fixed 3-day range and hides the half-day toggle when 경조 휴가
  is selected, and shows an "unpaid" hint for 기타; `leave-home.tsx` shows the 특별휴가 balance as a
  separate secondary card, not folded into the main progress bar.

Why: automatic, hire-date-based accrual removes manual balance bookkeeping once the real backend
exists, but the exact schedule and carryover policy had to be nailed down first since getting them
wrong would be costly to unwind. The localStorage bridge lets the UI/calculation work be built and
tested now without blocking on the backend.

Impact:
- `src/lib/annual-leave.ts` (new), `src/lib/__tests__/annual-leave.test.ts` (new)
- `src/components/attendance/hire-date-picker.tsx` (new)
- `src/components/attendance/leave-exception.tsx`, `leave-home.tsx`, `leave-date-picker.tsx`,
  `leave-form.tsx`, `leave.css`
- `src/app/mobile/attendance/leave/page.tsx`, `leave/exception/page.tsx`
- `src/lib/i18n.ts` (ko/ja/en)
- `docs/product/26-annual-leave-workflow.md`

## 2026-07-03

### Admin dashboard shared format utilities extracted

- Added `src/components/admin/shared/admin-format.ts`.
- Moved repeated admin Excel workbook download, yen formatting, optional yen formatting, and transport
  status-pill mapping into the shared admin layer.
- Payroll, transport, staff-detail, overview, wages, and receipt-review components now reuse the shared
  utilities where the output is identical. Domain-specific session/payroll status decisions remain local
  to their components.

Why: this removes duplicate utility code without changing labels, class names, layout, or visual output.

Impact:
- `src/components/admin/shared/admin-format.ts`
- `src/components/admin/attendance/*`
- `docs/product/05-admin-web-ia.md`
- `docs/design/00-design-direction.md`
- `docs/planning/06-current-status.md`

### Admin attendance page auth guard centralized

- Added `src/lib/admin-page-auth.ts` with `requireAdminPageSession({ nextPath })`.
- Replaced duplicated auth/onboarding/admin-role guards across `/admin/attendance/*` page components.
- The helper enforces organization context in the same place as auth and role access:
  unauthenticated users go to `/auth/login?next=...`, incomplete or platform/no-org sessions go to
  `/onboarding`, and roles outside admin-web access go to `/mobile`.
- The focused receipt review page keeps its query-bearing `nextPath` through the same helper.

Why: the attendance admin pages had repeated guard blocks, and only some checked organization context.
Centralizing the guard prevents route drift without changing the rendered UI.

Impact:
- `src/lib/admin-page-auth.ts`
- `src/app/admin/attendance/*/page.tsx`
- `docs/product/05-admin-web-ia.md`
- `docs/planning/06-current-status.md`

### Admin dashboard shared primitives extracted

- Moved reusable desktop-console primitives out of the attendance feature folder into
  `src/components/admin/shared`.
- Shared primitives now include `AdminMonthPicker`, `AdminDatePicker`, `AdminTimePicker`,
  `ChipDropdown`, `AdminReasonModal`, and `useAdminPanelA11y`.
- Attendance pages now import these from the shared admin location. Rendering classes and CSS are
  unchanged, so this is a structure/design-system cleanup rather than a visual redesign.
- The dashboard standard remains `admin-console.css` + shared primitives for new and touched admin
  operation screens; older Tailwind-style admin pages are not force-rewritten in this step.

Why: the admin dashboard had started to accumulate reusable controls inside one domain folder. Moving
them to a shared location prevents future dashboard pages from creating duplicate date pickers, reason
modals, filter controls, or panel behavior.

Impact:
- `src/components/admin/shared/*`
- `src/components/admin/attendance/*` imports
- `docs/product/05-admin-web-ia.md`
- `docs/design/00-design-direction.md`
- `AGENTS.md`
- `CLAUDE.md`

### Admin attendance follow-up hardening — state, i18n, and month-context cleanup

- The overview transport card now reads the real missing-receipt count from reimbursement items without
  image rows; the previous placeholder `0` is no longer used.
- Month context is preserved on overview → payroll/transport, staff-day → queue, and wage-panel →
  staff-detail links so badges/body/detail views do not silently drift to another month.
- Bulk queue processing remains parallel and now keeps partial-failure feedback visible until dismissed,
  including the first failed staff/date targets.
- Payroll finalization and reopen both use the shared admin modal; finalization has its own optional-note
  copy, while reopen remains reason-required.
- Admin attendance aria labels and urgency chips are dictionary-backed in ko/ja/en; Japanese `番号` and
  `台帳` labels replace the previous ambiguous strings.

Why: these were reported QA inconsistencies that could make the admin console show stale or misleading
state without changing the visual design contract.

Impact:
- `src/lib/transport-reimbursement.ts`, `src/lib/admin-attendance.ts`
- `src/components/admin/attendance/*`
- `src/app/admin/attendance/wages/page.tsx`
- `src/lib/i18n.ts`
- `docs/product/24-attendance-workflow.md`
- `docs/engineering/11-attendance-payroll-technical-design.md`
- `docs/planning/06-current-status.md`

### 교통비 검토 흐름 완성 — 보완 요청(changes_requested) + 재오픈

- 그동안 비활성 스텁이던 상세 패널의 **"보완 요청"·"재오픈"** 버튼을 실제 동작으로 구현했다.
- **보완 요청**: 새 리포트 상태 **`changes_requested`** 도입(마이그레이션 `202607030001` — status CHECK에
  값 추가). 반려(거절)보다 부드러운 중간 단계로, **직원에게 "고쳐서 다시 제출"** 요청을 보낸다. 직원은
  draft/rejected와 동일하게 이 상태에서 항목을 편집·재제출할 수 있다(모바일 편집 규칙·상태 라벨 추가).
  사유 필수.
- **재오픈**: 이미 승인/반려된 리포트를 되돌린다(→ `submitted`). **승인을 실수로 했거나 승인 후 오류를
  발견한 경우 복구** 가능. 특히 승인된 리포트를 재오픈하면 급여 합산(승인 건만 집계)에서 빠지므로 재검토
  후 다시 승인해야 반영된다. 사유 선택.
- 서버 전이 규칙(`setTransportReportReview`): submitted/reviewing/changes_requested → approved | rejected
  | changes_requested / approved·rejected → reopen(→submitted). 반려·보완요청은 사유 필수.
- UI: 급여 검토와 동일한 중앙 정렬 `AdminReasonModal` 재사용. 상태 칩(관리자 리스트/영수증 뷰/모바일)에
  `changes_requested` 라벨 추가.

Why: 실무적으로 (1) "승인하면 되돌릴 수 없음"이 돈이 걸린 흐름에서 위험했고(재오픈으로 해결), (2) 반려/승인
2택뿐이라 "영수증 한 장만 보완" 같은 흔한 케이스가 애매했다(보완 요청으로 해결). 급여 검토의 마감→재오픈과
같은 개념을 교통비에도 맞췄다.

Impact:
- `supabase/migrations/202607030001_transport_changes_requested_status.sql` (신규, 적용 완료)
- `src/lib/transport-reimbursement.ts`(타입), `src/app/mobile/attendance/transport/actions.ts`(편집 허용),
  `src/components/attendance/transport-statement.tsx`(상태 라벨·편집)
- `src/app/admin/attendance/actions.ts`(전이 규칙 확장), `src/components/admin/attendance/attendance-transport-client.tsx`(버튼·모달),
  `src/components/admin/attendance/transport-receipt-view.tsx`(상태 칩)
- i18n(ko/ja/en): 관리자·모바일 상태 라벨 + 재오픈/보완요청 액션 문구
- `docs/engineering/04-data-model.md`, `docs/planning/06-current-status.md`

### Annual Leave Workflow — salary staff only, 6-month eligibility, paper-form parity

- Annual leave is being introduced as a separate attendance-adjacent workflow for salary-based regular
  employees only. Hourly staff are excluded.
- Eligibility begins exactly 6 months after hire date. The first grant is 10 days.
- After that, leave accrues by tenure year, capped at 20 days for the base accrual.
- A 4-year bonus leave grant adds 4 days separately from the base accrual cap.
- The employee entry flow should start from signup with employee code and hire date collection, then
  fall back to a first-use hire-date prompt for legacy accounts, and allow admin correction from the
  employee detail screen.
- The request form should be reachable from both the mobile surface and the admin dashboard surface.
- The selected leave type must carry into the generated document with automatic color fill on the same
  option block used by the paper form.
- Morning and afternoon half-day leave are part of the same workflow and must use the same paper-form
  output with the selected block highlighted.
- Either the VP or the CEO can approve a request; one approval is sufficient.
- The approved document should be generated automatically and keep the company paper form as the visual
  reference.

Why: The paper approval process is slow in the field and only two people approve it, so the workflow
should stay close to the existing form while moving the intake and approval into the system.

Impact:
- `docs/product/26-annual-leave-workflow.md`
- future design file for annual leave
- later engineering and data-model docs once the flow is frozen

### 급여 계산 정합성 하드닝 — 마감 스냅샷 우선 + 개인별 문서 합계 보정

- 시급 계산의 순수 헬퍼를 `src/lib/attendance-pay-calculation.ts`로 분리하고 회귀 테스트를 추가했다.
  테스트 범위는 시급 적용 시작일 경계, 겹치는 이력에서 최신 `effective_from` 우선, 닫힌 휴게 차감,
  일별 exact gross, 월 10엔 올림, 개인별 export 일별 금액 보정이다.
- 마감된 사용자-월은 관리자 급여 목록, 직원 월별 상세, 월별 Excel/PDF export에서
  `attendance_month_snapshots.gross_amount`와 `total_paid_minutes`를 우선 사용한다. 마감 이후 시급 이력이
  변경되어도 이미 잠긴 지급 금액이 바뀌어 보이거나 내보내지지 않도록 한다.
- 개인별 Excel/PDF는 일별 금액을 정수 엔으로 표시하되, 공식 지급 총액은 월 단위 10엔 올림 규칙을 따른다.
  따라서 일별 표시 합계가 공식 월 총액과 1엔이라도 어긋나지 않도록 마지막 유급일에 반올림 보정액을
  반영한다.

Why: 급여 지급 자료는 1엔 단위 오류도 허용할 수 없다. 특히 월 중 시급 인상, 마감 이후 이력 변경,
일별 반올림 합계와 월 단위 공식 합계의 차이는 실지급 오류로 이어질 수 있으므로 계산 정책과 export
표시를 하나의 기준으로 고정했다.

Impact:
- `src/lib/attendance-pay-calculation.ts`
- `src/lib/attendance-pay.ts`
- `src/lib/admin-attendance.ts`
- `src/app/admin/attendance/actions.ts`
- `src/lib/attendance-user-payroll-export.ts`
- `src/lib/__tests__/attendance-pay.test.ts`
- `docs/engineering/11-attendance-payroll-technical-design.md`
- `docs/product/24-attendance-workflow.md`

### 교통비 정산 월별 내보내기 (Excel + PDF, 영수증 썸네일 포함)

- `/admin/attendance/transport`의 "이번 달 내보내기"(이전에는 비활성 스텁)를 급여 내보내기와 같은
  포맷 조합(엑셀 + PDF)으로 구현했다.
- 내보내기 단위는 **직원별 요약이 아니라 정산 항목(item) 단위**다 — 이번 달에 항목이 1건이라도
  입력된 모든 직원을 상태(작성중/제출됨/검토중/승인됨/반려)와 무관하게 포함하고, 행마다 상태 라벨을
  표시한다.
- 영수증 사진은 **엑셀에는 삽입하지 않고**(썸네일이 너무 작아 무의미 — 사용자 요청 2026-07-03로
  영수증 썸네일 열·이미지를 완전히 제거, "원본보기" 하이퍼링크 열만 남기고 전 셀 중앙정렬), **PDF에는
  항목당 첫 번째 사진만** 작은 썸네일로 삽입한다(2장 이상은 "+N" 표기). 전체 사진은 딥링크로 여는
  앱 내 상세 패널에서 확인한다.
- 서버 이미지 리사이즈 라이브러리는 도입하지 않는다 — 업로드 시 클라이언트 압축 정책이 이미 적용돼
  있어 원본 자체가 과도하게 크지 않다는 전제. jpg/jpeg/png/gif 외 포맷은 썸네일 없이 건수만 표시한다.
- 엑셀·PDF 모두 **급여 내보내기와 완전히 동일한 그린 회계 장부 양식**을 따른다 — 타이틀바(#b6d7a8),
  헤더/줄무늬/합계 행 색(#d9ead3/#e2f0d9), 1px 검정 테두리, Meiryo 우선 폰트, 엑셀은 급여와 동일하게
  최소 50행까지 빈 줄로 채우는 사전인쇄 장부 형태(`Math.max(50, 항목수)`)까지 맞췄다. (최초 구현 시
  PDF를 이전 대화 요약 속 오래된 네이비/카드형 스타일로 잘못 만들었던 실수를 사용자가 지적해 수정함 —
  급여 리포트가 그 사이 그린 장부형으로 이미 통일되어 있었는데 파일을 다시 읽지 않고 기억에 의존한 것이
  원인. 앞으로 "두 내보내기가 완전히 같아야 한다" 요청 시 반드시 현재 파일을 직접 diff해서 확인한다.)
- **영수증 처리 방식 최종 결정(2026-07-03): 파일에는 영수증을 넣지 않고, 웹 대시보드 전용 검토
  페이지에서 본다.** 중간에 (a) 파일에 썸네일 삽입 → (b) 항목별 딥링크(`receipt/{itemId}`)로 원본 뷰 열기
  단계를 거쳤으나, 40×40 썸네일은 판독 불가하고 항목별 링크는 20일이면 20번 클릭·20탭이 되어 불편하다는
  지적에 따라, **엑셀·PDF에서 영수증 썸네일·링크·이미지 다운로드를 전부 제거**하고 순수 장부로 확정했다
  (열: 번호/직원/날짜/사용내역/건물/상태/금액, 전 셀 중앙정렬).
- **영수증 검토는 데스크톱 마스터-디테일 웹페이지로 분리한다.** 대시보드(데스크톱)이므로 모바일식 스와이프
  갤러리가 아니라, 좌: 그 직원 한 달 항목 목록(날짜·금액·건물) / 우: 선택 영수증 크게(클릭 확대, 원본
  열기, 여러 장 이전/다음, 키보드 ↑/↓ 항목·←/→ 사진) 구조다. **20번 클릭 문제와 "이 행이 어느 영수증인가"
  대조 문제를 동시에 해결**한다.
  - 라우트 `src/app/admin/attendance/transport/receipt/page.tsx`(`?ym=&user=`, 직원-월 단위).
    진입은 **기존 교통비 패널에 "영수증 원본 검토" 버튼만 추가**(패널의 나머지 UI/UX는 그대로) — 고정 창
    이름(`stayops_receipt`)으로 열어 반복 클릭 시 한 탭 재사용.
  - 데이터 `getAdminTransportReceiptsForUser(session, ym, userId, localeTag)`(admin-attendance.ts)는
    **권한(`isAttendancePayrollAdmin`) + 조직 격리**(`getTransportReport`가 `(org,user,month)` 스코프)를
    서버에서 강제. 사진은 요청 시점 10분 서명 URL. 미인증 → `/auth/login?next=...`.
  - 장기 유효 서명 URL을 파일에 박는 방식은 끝까지 채택하지 않았다 — 로그인 없이 접근 가능한 링크가 문서
    유출 시 영수증까지 노출시키는 보안 리스크 때문. 웹 뷰는 로그인·권한·조직 격리가 항상 걸린다.

Why: 세무·회계 자료는 항목별 증빙(날짜·금액·건물)이 핵심이고, 검토는 "한 직원의 한 달치를 한 화면에서
훑고 대조"하는 데스크톱 워크플로가 최선이다. 파일은 가볍고 깔끔한 장부로, 원본 확인은 권한이 걸린 웹으로
분리하는 것이 용량·보안·사용성 모두에서 유리하다고 판단했다. 서류 양식(엑셀·PDF)은 급여 내보내기와 동일한
그린 장부 템플릿을 그대로 재사용한다.

Impact:
- `src/lib/attendance-transport-workbook.ts` / `attendance-transport-report.ts` (영수증·링크 제거, 순수 장부)
- `src/lib/attendance-payroll-workbook.ts` (팔레트 상수 export)
- `src/app/admin/attendance/actions.ts` (export에서 이미지 다운로드/딥링크/`getAppOrigin` 제거)
- `src/app/admin/attendance/transport/receipt/page.tsx` (직원-월 마스터-디테일 뷰, 구 `[itemId]` 라우트 대체),
  `src/components/admin/attendance/transport-receipt-view.tsx`,
  `src/lib/admin-attendance.ts`(`getAdminTransportReceiptsForUser`)
- `src/components/admin/attendance/attendance-transport-client.tsx` ("영수증 원본 검토" 진입 버튼 추가)
- `docs/engineering/11-attendance-payroll-technical-design.md`, `docs/planning/06-current-status.md`

### 관리자 콘솔 설치형 PWA 분리

- 관리자 대시보드(`/admin/*`)를 모바일 앱과 **완전히 분리된 독립 설치형 PWA**로 제공한다.
- 모바일 매니페스트(`public/manifest.webmanifest`, `id "/"`, `scope "/"`, `start_url "/mobile"`,
  세로 고정)는 그대로 두고, 관리자 전용 매니페스트(`public/manifest-admin.webmanifest`,
  `id "/admin"`, `scope "/admin"`, `start_url "/admin"`, orientation 미지정=any)를 신설했다.
- `src/app/admin/layout.tsx`에서 `metadata.manifest`를 관리자 매니페스트로 오버라이드해
  `/admin/*` 페이지에서 설치하면 "StayOps Admin"(id `/admin`)이 모바일 "StayOps"(id `/`)와
  별개의 앱으로 등록된다. 서비스워커(`public/sw.js`, scope `/`)는 두 표면이 공유한다.
- 아이콘/스플래시는 **1차로 기존 모바일 아이콘 세트(`/icons/*`)를 재사용**한다. 두 앱을 나란히
  설치했을 때 시각적 구분이 필요해지면 관리자 전용 아이콘을 후속으로 제작한다.
- 데스크톱 exe(Electron/Tauri) 패키징은 현재 도입하지 않는다. 로컬 파일시스템 심층 통합이나
  브라우저 비의존 상주가 실제로 필요해지는 시점에 재검토한다. 현 구조는 그 전환의 선행 작업이 된다.

Why: 오피스/관리 인력의 일상 진입 마찰을 줄이고 "전용 프로그램" 사용감을 주되, 앱스토어로 향하는
모바일과 표면을 혼동시키지 않기 위해 매니페스트/설치 아이덴티티를 분리한다. exe 패키징은 현재 요구되는
기능(파일 다운로드·알림·오프라인 셸)을 PWA가 이미 커버하므로 배포·서명 인프라 비용 대비 이점이 낮다.

주의: macOS Safari는 데스크톱 PWA 설치를 지원하지 않으므로 관리자는 Chrome/Edge로 설치해야 한다.
`scope "/admin"`이므로 `/auth`·`/onboarding` 등 스코프 밖 이동은 브라우저 탭으로 빠질 수 있다(관리자
셸의 일상 흐름은 `/admin` 내부에서 완결되어 현재 문제 없음).

Impact:
- `public/manifest-admin.webmanifest` (신규)
- `src/app/admin/layout.tsx` (신규)
- `public/manifest.webmanifest` (변경 없음, 분리 근거 명시)
- `docs/product/05-admin-web-ia.md`

## 2026-07-02

### Admin Attendance Roster 날짜 선택 통합

- 관리자 근태의 출근자 명단은 `/admin/attendance/roster` 독립 탭으로 제공한다.
- 데이터 소스는 모바일 `/mobile/attendance/roster`와 같은 `getAttendanceRoster`로 고정한다.
  모바일 출퇴근/휴게 기록과 관리자 명단 사이에 별도 동기화 계층을 두지 않는다.
- 월 단위 화면(개요, 검토 큐, 급여, 교통비, 시급, 직원 상세)은 상단 공통 월 선택기를 유지한다.
- 출근자 명단은 운영일 단위 화면이므로 근태 subnav 우측의 상단 일자 선택기와 캘린더 팝오버 하나로
  날짜를 조회한다. 명단 본문, 카드, 섹션 안에 별도 날짜 선택기를 반복하지 않는다.
- 오늘 날짜 조회는 클라이언트에서 짧은 주기로 재조회해 실시간 감지에 가깝게 운영 현황을 보여준다.

Why: 출근자 명단은 급여/교통비처럼 월 마감 대상이 아니라 현재 현장 운영 감시용 일 단위 화면이다.
날짜 선택 UI를 여러 곳에 두면 사용자가 같은 개념을 화면마다 다르게 조작하게 되므로, 일 단위 명단은
하나의 상단 캘린더로 묶고 월 단위 근태 탭은 공통 월 선택기로 분리한다.

Impact:
- `src/app/admin/attendance/roster`
- `src/components/admin/attendance/attendance-roster-client.tsx`
- `src/components/admin/attendance/attendance-subnav.tsx`
- `docs/product/05-admin-web-ia.md`
- `docs/product/24-attendance-workflow.md`

### Admin Dashboard Shared UI Contract — 공통 패턴 통일 필수

- 관리자 대시보드에서 반복되는 공통 UI는 페이지별 임의 변형이 아니라 **공유 계약**으로 취급한다.
- 특히 아래는 강한 공통 패턴으로 관리한다:
  - calendar chrome
  - date picker / month-week navigation
  - filter bar / search row
  - summary cards
  - tables
  - status badges
  - action bars
  - empty / loading / error states
  - right detail panels
  - pagination
- 출근자 명단, 예약, 근태, 급여, 교통비, 캘린더 등에서 같은 개념의 날짜 선택이나 필터 조작이
  서로 다른 구조/간격/동작으로 흩어지면 안 된다.
- 새로운 대시보드 페이지를 만들 때는 먼저 기존 공통 패턴을 재사용/확장하는지 확인하고,
  같은 역할의 UI를 새로 따로 디자인하지 않는다.
- 대시보드 공통 컴포넌트와 패턴은 **ko / ja / en 다국어 길이 차이**까지 포함해서 검토한다.

Why: 사용자는 대시보드 전반의 통일감을 매우 중요하게 보고 있다. 기능별로 따로 디자인하면
캘린더/날짜선택/필터/테이블 조작이 페이지마다 달라져 운영 콘솔 품질이 떨어지고, 이후 구현과
유지보수 비용도 커진다.

Impact:
- `AGENTS.md` / `CLAUDE.md` / `docs/planning/05-ai-collaboration-rules.md` 에 관리자 대시보드
  공통 UI 계약 규칙 추가
- 이후 관리자 대시보드 디자인/구현 작업은 공통 패턴 재사용 여부를 먼저 확인

## 2026-06-29

### Admin Dashboard — 리빌드 방향 확정

- 관리자 대시보드는 기존 `/admin` 구현을 부분 보수하는 수준이 아니라, **독립된 운영 콘솔 표면으로 재정리**한다.
- 모바일 앱과 대시보드는 **연결되지만 완전히 분리된 표면**이다. 모바일/태블릿은 `/mobile`,
  데스크톱/노트북은 `/admin` 을 사용한다.
- 대시보드는 단순 조회판이 아니다. **실행 + 관리 + 수정 + 검토 + 승인/반려 + export** 까지
  포함하는 완전한 관리자 표면으로 간다.
- 원칙적으로 **모바일에서 가능한 주요 기능은 대시보드에서도 가능**해야 한다. 다만 물리 장치
  제약이 있는 기능은 예외로 둘 수 있다.
- 확정된 예외: **QR 스캔 출퇴근 실행은 모바일 전용**. 대신 출근 사이트/QR 생성/재발급/보관/관리,
  근태 수동 생성/수정/무효화, 정정 검토, 급여/교통비 검토 및 export 는 대시보드에서 처리한다.
- `part_time_staff` 를 제외한 모든 역할은 대시보드 접근 가능 방향으로 간다. 단, 세부 기능 권한은
  지금 일괄 고정하지 않고 **모듈 구현 시점마다** 확정한다.
- 대시보드 디자인 구조는 **테이블 + 카드 + 우측 상세 패널** 이 섞인 운영 콘솔형으로 가되,
  **색상/브랜드 무드/기본 감성은 모바일과 통일**한다.
- 대시보드 안에 **실제 모바일 표면을 보여주는 핸드폰 프레임 뷰**를 둔다. 같은 계정으로 열리며,
  우측 패널과 전체 화면 오버레이 두 형태를 모두 지원한다.

Why: 사용자는 모바일 앱과 관리자 대시보드를 서로 연결되어 있지만 다른 제품 표면으로 운영하길 원한다.
대시보드는 백오피스 조회판이 아니라 실제 운영과 수정, 검토가 가능한 강한 관리 표면이어야 한다.

Impact:
- `docs/product/05-admin-web-ia.md` 를 관리자 대시보드 총괄 기준 문서로 재작성
- 기존 "admin web deferred" 전제는 대시보드 관련 기능 문서에서 순차적으로 제거/갱신
- 앞으로 기능 단위 작업은 `문서 -> 디자인 -> DB/백엔드 -> 프론트 구현` 순서로 진행

### Admin Dashboard Workflow — 짧은 활성 보드 방식 확정

- 관리자 대시보드 작업은 별도 활성 워크플로우 문서에서만 관리한다.
- 단계는 `Backlog -> Ready -> Design -> Build -> Verify -> Done` 6개만 사용한다.
- 완료된 항목은 활성 워크플로우에 오래 남겨두지 않고 제거한다.
- 완료 이력은 `docs/planning/06-current-status.md` 에 기록한다.
- 중요 결정은 계속 `docs/planning/01-decision-log.md` 에 남긴다.
- 한 번에 `Build` 로 들어가는 대시보드 대표 기능은 1개만 유지한다.

Why: 오래 걸리는 복잡한 워크플로우는 실제 진행 속도를 떨어뜨리고, 완료된 항목이 활성 보드에
쌓이면 지금 무엇이 진행 중인지 읽기 어려워진다.

Impact:
- `docs/planning/16-admin-dashboard-workflow.md` 신설
- dashboard active work / done record / decision record 역할 분리

### Admin Dashboard Design Kickoff — 로그인과 홈을 첫 화면으로 확정

- 관리자 대시보드 디자인 작업은 **로그인 화면**과 **홈 화면**부터 시작한다.
- 로그인 화면은 데스크톱 대시보드의 첫 진입 규칙, 브랜드 톤, 상태 처리 프레임을 고정한다.
- 홈 화면은 KPI/작업 허브/경고/운영 큐가 결합된 운영 콘솔 구조를 고정한다.
- 이후 기능 디자인은 이 두 화면의 헤더, 정보 밀도, 패널 진입 패턴을 기준으로 확장한다.

Why: 로그인과 홈이 먼저 고정되어야 이후 기능 화면의 밀도, 정렬 방식, 우선 정보, 전역 요소
(검색/조직 전환/알림/모바일 보기)의 위치가 흔들리지 않는다.

Impact:
- `docs/product/05-admin-web-ia.md` 에 로그인 화면 / 홈 화면 요구사항 추가
- `docs/planning/16-admin-dashboard-workflow.md` 의 `Design` 대상에 로그인 / 홈 화면 등록

### Complaints — 백엔드 권한·삭제 정책 확정

- 컴플레인 작성 권한 = developer_super_admin·owner·office_admin·cs_staff. 상태변경·삭제 권한은
  작성자 본인 또는 owner·office_admin·developer_super_admin. 댓글 작성은 part_time_staff 제외 전원.
- 컴플레인 본체는 hard-delete (MVP 정책), 댓글은 `deleted_at` soft-delete (공지/게시판 댓글 규약과 일치).
- `customer_complaints`/`complaint_comments` 가 생성 DB 타입에 없어 server-only 헬퍼에서 untyped
  Supabase 클라이언트 뷰로 접근. 타입 재생성 시 정리.

## 2026-06-25

### Announcements — redesign direction reset to notice-only flow

- Announcements are re-confirmed as a **simple official notice channel**, not a discussion surface.
- The feature should focus on **notice delivery only**. Free conversation, questions, and feedback belong
  in other modules (board / suggestions), not in announcements.
- **Comments are no longer part of the target product direction.** Existing comment support in the
  current implementation becomes legacy / cleanup scope for the later announcement refactor.
- Important announcements should open as a **mobile bottom sheet popup**, following the shared
  `BottomSheet` contract, rather than as a separate feature-specific modal pattern.
- Announcement images must support **mobile pinch-to-zoom** (two-finger zoom in/out and pan). The
  recommended structure is: bottom-sheet notice -> tap image -> dedicated zoomable image viewer.

Why: the user explicitly wants announcements to stay simple and announcement-centered. Mixing them with
discussion behavior weakens the channel and overlaps the board feature.

### Attendance / Payroll — transportation reimbursement planning direction confirmed

- Transportation reimbursement is planned as an **attendance/payroll-adjacent reimbursement module**, not as a generic request form.
- Scope is **all users** (staff and part-time staff alike). There is **no role-based evidence exception**:
  every reimbursable transport entry requires **at least one receipt/screenshot photo**.
- Storage principle follows the app-wide rule: **raw records are per-user**, while privileged admins can
  view both **per-user detail** and **organization-level monthly aggregates**.
- Submission model is a **per-user monthly ledger** (`one report per user per month`) with many line
  items, not one one-off form per receipt. Users may add items **daily or later in bulk**.
- UI direction: **list ledger**, not cards. The month screen must show **all entries at once** and a
  clear **monthly total amount**.
- Entry modes: both **linked** (derive context from attendance / cleaning history) and **manual**
  (user picks date and enters the item later) are required.
- `linked` does **not** mean "must be entered on the same day." It means the selected month's existing
  attendance/cleaning records are read later to generate candidate rows automatically.
- Context: building / room information should reuse the existing app context-linking patterns where
  possible, but those are **review-assistance context only**. The actual proof for reimbursement remains
  the attached receipt/screenshot images.
- Payroll principle: transportation reimbursement is **related to payroll operations** but must remain
  **separate from hourly gross wage calculation**. Dashboard and export should show `wages` and
  `transport reimbursement` as separate totals.
- Export target is a **clean Excel workbook** fit for office review: summary + detailed monthly sheets.

Why: the real workflow is monthly office submission with many evidence images, later review, and later
dashboard aggregation. A generic "request with up to 5 images" model does not fit this operating reality.

### 게시판 @멘션 기능 — 기획 확정

- 디자인: 옵션 E (바텀시트 + 검색, canonical `BottomSheet` 컴포넌트, scrim `z-[80]`)
- 다중 멘션 + @ALL 전체 멘션 지원 (@ALL은 최상단 고정행, 로케일별 라벨)
- 저장: `board_comments.mentioned_user_ids UUID[] NOT NULL DEFAULT '{}'` + `mention_all BOOLEAN NOT NULL DEFAULT false`, GIN 인덱스; 별도 테이블 미사용
- 알림: `mention_all=true`이면 `board_mention_all`만 발송 (개별 `board_comment_mentioned` 생략 — 중복 방지), 본인 제외
- 검색: 빈 쿼리 시 가나다순 상위 20명 (추후 최근 활동 기반 전환 검토), prefix 매칭, 디바운스 200ms
- 보안: `mentioned_user_ids` 각 UUID의 같은 org 활성 멤버 여부는 서버 액션 레벨 검증 (RLS 미적용)
- 댓글 백엔드(`addBoardComment`)와 한 사이클에 묶어 구현

### Bug Report / Problem Report — 1차 구현 확정 (2026-06-25)

- 라우트 `/mobile/bugs` (디자인 결정에 맞춰 `/mobile/bug-reports` 권장 변경)
- 리뷰어: `owner`, `office_admin` (1차 확정); `cs_staff`는 open question deferred 유지
- admin web 페이지 (`/admin/bug-reports`) 1차 deferred — 리뷰어는 모바일에서 통합 처리
- 수정 페이지 (`/mobile/bugs/[id]/edit`) 1차 deferred — 작성자는 `status='submitted'`일 때만 삭제 가능, 수정 버튼 1차 숨김
- 알림 타입: `bug_report_activity`; `created` → 리뷰어 전원, `status_changed` → 작성자 (actor 제외)
- 스토리지: `request-images` 버킷 재사용, path `{org_id}/bug-reports/{report_id}/{file}`

### Bug Report / Problem Report — 기획 방향 확정

Decision: 버그신고 기능은 **StayOps 앱 자체의 문제/버그 신고** 용도로 정의한다. 현장 운영 문제나 건물/객실 이슈를 다루는 요청 기능이 아니다.

확정 사항:
- **성격**: StayOps 사용 중 발견한 앱/시스템 문제 신고
- **대상 예시**: 화면 오작동, 버튼 무반응, 잘못된 데이터 표시, 권한 오류, 알림 오류, 심한 성능 문제
- **비대상**: 건물/객실 문제, 청소 품질 이슈, 비품 요청, 일반 건의/의견
- **1차 신고 폼**: `제목` + `설명` + `사진 첨부(선택)`만 받는 최소형
- **제외**: 댓글, 카테고리, 심각도, 재현절차, 기대결과/실제결과 입력
- **분리 기준**:
  - `Maintenance` = 현실 시설/현장 문제
  - `Staff Suggestions` = 사람 대상 피드백/의견
  - `Bug Report` = StayOps 제품 문제
- **디자인 작업**: 사용자가 직접 진행 후 핸드오프

Why: 사용자가 명확히 "앱에 대한 문제나 버그를 신고하는 곳"이라고 범위를 확정했다. 이 구분이 없으면 Maintenance/제안함과 기능 목적이 섞인다. 또한 1차는 최대한 심플해야 하므로 신고 입력 항목을 최소화한다.

Impact:
- 신규 기획 문서 `docs/product/25-bug-report-workflow.md` 는 앱 버그 신고 기준으로 유지
- 신규 기술 문서 `docs/engineering/13-bug-report-technical-design.md` 는 같은 기준으로 설계
- UI/UX 시안은 본 프로젝트 문서에서 구조만 정의하고, 실제 디자인은 사용자 핸드오프를 기다림

### Board (자유 게시판) — 기능 기획 확정

Decision: 기존 "Internal Board" 스켈레톤(product `20`)을 폐기하고 자유 게시판으로 전면 재기획.

확정 사항:
- **성격**: 전 직원(아르바이트 포함)이 글을 쓰는 수평적 자유 게시판. 공지사항(Announcements, 관리자 전용)과 완전히 분리.
- **작성 권한**: 모든 조직 멤버 (part_time_staff 포함).
- **기능 범위**: 글 작성(제목 선택, 본문 필수, 이미지 최대 5장, 자유 태그), 이모지 반응(👍❤️😂😮😢 — 토글, 이모지별 1회), 댓글(이미지 최대 3장, 소프트 삭제), 관리자 고정(pin), 읽음 추적.
- **태그**: 작성자가 자유 입력(해시태그식). 별도 카테고리 관리 테이블 없음.
- **수정/삭제**: 작성자 본인 + office_admin/owner.
- **UI/UX 디자인**: 사용자가 직접 진행 후 핸드오프.

Why: 기존 스켈레톤은 방향이 불명확한 상태였으나, 공지사항과의 역할 분리 + 전 직원 소통 공간에 대한 명확한 요구가 확인되어 신규 기획으로 대체.

Impact:
- DB 테이블 4개 신규 설계: `board_posts`, `board_post_reads`, `board_comments`, `board_reactions`.
- 알림 타입 추가: `board_post_commented`, `board_comment_replied`.
- 네비게이션: 사이드 메뉴 추가, 하단 탭 커스터마이징 목록 포함.
- 전체 기획 문서: `docs/product/23-board-workflow.md`.

### Board (자유 게시판) — 기능 출시 (Page 1–3 구현 완료)

2026-06-25: Board feature shipped — Composer(글쓰기) + Feed(피드, 커서 페이지네이션·태그 필터·안읽음 뱃지) + Detail(상세·반응·댓글·고정·삭제·읽음·공유) 구현 완료. 마이그레이션 `202606250001_board.sql`(테이블 4 + RLS + `board-attachments` 버킷) · `202606250002_board_notification_type.sql`(`board_activity` 알림) 적용 완료. 임시 `board-i18n.ts` 폐기 후 `i18n.ts`로 통합. 댓글 정렬 등록순·피드 커서 페이지네이션 확정, 댓글 본문 필수(이미지 전용 불가, `board_comments.content` CHECK). 글 수정 폼은 Page 4로 분리(서버 액션 `updateBoardPost`는 구현). 계획된 `board_comment_replied` 알림은 미구현(후속). 상세: `docs/product/23-board-workflow.md`.

## 2026-06-24

### Notifications — first bell-alert scope is eight action-focused event groups

Decision: the first real in-app bell-notification scope is limited to eight operational event groups:

- important announcement published
- task shared with me
- task comment / update
- task due today
- task overdue
- order processed / delivery date updated
- attendance correction approved / rejected
- attendance abnormal session / 18:30 open-session reminder

Why: the notification center should surface events that require user action or immediate awareness,
not a noisy activity feed. This keeps the first rollout useful for field staff and admins without
teaching users to ignore the bell.

Impact:
- `/mobile/notifications` is wired to the live `notifications` table instead of the old mock screen.
- `announcement_activity` is added for important announcement publish alerts only.
- `attendance_activity` expands to include worker-facing correction approval / rejection results.
- Lower-value or high-frequency events (normal announcement publish, every attendance success,
  cleaning timer chatter, etc.) remain deferred.

## 2026-06-23

### Routing — separate mobile app and admin dashboard surfaces

Decision: the mobile app (`/mobile`) and admin dashboard (`/admin`) are treated as separate product
surfaces, not responsive variants of the same screen. Mobile/tablet requests must not render admin
dashboard pages. When a mobile request reaches `/admin*` directly (including in-app browsers such as
KakaoTalk) or carries `next=/admin*` through auth/onboarding/OAuth, the destination is normalized to
`/mobile` before the admin page renders.

Why: field app access from shared links, KakaoTalk, or OAuth callbacks could preserve `/admin` as the
destination and display the desktop dashboard in a narrow mobile viewport. That breaks the product
model: the app is for field execution, while the dashboard is for desktop oversight.

Impact:
- Middleware redirects mobile `/admin*` requests to `/mobile`.
- Auth login, Google callback, password reset, and onboarding completion normalize mobile
  `next=/admin*` to `/mobile`.
- Mobile app routes that cannot resolve an organization context redirect to
  `/mobile/unavailable`, not `/admin`, so mobile exceptions never escape into the dashboard
  surface or create `/mobile` <-> `/admin` loops.
- The route boundary is based on user agent plus `Sec-CH-UA-Mobile` where available.

### Auth QA — remove local test-login shortcut

Decision: the local dev seed-login shortcut has been removed from the product and development login
flow. `/auth/login` now exposes only real Google and email/password authentication, and
`/api/dev/seed-login`, `src/lib/dev-auth.ts`, and the unused `DevEntry` component have been deleted.

Why: internal rollout testing now uses real user accounts and invite-code onboarding. Keeping a
one-click test login on the public login surface created confusion and could hide real-auth defects.

Impact:
- The bottom "테스트 로그인 (Stay Ops E2E Admin)" block no longer renders.
- Seed test accounts are no longer auto-created or signed in by an app route.
- Local maintenance-only dev endpoints keep a separate `ENABLE_LOCAL_DEV_TOOLS` gate; that gate is
  not an authentication shortcut.

## 2026-06-18

### Onboarding — wire to backend with minimal-wiring scope (keep current page)

Decision: When connecting the finished auth/onboarding design to the real backend, the onboarding step is wired **in place** on the existing `/onboarding` page rather than rebuilt into the new mobile design previews. The profile form gains the required `birthDate` field, and the invite step gets a real **verify → preview → confirm** flow.

Why: The new mobile design only contains onboarding *preview/intro* screens (`view=onboarding`, `view=invite`) inside `/auth/login`; the actual profile-entry form was never designed. Rebuilding `/onboarding` into the new language would require designing an undelivered screen and is out of scope. Minimal wiring unblocks the flow now (onboarding was broken: `completeProfile` required `birth_date`, which the form never collected, so users looped on `needs_profile`).

Impact:
- `birthDate` (`<input type="date">`) added to the `needs_profile` form.
- New read-only `previewInviteCode` server action resolves target org name + user-facing role category (`roleToInviteCategory`, never raw DB slug) so org + role are shown before final join — honoring the documented "validate first, then preview, then activate" rule.
- Profile/join forms extracted to client components (`onboarding-forms.tsx`) + shared `invite-code-field.tsx`.
- Pre-auth `stayops_locale` cookie is read on `/onboarding` so the chosen language survives login → callback → onboarding.
- The dead `view=onboarding` / `view=invite` preview branches were removed from `/auth/login`; the `auth.gating.*` i18n keys remain (harmless, unreferenced).
- Deferred: rebuilding `/onboarding` into the mobile design, a multi-org switcher UI, and invite validity/usage figures in the preview.

### Auth backend — remove `isDevSeedLoginEnabled()` gate from email auth actions

Decision: `isDevSeedLoginEnabled()` checks that blocked `signInWithEmailPassword`, `signUpWithEmail`, and `requestPasswordReset` in `src/app/auth/actions.ts` have been removed. Dev seed login is display-only (login page shows the dev buttons when the env flag is set); it must not prevent real email auth in development.

Why: the guards blocked all real email sign-in/signup/reset while `ENABLE_DEV_SEED_LOGIN=true`, making it impossible to test the real email auth flow locally without toggling the env var.

Impact: `isDevSeedLoginEnabled` import removed from `actions.ts`. Superseded on 2026-06-23: dev seed login buttons and the `/api/dev/seed-login` route were removed entirely.

### Auth backend — single consistent route-state model for password reset

Decision: all reset redirects use `?view=email&mode=reset` (reset form) and `?view=email&mode=new_password` (set-new-password form). The previous `?view=reset` and `?view=new_password` routes (which didn't match any case in `page.tsx`) are replaced.

Why: the `requestPasswordReset` and `updatePassword` actions were redirecting to query-string states that the login page did not handle, resulting in the main auth entry screen appearing instead of the expected form after a reset link click.

Impact: `requestPasswordReset` errorBase changed; Supabase callback target updated; `updatePassword` errorBase changed; `page.tsx` gained `view=email&mode=new_password` (set new password), `view=email&mode=signup&sent=verify` (verification sent), and `sent=password_updated` success banner.

### Desktop root routing — `DevEntry` removed

Decision: `src/app/page.tsx` now redirects desktop requests to `/auth/login` instead of rendering `DevEntry`. The `DevEntry` component import is removed.

Why: `DevEntry` was a temporary development entry point. The product contract is mobile → `/mobile`, desktop → admin dashboard. Redirecting to `/auth/login` is the correct first step since the login page already handles onboarding state routing.

Impact: `DevEntry` import and render removed from `page.tsx`; OAuth callback passthrough preserved.

## 2026-06-16

### Todo Recurrence — switch to Todoist-style single live task (no pre-materialization)

Decision: Recurring Todo tasks are no longer pre-materialized into one `tasks` row per date across a
window. A recurring task is a **single live row** that **rolls forward to its next occurrence on
completion** (and rolls back on undo); the **calendar shows future occurrences as virtual previews**
computed from the rule (display only, no DB rows).

Why: the previous window-materializer flooded the date-agnostic tabs (관리함/공유함) with
duplicate-looking entries (a daily task generated ~50 rows). This is the standard Todoist model and
is storage-efficient (one row per series; previews computed only for the visible month).

Impact:
- `materializeRecurringTasks` deprecated and removed from all read paths; `completeTask` /
  `reopenTask` now roll the series date forward/back.
- One-time cleanup migration `202606160002_collapse_recurring_instances.sql` collapsed existing
  instances to one row per series (applied; 98 rows removed in the dev project).
- See `docs/product/18-todo-task-workflow.md` → Recurring Tasks (As-built 2026-06-16).

### Staff Suggestions / Feedback Box — First-Slice Planning Refinement

Decision: The first Staff Suggestions slice will remain a structured person-directed feedback workflow, not a discussion board and not a public visibility feed. Scope is:

- one required recipient
- optional referenced users
- `Sent / Received / Referenced` lists
- status lifecycle: `submitted` -> `reviewing` -> `on_hold` -> `completed`
- recipient-only status ownership
- participant comments with photo attachments
- notifications for create / reference / status / comment

Additional rules:

- the author may edit/delete the main suggestion only while status is `submitted`
- the recipient is the only user who can change status
- referenced users can read and comment only
- `on_hold` requires a hold reason
- `completed` requires a completion note
- comments stay available at every status and comment edit/delete is comment-author only

Deferred:

- anonymous posting
- broad organization-wide visibility
- votes / reactions
- non-photo attachments
- admin-only moderation flow

Reason:

- keeps the feature distinct from the Internal Board
- keeps confidentiality tied to explicit participants
- makes ownership clear by assigning status to the recipient only

Consequence: Product `22`, tech-design `12`, user-role notes, data-model notes, and RLS guidance must stay aligned with this first-slice rule set.

Status: Planned direction confirmed for design (2026-06-16)

## 2026-06-18

### Auth / Signup / Organization Join Policy Reset

Decision: the login/onboarding policy was redefined before implementation changes. The product now
targets the following auth model:

- Support **Google login/signup** and **standard email + password signup/login**
- Remove **email magic-link** from the product plan
- Treat Google as an **authentication method only**
- Do **not** import Google profile name/phone into StayOps operational profile fields

Required onboarding fields after authentication:

- name
- date of birth
- phone number
- preferred language
- team invite code

Rules:

- Authentication alone does not grant app access
- Users without a valid team invite code cannot use any StayOps features
- Incomplete users must always return to onboarding
- Email signup requires email verification
- Password reset uses reset-email flow
- Password policy: minimum 8 chars, letter + number required, special char optional
- Email login attempts should be temporarily rate-limited after repeated failures

Identity rules:

- The same email address maps to a single StayOps account
- Google and email/password should attach to the same account when the email matches
- Phone number is account-level unique
- If signup is retried on an incomplete account, resume onboarding instead of creating a duplicate account

Invite-code rules:

- Team invite code determines **organization + signup role category**
- Signup categories:
  - Part-time Staff
  - Office Staff
  - Field Staff
  - Part-time Staff (Manager)
  - Owner
- `Owner` invite code is one-time only
- All other invite codes are multi-use with:
  - 3-month validity
  - max 100 joins
- Invite-code success should show the resolved organization and role before final join

Organization rules:

- A user can belong to multiple organizations
- Login should auto-enter the last-used organization
- Organization switching is in-app, not on every login
- Joining an additional organization uses a new team invite code only (no need to re-enter full profile)
- If signup is retried on an incomplete account, the app should route the user to sign in and continue that same onboarding flow instead of creating a duplicate account
- `removed` membership is blocked by default, but the user may explicitly enter a re-join flow with another valid team invite code; `suspended` remains hard-blocked

Organization-creation rules:

- The first person who creates an organization becomes that organization's first owner
- Not everyone can freely create organizations
- New organization creation requires an allowed organization-creation path/code
- Until dashboard management exists, the initial organization / first owner / initial invite codes are
  bootstrapped manually in the database
- The mobile onboarding flow must not expose a self-claim path for `developer_super_admin`; platform admin bootstrap remains an operational path, not a public onboarding action

Data / account rules:

- Name is organization-visible by default
- Phone number is private by default
- Date of birth is private by default and viewable only by the user plus tightly limited admin access
- Gender is stored for payroll/employment record use and is private by default
- Users may edit name / date of birth / phone number later
- Team invite code is not editable after join
- Organization leave and full account deletion are separate actions
- Account deletion requires re-authentication and should preserve operational records while removing
  account access

Status: Confirmed planning baseline (2026-06-18). Implementation and schema cleanup still pending.

## 2026-07-03

### Onboarding Gender Field

Decision: Add `gender` to the onboarding-required profile capture flow and store it on `profiles`.

Reason:

- Payroll and employment record flows need a stable profile-level gender field rather than ad hoc export-only data.
- The onboarding wizard is already the place where identity-grade profile fields are collected.
- Existing active users should not be forced back into onboarding just because this field was added later.

Rules:

- New onboarding submissions must provide `gender`.
- Allowed values are currently limited to `female` and `male`.
- `profiles.gender` stays nullable for legacy accounts.
- Legacy accounts should be guided to fill missing profile fields from `/account`, not forced back through onboarding.
- `gender` is private by default and not shown to teammates in normal directory surfaces.
- UI copy remains fully multilingual (`ko`, `ja`, `en`) with no hardcoded visible strings.

Status: Implemented in onboarding + schema/docs sync

## 2026-05-04

### Project Name

Decision: Use `StayOps` as the working project name.

Reason:

- Works better than a hotel-only name if the app later expands to ryokan, motel, pension, guesthouse, residence, or serviced apartment operations.
- Short and easy to use in Korean, Japanese, and English contexts.

Status: Working decision

### Initial Languages

Decision: Support Korean, Japanese, and English.

Status: Confirmed

### Multilingual Implementation Priority

Decision: Korean, Japanese, and English should all be supported from the first implementation. Do not build Korean-only UI first and translate later.

Implementation note:

- Initial app UI localization is centralized in `src/lib/i18n.ts`.
- Korean remains the default fallback, but production UI should not rely on Korean-only hardcoded component strings.
- Authenticated screens should use the user's `profiles.preferred_language` value.

Status: Confirmed

### Language Selection

Decision: Users select their app language during signup and can change it later from My Profile.

Status: Confirmed

### Signup Required Information

Decision: Signup requires name, email or social login, language selection, invitation link or invite code, and phone number. Age and profile photo are optional after signup.

Status: **Superseded by 2026-06-18 auth reset** — current target fields are name, date of birth,
phone number, preferred language, and team invite code.

### Social Login Profile Completion

Decision: Social login may prefill email, name, and profile photo when available, but users must confirm or enter missing required fields. Prefilled profile information should be editable.

Status: **Superseded by 2026-06-18 auth reset** — Google profile data should not auto-fill StayOps
operational profile fields.

### Product Type

Decision: Native app for hotel operations, used by both field staff and office/admin staff.

Status: Confirmed

### Initial Users

Decision: Start with the company's own office staff, on-site staff, and part-time staff.

The product will be tested and improved through internal real-world use before considering public release.

Status: Confirmed

### Initial Business Model Context

Decision: The first operating environment is a mix of hotel operations and Airbnb-style property operations.

Status: Confirmed

### Property Structure

Decision: StayOps must support both multi-room buildings and standalone house-style properties.

Status: Confirmed

### Beds24 Integration

Decision: StayOps should integrate with Beds24 because the company uses Beds24 as its channel manager and already has an internal system using the Beds24 API.

Primary goal:

- Bring reservation, occupancy, availability, room, and property schedule data into StayOps.

Status: Confirmed as required, detailed implementation TBD

### Existing Internal System Stack

Decision: The current internal system is a web app with multiple API automations and uses Firebase, React Native, and Node.js.

Integrated services include:

- Google Sheets
- Notion
- Slack
- Beds24

Status: Confirmed

### Relationship to Existing Internal System

Decision: StayOps can be designed separately from the existing internal system.

Reason:

- The existing internal system focuses on price updates, occupancy, sales, inventory-related operations, and automation.
- StayOps focuses on on-site staff work, communication, tasks, schedules, and field operations.
- StayOps does not need to inherit the existing system's technical stack by default.

Status: Confirmed

### Client Platforms

Decision: StayOps needs both a native mobile app and an admin web app.

Reason:

- On-site staff and part-time staff need a fast mobile workflow.
- Office/admin users need a web interface for management, oversight, calendar work, and operational control.

Status: Confirmed

### First Mobile Workflow Priorities

Decision: The most important mobile workflows are maintenance issue registration, lost item registration, cleaning start/completion with timer, order/supply requests, and announcements.

Attendance and clock-in/out are excluded because another app already handles them.

Status: Confirmed — **the attendance/clock-in-out exclusion was reversed on 2026-06-09. See "2026-06-09 / Feature Batch Scope Decision → Attendance / Clock-In-Out + Payroll" below. The rest of this priority list still stands.**

### Cleaning Assignment Scope

Decision: Cleaning staff/personnel assignment is excluded from StayOps first scope because a separate system is already used for that.

StayOps should focus on cleaning execution tracking: start, timer, completion, and room/property record.

Status: Confirmed

### Authentication Methods

Decision: StayOps should support email login and Google login. Apple login is desirable, especially for iOS.

Status: Confirmed, implementation details TBD

### Signup and Google First-Login Policy

Decision:

- StayOps must provide an explicit signup flow in addition to login.
- Google login is an authentication entry only; first-time Google users are not considered fully onboarded.
- After Google auth succeeds, users must complete required member profile fields before app access is granted.
- Required profile fields after Google auth: name, phone number, preferred language, and invite code (or valid invite link) according to onboarding policy.
- If Google provides prefilled values (for example name/email), users can edit them and must confirm completion.

Status: Confirmed (2026-06-02)

### Organization Model

Decision: StayOps must support company/workspace separation from the beginning.

Reason:

- The company currently has about 10 employees and more than 40 part-time staff.
- More users will be added over time.
- Future public release requires each company/customer to have separated data.

Status: Confirmed

### Staff Onboarding

Decision: Recommended onboarding approach is invite-based plus invite-code support.

Reason:

- Admin email invitations are safer for employees and managers.
- Invite codes are convenient for part-time staff and larger onboarding.
- Admin approval and role assignment should protect access.

Status: Recommended

### Initial Role Structure

Decision: Use the following initial roles:

- Developer/Super Admin
- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff

Maintenance responsibility belongs under Field Manager rather than a separate role for the first version.

Status: Confirmed

### Part-Time Staff Data Access

Decision: Part-time staff can see all guest/reservation information except price/revenue-related information.

Reason:

- Field work requires visibility into room/property and guest information.
- Price and revenue information is not needed for part-time field work.

Status: Confirmed

### Check-In and Check-Out Rules

Decision: Default check-in time is fixed at 16:00. Default check-out time is 10:00.

Early check-out can change the expected check-out time by about 1 to 3 hours and must be entered manually by CS staff because this information is received through direct guest communication.

Status: Confirmed

### Current Property Names

Decision: Current known properties are Arakicho A, Arakicho B, Kabukicho, Takadanobaba, Okubo A, Okubo B, and Okubo C.

Status: Confirmed as current working names

### Upcoming Hotel Property

Decision: A larger hotel-style building is expected around July with about 26 rooms, but the name, room numbers, and detailed structure are not decided yet because it is still under construction.

Status: Known future requirement

### Admin Web Core Areas

Decision: The admin web app must treat calendar/occupancy, check-in/check-out, cleaning status, maintenance, lost and found, order/supply requests, and announcements as core frequently used areas.

Staff management and inventory are also important admin areas.

Status: Confirmed

### Cleaning Timer Behavior

Decision: Cleaning staff select a room/property, tap start cleaning, tap complete cleaning, and StayOps records total cleaning duration.

One staff member may clean up to about 2 rooms/properties per day.

Status: Confirmed

### Cleaning-Linked Issue Reporting

Decision: During an active cleaning record, staff should be able to report lost items and maintenance issues without leaving the cleaning context. The created records should automatically link to the cleaning record, property, and room/unit.

Status: Confirmed

### Cleaning Photo Strategy

Decision: Completion photos are useful, but uploading about 30 photos per room may create high server/storage cost.

MVP recommendation:

- Do not require bulk completion photo upload.
- Use optional compressed photos for issue evidence.
- Prefer photos on lost item or maintenance reports instead of normal cleaning completion.

Status: Recommended

### Maintenance Request Fields

Decision: Maintenance requests need room/property, problem description, photos, priority, reporter, processing status, and memo.

Status: Confirmed

### Maintenance Categories

Decision: Initial categories are electric, water, air conditioning/heating, Wi-Fi, furniture, appliance, cleaning condition, supplies, damage, and other.

Status: Confirmed

### Maintenance Meaning

Decision: Maintenance is not limited to broken items. It also covers missing items, operational issues, and anything part-time staff cannot resolve themselves.

Status: Confirmed

### Lost and Found Fields

Decision: Lost item records need found property/room, item name, photos, found date/time, reporter, guest/reservation link, retrieval tracking, memo, and status.

Storage location is not required for MVP.

Status: Confirmed

### Lost and Found Auto-Fill Rules

Decision: Lost item creation should use different auto-fill behavior depending on entry point.

From active cleaning timer:

- Property/room auto-filled from the active cleaning room.
- Found date/time auto-filled from registration time.
- Reporter auto-filled from current user.
- Guest/reservation auto-suggested from that room's checkout guest when available.
- Before final submit, show a confirmation popup asking whether the auto-filled room is correct.
- Provide a pencil/edit action for correction.

From Lost and Found tab:

- User selects property/room manually.
- After room selection, app shows the most recent checkout guest for that room as suggested reservation/customer link.
- User can edit or clear the suggested link.
- Found date/time and reporter remain auto-filled.

Status: Confirmed

### Lost and Found Retrieval Meaning

Decision: Retrieval means the customer/guest has picked up or received the lost item.

It does not mean staff internally collected the item from the room.

Status: Confirmed

### Lost and Found Retrieval Processing

Decision: Retrieval processing does not need a detailed required form in the first version.

The staff member who gives the item to the guest or arranges shipment can mark the item as retrieved. The app should record who processed retrieval and when.

Status: Confirmed

### Order Request Flow

Decision: Staff/part-time staff create order requests. Office Admin reviews and approves or rejects. If rejected, the requester receives a notification with the rejection reason. If approved, Office Admin orders/prepares the item and marks it as ordered/completed. The requester receives a notification when ordering is completed.

Status: Confirmed

### Order Request Fields

Decision: Order requests require property/building, item name, quantity, optional photo, optional product/reference URL, optional reason, requester, status, and memo.

Order requests are property/building-level, not room-level.

Status: Confirmed

### Inventory Scope

Decision: Inventory management is not included in the first MVP because the detailed requirements are not decided yet.

It should remain documented as a future module.

Status: Confirmed

### Cleaning Overdue Notification

Decision: Cleaning normally starts around 10:00 and should be completed by 16:00 at the latest. If a cleaning timer is still in progress after 16:00, StayOps should send one overdue notification to the responsible staff and manager/admin recipients.

Status: Confirmed

### Mobile Internal Distribution

Decision: StayOps must be usable on both iPhone and Android before public store release.

Public App Store / Google Play release is not planned immediately, but the app should be designed for future release.

Status: Confirmed

### Developer Account Status

Decision: The company does not currently have Apple Developer or Google Play Console accounts.

These accounts must be prepared before reliable internal iOS/Android distribution.

Status: Confirmed

### Initial Cost Constraint

Decision: StayOps must start as free/low-cost as possible.

Apple Developer account will likely not be created immediately and should be prepared later before native app release.

Status: Confirmed

### Initial Platform Strategy

Decision: Because the project must start free/low-cost and Apple Developer account is not available yet, the first implementation should strongly consider PWA-first.

Native Expo app can be considered later before store release or when stable native mobile push becomes necessary.

Status: Recommended

### Initial Hosting

Decision: Use Vercel for the initial internal PWA/admin web deployment. Company domain can be connected later if available.

Status: Confirmed

### Reservation Calendar Requirements

Decision: Beds24 reservation calendar must show date, property/building, room/unit, guest name, check-in date, check-out date, number of guests, and whether there is an empty room/property for the selected day.

Mobile must include a TimeTree-like monthly calendar by property/building, plus separate views for today's check-ins, today's check-outs, guests staying today, and empty rooms/properties.

Status: Confirmed

### Reservation Calendar Date Range

Decision: StayOps reservation calendar only needs current month plus the next 2 months for MVP.

Historical data from 2022 onward is available in the existing internal system but does not need to be shown in StayOps.

Status: Confirmed

### Beds24 Webhook Strategy

Decision: Use Beds24 webhooks instead of frequent polling/scheduled sync as the primary reservation update strategy.

Reason:

- Better real-time behavior.
- Avoid unnecessary server/API cost.
- Beds24 official documentation supports booking webhooks and recommends avoiding high-frequency GET calls.

Status: Confirmed as preferred strategy

### Reservation Status Visibility

Decision: Show only confirmed/valid reservations in the reservation calendar. Cancelled reservations should be removed from the visible calendar and should not count as occupied.

Status: Confirmed

### Reservation Memo Visibility

Decision: Beds24 reservation notes/memos are not required in the MVP reservation calendar or reservation detail popup.

Status: Confirmed

### Empty Room Definition

Decision: A room/property is considered empty on a date when there is no reservation bar on that date. Cleaning status is not part of the empty-room calculation for MVP.

Status: Confirmed

### Earliest Empty Availability List

Decision: StayOps should include a list that shows the earliest empty availability from today onward, including today. Users can view this for the selected property/building or for all properties/buildings. When all properties are selected, show the earliest empty availability per property/building.

Status: Confirmed

### Mobile Bottom Navigation

Decision: Use five mobile bottom tabs: Home, Calendar, Cleaning, Requests, and Announcements.

Home includes quick actions for start cleaning, maintenance issue, lost item, and order request.

Status: Confirmed

### User Profile and Directory

Decision: Users need a My Profile feature to edit their own basic information such as name, age, and phone number. StayOps also needs a user directory where organization members can see all registered members and call them with a phone button.

Status: Confirmed

### Admin Web Navigation

Decision: Use the following admin web sidebar for MVP: Dashboard, Calendar, Check-In/Out, Cleaning, Maintenance, Lost & Found, Orders, Announcements, Todoist, Users, Settings.

Inventory is excluded from MVP navigation and remains a future module.

Status: Confirmed

### Mobile Home Priority

Decision: Mobile Home should show active cleaning timer first, then important/popup announcements, today check-in/check-out summary, quick action buttons, and today's my activity records.

Today's my activity records are automatically created from user actions such as cleaning start and cleaning completion.

Status: Confirmed

### Cleaning Room Selection

Decision: Cleaning start should primarily select room/property from today's check-out list. Search-based property/room selection should also be available as a secondary method.

Status: Confirmed

### Cleaning Completion Confirmation

Decision: When staff taps Complete Cleaning, show a confirmation popup before final completion. The popup should show room/property, cleaning start time, and approximate elapsed time. Special notes are optional and not required.

Status: Confirmed

### Cleaning Timer Shortcuts

Decision: Active cleaning timer screen should show shortcuts for lost item registration, maintenance issue registration, special note, and cleaning completion. Lost item and maintenance records created from the timer must also appear in the normal Requests tab/admin web lists.

Status: Confirmed

### Cleaning Record Export

Decision: Office/admin users and Field Manager or higher roles need to export cleaning records as Korean Excel or PDF files. Exports should include who cleaned which room/property, when, and total duration.

Status: Confirmed

### Request Visibility

Decision: Maintenance requests, lost item records, and order requests can be created and viewed by all users. The mobile Requests tab should also include a "My registrations" view for records created by the current user.

Status: Confirmed

### Request Status Change Permission

Decision: Request status changes are allowed for Field Manager, Admin, Office Staff, and Staff roles in general. Part-time Staff cannot change statuses.

Order request approval/rejection/ordered processing is more restricted: only Office Staff, CS Staff, Admin, Owner, and equivalent office-level roles can process order request statuses.

Status: Confirmed

### CS Order Request Permission

Decision: CS Staff is treated as office-level for order request processing in MVP.

Status: Confirmed

### Request Edit and Delete Permission

Decision: Any user can edit/delete records they created. Part-time Staff can only edit/delete their own records.

Status: Confirmed

### Delete Behavior

Decision: User-triggered deletion should be hard delete in MVP. A confirmation popup must be shown before deletion.

Status: Confirmed

### Photo Upload Limits

Decision: Maintenance requests, lost items, order requests, and announcements can each support up to 5 photos/images.

Cleaning completion photo upload is deferred for MVP. If the company later accepts storage cost for public release or expanded internal use, cleaning completion may support up to about 30 photos per room.

Status: Confirmed

### Image Compression Policy

Decision: Images should be automatically resized and compressed before upload for MVP.

Recommended settings:

- Long edge max 1600px
- JPEG/WebP compression
- Quality around 70-80%

If the company later accepts higher storage/bandwidth cost, image quality can be upgraded.

Status: Confirmed

### Offline Scope

Decision: MVP does not include full offline mode. The app should instead handle network errors clearly, prevent accidental form loss where possible, and retry failed saves/uploads where practical.

Status: Confirmed

### Mobile Reservation Calendar Layout

Decision: The mobile monthly calendar should use a date-based month view with reservation bars inside date cells. Tapping a reservation bar opens guest/reservation details.

Status: Confirmed

### Reservation Bar Display

Decision: Reservation bars should display guest name and number of guests only. Tapping the reservation bar opens a popup/detail panel with full guest and reservation information.

Status: Confirmed

### Reservation Phone Actions

Decision: Reservation detail popup should support both copying the phone number and calling the phone number.

Status: Confirmed

### MVP Organization Creation Flow

Decision: Use the recommended MVP organization onboarding flow.

Rules:

- Only Developer/Super Admin can create organizations during MVP.
- General users cannot create companies/workspaces by themselves.
- Employees join by email invitation.
- Part-time staff join by invite code.
- Owner/Office Admin can manage invitations, invite codes, roles, and deactivation.

Status: **Superseded by 2026-06-18 auth reset** — target rule is organization creation through an
allowed organization-creation path/code, with the first creator becoming the first owner.

### Invite Code Policy

Decision: Invite codes should support code name, default role, expiration date, maximum uses, and active/inactive status.

Recommended default role for part-time onboarding is Part-time Staff.

Status: Confirmed

### Post-Login Routing

Decision: Use one account system with role-based default routing and mode switching.

Default route:

- Developer/Super Admin, Owner, Office Admin, and CS Staff enter admin web.
- Field Manager, Staff, and Part-time Staff enter mobile field home.

Mode switching:

- Admin-capable roles can switch between admin mode and field mode.
- Staff and Part-time Staff only access field mode.

Status: Confirmed

### Order Request Item Input

Decision: Order item names should be free-text input rather than fixed catalog selection for the first version.

Reason:

- Amenities and supplies vary too much.
- New items may need to be requested depending on situation.

Status: Confirmed

### Order Request Price Scope

Decision: Order request MVP should not include price, estimated cost, unit cost, cost center, or budget fields.

Reason:

- Requesters should be able to submit quickly from the field.
- Price-related work is not needed for the initial order request workflow.
- Product/reference URL is enough when the requester knows where the item can be purchased.

Status: Confirmed

### Order Request Non-Scope

Decision: Order request MVP should not include payment, shipping, delivery tracking, arrival tracking, courier, tracking number, or receiving/stock-arrival workflows.

Reason:

- The feature exists so field staff can ask the office for needed supplies/items.
- The important information is which property/building needs what item, how many, and who requested it.
- Purchasing, payment, and delivery details are outside the first workflow.

Status: Confirmed

### Order Request Multiple Items

Decision: One order request can include up to 40 requested item rows.

Rules:

- Each item row should at minimum support item name and quantity.
- Optional URL/photo/reason/memo can be included without making the requester-side UI feel like a spreadsheet.
- Requester-side UX must stay simple despite supporting multiple items.

Status: Confirmed

### Order Request Requester Simplicity

Decision: Order request screens should preserve full workflow functionality while keeping the requester-side experience simple and low-friction.

Rules:

- Requester creates a quick request with property/building, item name, quantity, optional URL, optional photo, optional reason/memo.
- Office-level roles handle approve/reject/ordered processing.
- Office-side workflow can show more actions, but requester-side screens should not look like purchasing/admin forms.

Status: Confirmed

### Announcement Write Permission

Decision: All roles except Part-time Staff can create announcements.

Status: Confirmed

### Announcement Targeting

Decision: Announcements should support everyone, specific property/building, specific role, and combined targeting.

Status: Confirmed

### Announcement Features

Decision: Announcements need read tracking, important/pinned settings, comments, up to 5 images, and optional app-open popup display.

Status: Confirmed

### Announcement Comment Permission

Decision: Users who can view an announcement can comment on it. For an everyone-targeted announcement, everyone can comment.

Status: Confirmed

### Work Scheduler Meaning

Decision: The work scheduler is separate from the Beds24 reservation calendar.

It is for recurring property/room operational work such as weed removal, air conditioner filter work, waxing, and other periodic annual/seasonal work.

Status: Confirmed

### Todo / Task Purpose

Decision: Todo/Tasks should work as a lightweight operational memory and follow-up system, especially for CS staff.

Purpose:

- Remember guest-related follow-ups.
- Track room/property-specific notes that need action.
- Record customer promises or special handling.
- Help staff avoid forgetting small operational details.

Todo/Tasks should feel fast and convenient like Todoist, while staying connected to StayOps properties, rooms, guests, and reservations.

Status: Confirmed

### Recurring Work Creation Permission

Decision: Existing recurring work items will initially be entered by Developer/Super Admin. Field Managers also need permission to create recurring work schedules.

Recommended creation/edit roles:

- Developer / Super Admin
- Owner
- Office Admin
- Field Manager

Status: Confirmed

### Lost and Found Statuses

Decision: Initial lost item statuses are registered, stored, disposal_scheduled, and disposed.

Status: Confirmed

### Lost and Found Storage Policy

Decision: The company generally stores lost items for 2 weeks. Expensive items may be stored longer in rare cases.

Requested automation:

- If retrieval does not happen, automatically move the item to disposal_scheduled after 30 days.
- If there is still no action after an additional period, automatically delete or finalize the record.

Recommended implementation detail:

- Prefer disposed/archived over immediate hard deletion to preserve operational history.

Status: Confirmed policy, final deletion/archive details TBD

### Technical Stack

Decision: Use Next.js App Router + TypeScript PWA-first, Tailwind CSS v4, shadcn/ui/Radix UI, Supabase Auth/PostgreSQL/Storage/RLS, Vercel, Web Push/in-app notifications, and Beds24 webhook integration for MVP.

Supporting libraries:

- React Hook Form
- Zod
- TanStack Query
- TanStack Table
- Lucide Icons
- ExcelJS
- PDF export library TBD

React Native/Expo can be added later when native app store release becomes necessary.

Status: Confirmed

### Design Direction

Decision: Use a pure-white operational base with selective Apple-inspired Liquid Glass accents and stronger business-app readability.

Layouts and wireframes will be created with Google Stitch.

Status: Confirmed

### Theme Modes

Original decision: StayOps must support both light mode and dark mode for mobile PWA and admin web screens.

Status: **Superseded (2026-06-08)** — Dark mode is deferred until after the official launch. For the MVP and internal rollout, StayOps is **light-mode-only**. All dark-mode code, styling (`dark:` utilities, dark CSS variable blocks), theme state/persistence, and theme-toggle UI have been removed. The `profiles.theme_preference` column/enum remains in the database (already-applied migration, `not null default 'system'`) but is no longer read or written by the app; its removal is out of scope for now (see Current Status). Dark mode may be revisited post-launch as a fresh slice.

### Theme Preference

Original decision: Users can choose System, Light, or Dark theme. Default is System.

Status: **Superseded (2026-06-08)** — The theme preference control has been removed from account/profile flows along with the rest of dark mode. Deferred until post-launch.

### Project Workflow

Decision: StayOps should follow a plan/design/document/implement/test/review/update-docs workflow.

Any feature change, requirement change, permission change, UI flow change, data model change, or technical change must update the related Markdown files.

Status: Confirmed

### AI Collaboration Rules

Decision: Codex, Claude, Cursor, and any other AI tools working on StayOps must follow shared Markdown documentation as the source of truth and update docs when making project changes.

Status: Confirmed

### Initial Data Model

Decision: Use Supabase/PostgreSQL with organization-based tables for profiles, memberships, invite codes, properties, rooms, reservations, cleaning records, maintenance requests, lost items, order requests, announcements, notifications, and recurring work.

Every operational business record must include `organization_id`.

Status: Drafted

### Attachment Model

Decision: Use a shared `attachments` table instead of storing photo URL arrays directly on each feature table.

Status: Confirmed

### Platform Admin Model

Decision: Store Developer/Super Admin access in a separate `platform_admins` table, not inside organization memberships.

Status: Confirmed

### Audit Logs

Decision: Add an `audit_logs` table to record important admin/platform actions. A full audit log UI is not required for MVP, but important actions should be stored.

Status: Confirmed

### RLS Permission Draft

Decision: Create a dedicated RLS permissions document for Supabase/PostgreSQL policies. RLS must enforce organization isolation and key role-based permissions.

Status: Drafted

### Implementation Plan

Decision: Use a phase-based MVP implementation plan from planning/design preparation through project setup, auth, app shells, core workflows, Beds24 calendar, notifications, exports, and internal rollout.

Status: Drafted

### Stitch Screen List

Decision: Create a dedicated Stitch screen list with first design targets and prompt drafts for core mobile and admin screens.

Status: Drafted

### Accepted Stitch Screens

Decision: The following Stitch screens are accepted as v1 working design directions:

- Login / Signup basic direction
- Mobile Home basic direction
- Active Cleaning Timer basic direction
- Mobile Requests Tab basic direction
- Mobile Announcements list / detail / popup
- Mobile User Profile / Directory / Edit Profile / User Detail
- Admin Dashboard
- Admin Cleaning Status
- Admin Maintenance
- Admin Lost & Found
- Admin Order Requests
- Admin Announcements
- Admin Todoist
- Admin Users

New Request Menu v1 is structurally accepted but needs more Liquid Glass polish later.

Remaining design work:

- App Splash / Launch Screen
- Role-based screen and button visibility review
- Final Stitch progress documentation cleanup

Status: Confirmed

### App Splash / Launch Screen

Decision: StayOps should show a brief splash/launch screen when the mobile app/PWA first opens.

Direction:

- Use a white or bright gray-white background.
- Show the StayOps app logo centered on the screen.
- Keep the splash brief, similar to common app launch experiences such as Instagram or Facebook.
- Do not use the splash as a marketing page.
- The final StayOps logo is not designed yet, so the splash screen remains required but final visual design depends on later logo work.
- Temporary designs may use a StayOps wordmark or placeholder logo.

Status: Confirmed requirement; logo design pending

**2026-07-17 tuning update:** the requirement to show a launch splash stays, but the previous
implementation timing (~850ms hold + ~420ms fade) was too long for the installed iPhone PWA and made
the app feel slower than the actual backend. The splash remains, but its timing is shortened to
**~160ms hold + ~180ms fade**, and it no longer captures touches while fading (`pointer-events: none`).
This keeps the "brief native launch" intent while removing avoidable perceived latency.

### Reservation Calendar Visual Rules

Decision: Reservation calendar date numbers must always remain visible even when reservation bars exist on that date. Reservation bars should be real multi-day bars spanning check-in to check-out, not small isolated labels that hide the date.

Reservation source/channel should control bar color:

- Booking.com / Booking: blue or blue-teal family
- Airbnb: soft light pink family
- Direct/other: neutral gray family

The company's existing internal room/date calendar is an important reference for reservation density and multi-day bar behavior. Mobile still needs a readable monthly view, while admin web should strongly consider a room-by-date timeline grid.

Status: Confirmed

### Reservation Calendar Design Scope

Decision: Mobile and admin web reservation calendar directions are both documented.

Mobile calendar must avoid large unused bottom whitespace. The monthly grid should use the available vertical space efficiently above the bottom navigation.

Admin web reservation calendar should use a dense channel-manager-style room/date grid for office users. It should prioritize scanning many rooms and many dates over large card layouts. A selected reservation detail inspector or collapsible drawer is useful, but it is secondary to the grid.

Status: Confirmed

### Admin Reservation Calendar Stitch Outcome

Decision: The Admin Reservation Calendar Stitch exploration is not accepted as a final v1 design.

Reason:

- Stitch repeatedly produced sparse timelines, over-emphasized detail panels, or rate/inventory-style screens.
- The required admin calendar is closer to a high-density channel-manager grid than a normal SaaS calendar.
- The final UI likely needs a custom data-grid/timeline component during implementation.

Confirmed structural direction:

- Dense room/date grid.
- Support many rooms and many dates.
- Optional room sub-rows such as Status, Min Stay, and Reservation.
- Reservation bars span check-in to check-out.
- Reservation bars display guest name and number of guests only.
- Booking.com/Booking uses blue-teal, Airbnb uses soft light pink, Direct/Other uses neutral gray.
- No price, revenue, payment, rate, sales, or inventory data in StayOps MVP.
- Selected reservation detail surface may show guest, property, room, dates, guests, channel, phone, Copy, and Call. Mobile uses a slide-up bottom sheet; admin web may use an inspector/drawer if needed.
- Earliest available list remains required.

Status: Confirmed structural direction; final Stitch v1 not accepted

### Large-Building Mobile Calendar Strategy

Decision: For buildings with many rooms, such as the upcoming 26-room hotel or any property with about 28 rooms, StayOps should not attempt to show every room's reservations inside one normal mobile monthly date-cell calendar.

Recommended mobile structure:

- Month view: property-level monthly overview and selected-room/small-property calendar
- Rooms view: room-by-date timeline for the selected building, with enough date density for practical scanning
- Lists view: check-in today, check-out today, staying today, empty today, and earliest empty

Reason:

- A normal month grid becomes unreadable when many room reservations compete inside each date cell.
- Mobile needs a separate dense room timeline or operational lists for large buildings.

Status: Confirmed

### Rooms Timeline Date Density

Decision: The mobile Rooms timeline must show more useful date information than a narrow 3-day view. The default should support a practical 7-day range, with an optional 14-day compact view for broader scanning.

Rules:

- Sticky room column.
- Horizontally scrollable date area if needed.
- Clear date range and scroll affordance.
- Compact reservation labels in wider date ranges.
- 14-day mode can prioritize occupancy shape over full guest names.

Status: Confirmed

### Rooms Timeline Density Modes

Decision: For large buildings, Rooms view should separate detail reading from broad occupancy scanning.

Modes:

- Detail mode: fewer days, readable guest labels.
- Overview mode: more dates, compact occupancy bars/cells, guest names hidden by default.

Reason:

- Mobile cannot show 28 rooms, many dates, reservation durations, and full guest names all at once without becoming unreadable.
- Staff need both quick occupancy overview and tappable detail access.

Status: Confirmed

### Rooms Overview Visual Direction

Decision: Rooms Overview should use a compact occupancy timeline style: room numbers on the left, dates across the top, and horizontal colored reservation bars spanning dates. Guest names are hidden in this overview to maximize date density.

Interaction:

- Tap a reservation bar to open reservation detail.
- Use channel colors for reservation bars.

Status: Confirmed

### Environment Setup

Decision: Create an environment setup document that lists required environment variable names and service setup without storing real secret values.

Status: Drafted

## 2026-06-08

### Mobile Bottom Navigation — Center Action Button

Decision: Replace the five-tab floating capsule bottom bar with a center-action ("추가") FAB design — four tabs (Home, Calendar / Requests, Announcements) split 2 / 2 around a raised central teal `#0e7c72` button.

Consequence:

- "Cleaning" can no longer occupy a bottom tab. It moved to the side menu (hamburger) and remains reachable at `/mobile/cleaning`.
- The four side tabs are **per-user customizable** (all four slots). The center FAB ("편집", pencil icon) opens a bottom-bar editor sheet: a 2-column colour-category tile grid of the selectable feature pool where the user toggles up to 4 tabs (≥1 required). Selection is persisted **per user in Supabase** (`profiles.bottom_nav_tabs`) and synced across devices.

Implementation:

- DB: migration `supabase/migrations/202606080001_profile_bottom_nav.sql` adds `profiles.bottom_nav_tabs text[]` (default `{home,calendar,requests,announcements}`). The existing "users can update own profile" RLS policy already covers it. `src/types/database.ts` updated.
- `src/config/navigation.ts`: `mobileBottomNavigation` (defaults) plus `MAX_BOTTOM_NAV_TABS`, `defaultBottomNavTabIds`, `customizableBottomNavItems`, `resolveBottomNavItems`, `sanitizeBottomNavTabIds`.
- `src/lib/session.ts` reads `bottom_nav_tabs` defensively (falls back to defaults if the column is absent) and exposes `session.user.bottomNavTabs`.
- `src/app/account/actions.ts` `updateBottomNavTabs` server action persists the sanitized list.
- `.tabbar` + `.add-sheet*` / `.add-grid` / `.add-tile*` styles in `src/app/globals.css`; bar + editor `createOpen` sheet in `src/components/shell/mobile-shell.tsx`. Tile colours use `oklch` with fixed lightness/chroma and hue-only variation (`LAUNCHER_META`).

Status: Working decision (requires the migration to be applied on the linked Supabase project)

### Mobile Bottom Navigation — Design Token Unification

Decision: All hardcoded hex values in the bottom tab bar and editor sheet (`#0e7c72`, `#aab2b6`, `#dfe4e6`, `#f1f3f4`, `#9aa3a8`, `#3a4a49`, `#1c2b2a`) are replaced with design tokens from `globals.css :root` (`var(--primary)`, `var(--muted-foreground)`, `var(--border)`, `var(--muted)`, `var(--foreground)`, `var(--surface)`, `hsl(var(--primary-hsl) / ...)`) so the bar derives from the single token source of truth.

Exception: `.add-tile`/`.add-tile__badge` `oklch` launcher hue colours are intentional decorative tones and remain as-is.

Status: Confirmed

### Wordmark Color — Unified to `text-foreground`

Decision: The "Stay Ops" wordmark in both mobile shell (top header) and admin shell (sidebar) uses `text-foreground` (neutral dark) for consistency. Previously the admin wordmark used `text-primary` (teal). The admin identity badge (square teal `S` icon) still uses `bg-primary`/`text-primary-foreground` so brand color remains present.

Status: Confirmed

### Center FAB Label — `editBottomBar` Instead of `edit`

Decision: The center FAB button label and aria-label use `dictionary.common.editBottomBar` ("하단바 편집" / "下部バーを編集" / "Edit bottom bar") instead of the generic `dictionary.common.edit` ("편집") to unambiguously indicate its purpose (customize the bottom bar) and prevent confusion with content-editing actions.

Status: Confirmed

## 2026-06-09

### Feature Batch Scope Decision

Decision: The five new features captured in `docs/planning/15-feature-batch-plan.md` (Linen Defect Registration, Personal Todo / Shared Task Inbox, Staff Suggestions / Feedback Box, Internal Board, Attendance / Clock-In-Out + Payroll) are approved as a **post-MVP feature batch**. They are no longer "candidate only" — they are the confirmed next build scope after the Phase 6–13 MVP.

Build order (confirmed): 1) Linen Defect → 2) Personal Todo / Shared Task Inbox → 3) Staff Suggestions / Feedback Box → 4) Internal Board → 5) Attendance / Clock-In-Out + Payroll.

Reason:

- The batch plan was drafted 2026-06-08 and reviewed 2026-06-09; the user confirmed the scope change.
- The first four features do not conflict with any prior confirmed exclusion.
- This decision is the governing source of truth. `15-feature-batch-plan.md` moves from "Draft / Candidate" to "Approved scope."

Status: Confirmed (2026-06-09)

### Attendance / Clock-In-Out + Payroll — Scope Change (Approved)

Decision: Attendance / clock-in-out and hourly payroll are now **in scope** for StayOps. This explicitly reverses the earlier "First Mobile Workflow Priorities" exclusion (attendance excluded because another app handles it) and the "Out of Scope → Attendance / Clock-In and Clock-Out" entry in `docs/planning/03-mvp-priority.md`.

Scope nuance (important):

- **Attendance capture** (PWA QR + device GPS clock-in/out, attendance logs) is approved for implementation.
- **Payroll calculation** stays **design-only / deferred** until the company defines the wage rules: rounding, break deduction, lateness, overtime, overnight shifts, holiday handling, payroll closing date, and the correction/approval flow. Payroll math must not be coded before those rules are confirmed (see `docs/product/21-attendance-payroll-workflow.md` "Important Policy Questions" and `docs/engineering/11-attendance-payroll-technical-design.md` "Current Blockers").
- Operating-date boundaries for attendance/payroll periods must follow the project Asia/Tokyo convention (see CLAUDE.md §6); the exact period-boundary rule is part of the deferred wage policy.

Reason: The user approved the scope change on 2026-06-09 when asked directly whether to approve or keep it blocked.

Status: Confirmed (2026-06-09) — attendance capture buildable now; payroll calc blocked on wage-policy definition.

### Attendance / Payroll Policy Baseline — Refined

Decision: On **2026-06-17**, the attendance / payroll feature policy was refined enough to support an implementation-ready product spec and technical design for:

- session-based attendance capture
- GPS + QR attendance in the first PWA release
- future `GPS + Wi-Fi` design kept in the model but **disabled in current PWA UI as 준비중**
- hourly-worker gross-pay calculation only
- per-person monthly finalization / reopen / snapshot / export

Confirmed policy baseline:

- One open session per user at a time; multiple sessions per day allowed after clock-out.
- Sites are required; free-text attendance locations are not allowed.
- Clock-in site and clock-out site may differ, but both must be registered sites.
- GPS is mandatory for successful attendance.
- PWA first release uses **GPS + QR** only; Wi-Fi remains planned but inactive in PWA.
- Breaks are recorded explicitly; hourly workers are paid only for worked minutes excluding recorded breaks.
- No automatic break deduction.
- No overtime, holiday, public-holiday, or night premiums in the first payroll slice.
- Hourly pay uses 1-minute units and rounds the final monthly gross to the nearest 10 yen.
- Taxes, insurance, deductions, and salaried payroll remain outside StayOps.
- Users can see only their own attendance / pay; only `owner` and explicit `attendance_payroll_admin` users can see org-wide payroll data, finalize months, reopen, and export.
- Site master remains owner-only.

Reason: The user confirmed these operating rules directly while refining the attendance / payroll MD documents on 2026-06-17.

Consequence:

- `docs/product/21-attendance-payroll-workflow.md` and `docs/engineering/11-attendance-payroll-technical-design.md` move from generic draft placeholders to implementation-ready refined drafts.
- `docs/planning/06-current-status.md` should no longer describe hourly payroll as completely undefined; the remaining blocker is the export template and the deferred Wi-Fi activation path, not the core hourly gross-pay policy itself.

Status: Confirmed policy baseline (2026-06-17)

### Internal Board — Part-Time Write Permission

Decision: In the Internal Board feature, **all active organization roles including Part-Time Staff can create posts.** This is intentionally different from Announcements, where Part-Time Staff cannot create (see "Announcement Write Permission").

Reason:

- The Internal Board is a lighter, everyday team-communication space with no required read tracking or popup, so the stricter announcement authorship limit does not apply.
- The user confirmed allowing part-time posting on 2026-06-09.

Consequence: This is a role-permission expansion relative to the announcement model and must be reflected in `docs/product/01-user-roles.md`, `docs/product/20-internal-board-workflow.md`, and the Internal Board RLS in `docs/engineering/05-rls-permissions.md`.

Status: Confirmed (2026-06-09)

### Personal Todo — Private-by-Default and Sharing

Decision: Personal todos/tasks are **private to the owner by default** and become visible to others only when explicitly assigned or shared. This refines (does not replace) the earlier "Todo / Task Purpose" decision, which defined purpose only and was silent on visibility.

Open implementation point (still to confirm during build): the teammate-share mechanism — one shared task record with multi-user visibility vs. a sender/recipient copy model (`task_transfers`). This must be resolved before the Todo slice is implemented. See `docs/product/18-todo-task-workflow.md`.

Status: Confirmed direction (2026-06-09); share mechanism TBD before build.

### Staff Suggestions — Visibility Model

Decision: The earlier `public_team` / `employee_only` visibility direction was later replaced on **2026-06-16** by a participant-scoped model: author + one required recipient + optional referenced users. There is no broad visibility mode in the current first-slice plan.

Consequence: Product, RLS, and data-model docs must follow the newer participant-scoped rule instead of the older two-visibility-mode draft.

Status: Superseded on 2026-06-16

## 2026-06-10

### Beds24 Webhook Reliability — Observability + Daily Reconciliation

Decision: Add a webhook ingestion observability log plus a daily reconciliation safety net to prevent silently-dropped Beds24 webhooks from leaving reservations missing from the calendar.

Context:

- A confirmed reservation (`5843903602`, Kabukicho 302, check-in 2026-06-08) was found missing from the calendar. Root cause: the booking was never written to the DB — its webhook never reached the processing path — and there was no log of webhook delivery, so the loss was invisible until an operator noticed the calendar gap.

Implementation:

- New table `beds24_webhook_events` (migration `202606100001_beds24_webhook_events.sql`) logs every inbound webhook batch and every reconciliation run (trigger source, http status, counts, modes, compact booking summary). Platform-admin read, service-role write.
- New production endpoint `/api/beds24/reconcile` re-pulls the operational window (current month + next month) from Beds24 `/bookings` and upserts anything missing. Idempotent; the production counterpart to the dev-only backfill route.
- Vercel Cron (`vercel.json`, `0 19 * * *` UTC = 04:00 Asia/Tokyo) runs the reconcile endpoint **once daily**, within the free Hobby plan's cron limit. Authorized via `CRON_SECRET` (or `BEDS24_WEBHOOK_SECRET` for manual runs).

Policy:

- This does NOT reverse the "Beds24 Webhook Strategy" decision. Webhooks remain primary/real-time; reconciliation is a low-frequency (daily) catch-up safety net, not polling. The daily cadence (vs. more frequent, which would require Vercel Pro) was chosen by the user to respect the "free/low-cost" constraint.

Reason: The user explicitly asked to prevent this class of silent ingestion miss from recurring and to document it. Daily-cron cadence confirmed by the user on 2026-06-10.

Status: Confirmed (2026-06-10). Requires `CRON_SECRET` set on the Vercel project for the cron to be authorized in production.

### Brand Palette — Ivory chrome + Navy accent (teal retired)

Decision: Replace the global brand color and shell chrome. The former teal primary
(`hsl(177 100% 24%)`) is retired; the brand accent (`--primary`) is now **deep ink
navy/indigo** (`hsl(223 46% 32%)`). The page/shell background, sidebar, and bottom tab bar
use a warm **ivory** base (`--background hsl(42 38% 96%)`); cards/sheets stay white
(`--surface`) to lift off the ivory canvas.

Scope: App-wide (mobile + admin), via `src/app/globals.css` tokens that cascade to all
`--primary`/`bg-background` usages, plus the few hardcoded teal classes in the sidebar
gradient (`mobile-shell.tsx`), the `.tabbar` (`globals.css`), and the auth login / onboarding
screens which were migrated to `--primary` tokens.

Reason: The user found the teal-dominant sidebar/bottom bar too green and requested an ivory
chrome with a harmonious non-green accent; navy was chosen for a premium, hospitality-ops feel
that pairs with ivory and unifies with the existing blue order/maintenance accents.

Notes: Semantic success greens (e.g. `emerald-*` confirmation states in announcements) were
intentionally left as functional status colors, not brand color. Mobile-shell contract docs
(`CLAUDE.md`, `docs/product/16-mobile-navigation.md`) updated to the ivory/navy base.

Status: Confirmed (2026-06-10).

## 2026-06-13

### Todo Completion Re-introduced + 완료/기록 Tab

Decision: Re-introduce task completion in the mobile Todo workspace (it had been removed in the
2026-06-12 IA cleanup) and add a **Completed (완료/기록)** top tab. Tapping a task card's status
circle completes/reopens it (undo toast); `completeTask` / `reopenTask` stamp/clear `status` +
`completed_at` + `completed_by_user_id`, write an update-log row, and (on complete) fan out a
`task_completed` notification. The Completed tab groups completed tasks by their Tokyo completion day
(`tokyoDateOf(completed_at)`), newest first.

Reason: Operators need to mark work done and review a dated completion history; the prior removal left
the existing `completed_*` columns dormant. The `task_completed` notification enum value is now active.

Status: Confirmed (2026-06-13).

### Daily Report Generator (staff-only) — free template, no LLM

Decision: Add a Korean daily work report ("업무일지") to the Todo Completed tab. A **보고서** button on
each day group calls `generateDailyReport(date)`, which gathers the caller's own completed tasks for
that Tokyo date and returns a date-headed bullet list, shown in an editable, copyable bottom sheet.

The generator is **free and template-based — no LLM, no API key, no per-use cost**. It builds the
report deterministically and applies a local `tidy()` pass for light auto-correction (whitespace,
leading bullet glyphs, punctuation spacing); the header suffix is localized (업무일지 / 業務日報 /
Daily report).

> Superseded sub-decision: an LLM-backed variant (`@anthropic-ai/sdk`, `claude-haiku-4-5`,
> `ANTHROPIC_API_KEY`) was prototyped first, but the user opted for the free template because the
> Claude consumer subscription cannot authenticate the API and pay-as-you-go billing was not wanted.
> The SDK + key were removed. Re-introducing them behind the same `generateDailyReport` contract
> remains the upgrade path if richer 맞춤법 correction is later desired. **No LLM dependency is
> currently in the stack.**

Permission — **staff-only**: `canGenerateDailyReport(role, can_generate_report)` =
`role != 'part_time_staff' OR profiles.can_generate_report = true`, enforced in the server action (a
forbidden caller gets a "권한 없음" popup). New column
`profiles.can_generate_report boolean not null default false` (migration
`202606130001_profile_report_access.sql`, applied to the linked Supabase project) is toggled per-user
by owner/office_admin in admin user management (`updateMemberReportAccess`) for the few part-timers in
a management capacity.

Status: Confirmed (2026-06-13). No env var required.

### Mobile-first login routing

Decision: the product must no longer show a manual "choose dashboard vs mobile" landing screen.
Entry routing should be automatic by device.

Rules:

- **Desktop / PC access** should go directly to the **admin dashboard/web surface**
- **Mobile / tablet access** should go directly to the **mobile app surface** (`/mobile`)
- The old root-level manual chooser / dev-style entry screen must be removed from the real product flow
- Any future "open mobile version from dashboard" behavior should live **inside the dashboard**, not on
  the public root entry screen

Implementation direction:

- On `/`, phones/tablets are redirected straight to `/mobile` instead of showing the desktop/dev
  entry chooser.
- On `/`, desktop users should be routed straight into the admin/dashboard side rather than seeing a
  version-choice landing page.
- On `/auth/login`, phones/tablets force the post-login destination to `/mobile`
  (`effectiveNext`), overriding both the role-based admin default (`state.redirectTo`) and any
  `?next=/admin/...` value.
- On mobile devices, the dev-seed login collapses to a single test-admin button labeled
  **Stay Ops E2E Admin** for local QA only.

Reason: users should never have to decide between "dashboard version" and "mobile version" on the
first screen. The correct surface should be selected automatically by device. `effectiveNext`
still flows through `signInWithEmail`/`signInWithGoogle` → `/auth/callback`
(`dest = safeNext || state.redirectTo`), so it is honored end-to-end; middleware only guards
auth and does not re-route by role, so `/mobile` sticks on phones. The desktop side should
eventually stop rendering `DevEntry` entirely and go straight to dashboard routing.

Status: Confirmed (2026-06-10), expanded on 2026-06-18. **Follow-up implementation still required
for the desktop root route to replace `DevEntry` with direct dashboard routing.**

### Bottom sheets — iOS drag-to-dismiss; header close (X) removed

Decision: All mobile **bottom sheets** share one iOS-style drag-to-dismiss interaction via a single
primitive, `useSheetDragDismiss` (`src/components/shell/use-sheet-drag-dismiss.ts`). Drag the grab
handle / header down to dismiss — release past `max(80px, 25% of sheet height)` or a downward flick
≥ 0.5 px/ms dismisses (reusing each sheet's existing slide-out + `onClose`), otherwise it snaps back;
the scrim dims in proportion to the drag. Each sheet keeps its own open/close lifecycle and only
spreads `handleProps` on the handle/header, tags the container `data-sheet`, and applies
`sheetStyle` / `scrimStyle`. Now that the slide dismisses, the **top-right close (X) buttons were
removed** from these sheets; scrim tap and Esc remain as alternate exits.

Approach chosen: a shared hook (Option A), not a `BottomSheet` wrapper component (Option B), because
each sheet has a slightly different layout / duration / close path and wrapping all of them carried a
higher regression risk than leaving each sheet's markup intact and wiring the hook in.

Scope: covered — bottom-bar editor (`mobile-shell`), Tasks quick-add / Calendar day sheet /
long-press menu (`tasks-workspace`), share picker, context picker, report sheet, project create
(`projects-board`), project members (`project-detail-view`), photo gallery (`photo-gallery`),
calendar reservation detail (`mobile-calendar-view`), and the order action sheet's draggable
(`isOrdered`) variant. Excluded (not bottom sheets) — center-aligned confirm/delete/rename dialogs,
the cleaning confirmation card, fixed action bars, the side menu, and the photo lightbox carousel.
Kept X icons that serve other roles (remove-participant, chip clear, search clear, select-mode
cancel, lightbox close, centered dialogs).

Note: sheets portal to `<body>` but React synthetic touch events bubble through the React tree into
the shell's pull-to-refresh / swipe-nav handlers, which dragged the background screen down with the
sheet; the hook stops touch propagation on the handle so only the sheet moves.

Status: Confirmed (2026-06-15). Canonical contract: Product `16` → "2026-06-15 Bottom Sheets —
iOS-style Drag-to-Dismiss".

### Todo recurrence uses real task instances

Decision: Todo recurrence is no longer label-only. Repeating tasks now generate **real `tasks` rows**
per occurrence date, tied together by `recurrence_series_id` and stamped with
`recurrence_instance_date`.

Rules:

- a repeat rule requires a date anchor (`scheduled_date` or `due_at`)
- the task the user saves is the **first real occurrence**
- future occurrences are materialized as actual rows inside the active task window
- the **latest occurrence row's** repeat rule is what continues the series forward
- clearing repeat on the latest occurrence stops future auto-generation from that point
- `custom` remains round-trip only; auto-generation runs only for the standard rules
  (`daily`, `weekly`, `monthly`, `weekdays`, `weekends`)

Reason:

- the user explicitly required repeating tasks to actually appear on their repeated dates in
  Today/Tomorrow rather than stay as a label-only reminder
- real rows preserve completion history, update-log history, and per-day visibility consistently

Status: Confirmed (2026-06-15).

## 2026-06-22

### iOS dark-mode browser chrome — themeColor pinned to ivory in both schemes

Decision: `viewport.themeColor` in `src/app/layout.tsx` is declared for **both**
`(prefers-color-scheme: light)` and `(prefers-color-scheme: dark)` with the **same ivory
`#f7f4ee`**, so iOS Safari's status bar and bottom URL toolbar stay unified with the app's ivory
chrome even when the system is in dark mode.

Reason: iOS Safari ignores a single (scheme-less) `theme-color` in dark mode and falls back to black
system chrome, which rendered the top status bar and bottom URL toolbar black. Since the app is
light-mode-only, declaring an identical dark variant forces the light design's chrome in both
schemes. This is not a design change and does not touch `mobile-shell.tsx` safe-area handling.
In-app browsers (KakaoTalk/Instagram) ignore theme-color and are out of scope.

Status: Confirmed (2026-06-22).

### Attendance / Temporary QR -> owner-only settings bridge

Decision: add a minimal **owner-only** admin-web settings page at `/admin/settings/attendance` for
attendance **site setup + QR issue/reissue**. This is a narrow bridge for real operations and QA, not
the full attendance dashboard.

Why:

- The attendance backend and worker QR flow are already live, but the only QR issuance surface was the
  local-dev-only `/api/dev/attendance/temp-qr` route.
- Operations needed a browser UI to register a real site radius/coordinates and issue a scannable QR
  without relying on a dev-only route or URL query parameters.
- Keeping it under **Settings** and restricting it to **`owner` only** preserves the documented
  authority boundary: site master and QR lifecycle are not broad admin capabilities.

Impact:

- `/admin/settings` gains an owner-visible attendance QR entry card.
- `/admin/settings/attendance` becomes the first owner-facing site/QR surface: select an existing site
  or create one, edit `name / latitude / longitude / allowed radius`, and issue or reissue the active
  QR.
- QR issuance still uses the existing atomic `issue_attendance_qr` RPC through
  `src/lib/attendance-sites.ts`; no schema or permission model changed.
- This does **not** ship the broader attendance admin dashboard (review queue, payroll totals,
  finalization UI, export UI). Those remain separate/deferred surfaces.

### Mobile sidebar scrim must leave chrome-safe transparent edge bands

Decision: the mobile sidebar dismiss scrim remains a **full-screen click target**, but its painted
overlay leaves **transparent top/bottom edge bands** instead of tinting the viewport all the way to
the first/last pixel row.

Reason: the earlier safe-area-only inset fix solved standalone/PWA notch and home-indicator bands,
but regular **Safari browser mode** still reproduced the black top/bottom chrome when the sidebar
opened. Safari chooses the status-bar / URL-toolbar tint by sampling the page's top/bottom edge
pixels, and its own browser chrome is **not** represented by `env(safe-area-inset-*)`. So a dark
scrim that still painted the literal viewport edges could make Safari darken its chrome even though
the safe-area bands were clear. Leaving transparent edge bands lets Safari keep sampling the ivory
page background in both browser mode and standalone, while preserving a full-screen dismiss target
and the same dim over the main content area. Future full-screen scrims that can coexist with Safari
chrome should follow this "transparent edge bands" rule. The bottom-sheet scrim
(`bottom-sheet.tsx`) is a separate concern and out of scope.

Status: Confirmed (2026-06-22).

### Mobile shell height rebalanced — outer shell back to `dvh`, nested wrappers `h-full`

Decision: the mobile shell no longer uses `h-svh` on all three nested containers. The **outermost**
shell returns to `h-dvh`, while the centered wrapper and inner safe-area column use `h-full` so they
inherit that single measured height instead of each binding independently to a viewport unit.

Reason: the earlier all-`svh` change avoided URL-bar-collapse jump, but on real iPhone Safari it
made the shell frame shorter than the actual visible viewport in multiple states, which exposed large
ivory gaps below the bottom tab bar and left the sidebar/footer/scrim visually floating above the
screen bottom. The underlying mistake was treating the "small viewport" as the permanent app frame.
Using `dvh` only once at the outer shell restores full-height rendering while avoiding the prior
"three nested dynamic viewports all reflow at once" amplification.

Impact:
- `src/components/shell/mobile-shell.tsx` outer `<main>` uses `h-dvh` again.
- The centered wrapper and inner column now use `h-full` instead of their own viewport units.
- This removes the bottom white-gap / floating-sidebar-floor issue seen on the home/calendar/sidebar
  screenshots in iPhone Safari.

Status: Confirmed (2026-06-22).

### Sidebar scrim now splits browser vs standalone behavior

Decision: the mobile sidebar scrim uses **different paint rules by display mode**:

- **browser mode**: keep the 1px transparent edge-row trick so Safari samples the ivory page edge
  and does not darken its own top/bottom browser chrome
- **standalone / Add to Home Screen mode**: do **not** dim the shared status/header zone or the
  bottom-tab zone; only the middle content span is darkened

Reason: one universal scrim could not satisfy both iOS modes. Browser-mode Safari needs a visible
page-edge sample to keep its chrome light, but in installed standalone mode there is no Safari URL
toolbar to protect, and a full-bleed dark overlay painted the system status bar area black. Keeping
the whole `env(safe-area-inset-*)` band transparent also exposed hard horizontal transition lines.
The real fix is mode-aware behavior, not a compromise value.

Impact:
- `src/components/shell/mobile-shell.tsx` detects standalone using
  `matchMedia("(display-mode: standalone)")` plus legacy `navigator.standalone`.
- Sidebar scrim is edge-sampled in browser mode, but in standalone it skips the top
  `safe-area + 64px header` band and the bottom tab-bar band so the drawer reads more like a native
  overlay and never paints the system top area dark.
- The sidebar panel and scrim are shell-local `absolute` layers instead of viewport-fixed layers,
  and the scrim mounts only while the drawer is open. This removes the hidden closed-state
  full-screen scrim layer that iOS standalone could keep sampling for the top status-bar paint.
- While the drawer is open, the shared top bar and bottom tab bar also slide/fade out instead of
  remaining visible under the dimmed right-edge sliver. The open state now reads as one focused
  drawer surface rather than "app chrome still visible behind a menu".
- Follow-up polish: once that shared chrome hides, standalone mode uses one continuous scrim while
  the drawer is open instead of preserving header / tab-bar / safe-area clear bands. This removes the
  bright top-right / bottom-right horizontal blocks; the scrim unmounts on close, so there is no
  hidden layer left to affect the status bar afterward.

Status: Confirmed (2026-06-22).

### Mobile side menu is now a full-screen navigation sheet

Decision: mobile sidebar navigation now opens as a **full-width slide-in sheet** instead of a
partial-width drawer with a visible dimmed right-side sliver.

Reason: the old 78% drawer kept exposing a narrow slice of the current page. In iOS standalone/PWA
mode that slice made the system status-bar area, top edge, and sidebar overlay feel visually
disconnected even after the scrim-safe-area fixes. A full-screen navigation sheet better matches the
native-feeling pattern the product wants: the menu becomes the current screen, while the status bar
remains a normal iOS system area above it.

Impact:
- `src/components/shell/mobile-shell.tsx` sidebar panel is now `w-full` and no longer carries the
  right-edge panel shadow used by the old partial drawer.
- The existing close button and slide-in/out transition remain.
- The shared top bar and bottom tab bar still hide while the menu is open.
- The sheet top starts with `var(--background)` for the first 96px before fading into the warmer
  sidebar gradient, matching the iOS status-bar / root canvas color so the top reads as one surface.

Status: Confirmed (2026-06-22).

## 2026-06-22

### Service worker introduced (installability + offline), navigations stay network-first

Decision: StayOps now ships a minimal service worker (`public/sw.js`, registered prod-only) plus a
real icon set and an `/offline` fallback, to make the installed PWA installable on Android (Chrome's
install prompt requires a SW with a fetch handler + a maskable icon) and to show a friendly offline
page instead of a blank error.

Constraint kept: the SW is **network-first for navigations** and only cache-first for content-hashed
static assets (`/_next/static`, `/icons`). The previous no-SW state had zero stale-content risk; we
preserve that for dynamic HTML/RSC so the installed app is never stuck on an old version. Static cache
is versioned (`CACHE = stayops-static-v1`) — bump to invalidate on deploy.

Also: `manifest.webmanifest` gained `id`/`scope` and `start_url` moved `/` → `/mobile` (the real
installed-app entry, dropping a launch-time redirect hop). Icons are generated from an inline SVG
brand mark (navy squircle + ivory serif "S") via `scripts/dev/generate-pwa-icons.mjs`; replace with a
real logo and re-run when one exists.

Reason: the app was previously a manifest-only "PWA" with no icons and no SW — it installed as a
manual home-screen bookmark with a blank icon, no Android install prompt, and a blank offline state.
This is part of the 2026-06-22 native standalone hardening pass (see Current Status). PWA-first
direction is unchanged; this strengthens it.

Status: Confirmed (2026-06-22).

### In-app photo lightbox instead of new-tab image links (standalone)

Decision: Mobile photo attachments (announcements, order items, linen-return records) open in an
in-app `ImageLightbox` (full-screen swipeable viewer, portaled to `<body>`) instead of
`<a target="_blank">`. In an installed standalone PWA a new-tab link ejects the user into a separate
Safari tab (or, same-window, strands them on a raw image with no back button). Genuine external
destinations (maps, shopping links, mailto/tel) intentionally still leave the app and are recoverable
via the app switcher. Future image surfaces should reuse `ImageLightbox` / `LightboxThumbs`, not
`target="_blank"`.

**2026-06-25 — pinch-zoom added.** `ImageLightbox` now supports **pinch-to-zoom (1–4×), double-tap
zoom toggle, and drag-to-pan while zoomed**, implemented directly (no library) via non-passive touch
listeners. While zoomed the carousel's native horizontal scroll is disabled (`touch-action: none` +
`overflow: hidden`) so a one-finger drag pans instead of switching photos; releasing back to 1× (or
changing slide) re-enables swiping and resets zoom. Desktop has double-click parity. Because it's the
shared viewer, all surfaces (board, announcements, orders, linen-return) gain zoom.

Status: Confirmed (2026-06-22; pinch-zoom 2026-06-25).

### Mobile route transitions via template.tsx (not a persistent-shell refactor)

Decision: iOS-style route transitions (forward = slide/fade in from the right, back = from the left)
are implemented with `src/app/mobile/template.tsx` + a tiny `src/lib/nav-direction.ts` direction
signal (the shell's `goBack()` flags "back"). We deliberately did NOT do the larger refactor of moving
`MobileShell` into a shared `src/app/mobile/layout.tsx` to persist it across routes.

Reason: several mobile routes intentionally render WITHOUT the shell (`/mobile/notifications`, the
full-screen attendance capture flow). A shared-layout shell would force the chrome onto them, so a
true persistent shell needs a route-group restructure — high risk to do without device testing. The
template approach delivers the visible native slide + (separately) inner-container scroll restoration
without that risk. The per-route shell remount (header state reset, tab highlight on-arrival rather
than instant) is a known remaining optimization, deferred. Also removed the pass-1
`mobile/loading.tsx` skeleton: with no loading boundary Next keeps the previous screen until the new
RSC is ready, which the slide then animates in — more native than a chrome-less skeleton flash.

Keyboard occlusion of fixed submit bars is handled globally via `KeyboardInsetSync` →
`--keyboard-inset` (VisualViewport), consumed by the linen-return and attendance-correction fixed bars.

### Admin wage-change effective date: today allowed, past disallowed (not "strictly future")

Decision: in the admin console's hourly-wage editor (`/admin/attendance/wages`), `setHourlyRate`
(`src/app/admin/attendance/actions.ts`) rejects `effective_from` dates **before today** (Tokyo) but now
**allows today itself**. The prior implementation rejected today too (`effectiveFrom <= todayTokyo`),
which was stricter than the documented "never retroactive" rule actually requires — today hasn't
finished yet, so setting a same-day rate isn't reinterpreting a day that already closed.

Reason: user-confirmed (2026-07-02) — past dates must stay blocked, but today must be selectable.
`getAdminAttendanceWages` now returns `minEffectiveFrom` = today (Tokyo) as the calendar's minimum
selectable date (previously computed as tomorrow); the suggested default value shown in the field is
still the 1st of next month. The internal close/replace logic in `setHourlyRate` (closing an already-
active open rate period vs. deleting-and-replacing a still-future scheduled one) is unaffected by this
change.

Status: Confirmed (2026-07-02).

### Admin attendance console month selection is a shared top control

Decision: the admin attendance console uses one shared month picker in the top attendance subnav
instead of separate page-level month controls on overview, payroll, transport, or staff detail pages.
The selected month is carried as `?ym=YYYY-MM` across overview / review queue / payroll / transport /
wages / staff detail. Month changes preserve relevant non-month panel context where useful
(`sessionId` in the review queue, selected transport `user` in transportation review).

Reason: user-confirmed (2026-07-02) while reviewing the attendance overview screenshot. Payroll,
transportation, and overview are all slices of the same monthly attendance operating context, so a
single top control reduces duplicated UI, keeps the console chrome consistent, and makes tab switching
feel like changing views on the same month rather than opening separate tools.

Status: Confirmed (2026-07-02).

### Attendance session invalidate now has an explicit, auditable reverse: restore

Decision: `invalidateAttendanceSession` (mark a session `status='invalid'`, excluding it from payroll
without deleting it) previously had no reverse path — an admin who invalidated a session by mistake had
no way to undo it from the console. `restoreAttendanceSession` (`src/app/admin/attendance/actions.ts`)
adds that reverse: it sets `status` back to `completed`, clears `invalidated_at` /
`invalidated_by_user_id` / `invalidated_reason`, and resets `review_state` to `normal`. **Restore
requires both clock ends to already exist** — an invalid session still missing a clock-out returns
`incomplete`, and the admin must fill the clock-out via 수동 정정 (`updateAttendanceSessionAdmin`)
first (refined 2026-07-02: the first cut restored to `open` when incomplete, but that silently
produced an in-progress session that never counts toward pay and contradicts the "완료 처리" label —
per user request, restore now only ever completes a session). Mandatory reason +
`attendance_session_audits` row (new `action_type = 'restore'`, added via migration
`202607020001_attendance_session_restore.sql` — extends the `attendance_session_audits.action_type`
check constraint).

UX: this is NOT a separate button. The existing "검토 완료 처리" (mark reviewed) button in the queue's
session detail panel (`attendance-queue-client.tsx` → `SessionPanel`) does double duty — when the
session's `status` is `invalid` it relabels to "복구 및 완료 처리" (restore & mark reviewed), and its
reason-modal copy switches to explain the restore, but it's the same click target and the same
`AdminReasonModal`. When the invalid session is missing a clock end, that button is **disabled** with a
tooltip directing the admin to 수동 정정 first (the panel's manual-edit form works on invalid sessions
too — it fills the clock-out while keeping the session invalid, which then unblocks restore).

Reason: user-confirmed (2026-07-02) — a worker/admin data-entry mistake shouldn't be a dead end;
if the original clock-in/out is later confirmed legitimate, the session should be recoverable without
re-creating it as a new manual session (which would lose the original clock-in/out proof + history).

Status: Confirmed (2026-07-02).

### Payroll monthly export is an accounting Excel hand-off

Decision: the payroll page's monthly export button is labeled `엑셀 내보내기` in Korean and the workbook is
treated as a tax/accounting hand-off document, not an internal review-table dump. The monthly workbook
includes staff name, work days, total recognized hours, hourly rate, approved transport reimbursement,
payroll excluding transport, and total payout including transport.

Transport reimbursement is joined from the same-month transportation review data, but only reports in
`approved` status are included in the payroll workbook totals. Pending/reviewing/rejected transport
amounts stay visible in the transportation review surface and separate transport exports, but do not
inflate the accounting payroll total.

Reason: user-confirmed (2026-07-02) — payroll Excel is primarily for tax accountant / bookkeeping
workflow. Approved transport must be visible beside pay for payment reconciliation, while wage-only and
transport-included totals must remain separate for accounting clarity.

Status: Confirmed (2026-07-02).

### Per-user payroll export uses daily detail and cleaning-room linkage

Decision: per-user payroll export in the admin payroll side panel is no longer the legacy finalized-only
CSV hand-off. It is an individual monthly Excel/PDF detail sheet with date, clock-in, clock-out, daily
work time, daily pay, approved transport, cleaned rooms, and totals.

Cleaning rooms are linked from completed `cleaning_sessions` for the same staff and date. The current
room summary rules are: Arakicho A -> `AA` + room, Arakicho B -> `AB` + room, Kabukicho -> `KK` + room,
Takadanobaba -> `T2` + room, Okubo labels unchanged, and Sky labels unchanged until its opening/data
mapping is decided.

Reason: user-confirmed (2026-07-03) — individual exports are for staff-level payroll checking, so the
sheet needs daily attendance/pay, transport, and the cleaned-room evidence that caused the work.

Status: Confirmed (2026-07-03).

Status: Confirmed (2026-06-22). Part of the native standalone hardening pass.

## i18n dead-key cleanup + status-label consistency (2026-07-07)

Decision: removed orphaned dictionary keys and one unused component surfaced by a full trilingual
(ko/ja/en) audit. All user-visible copy was already dictionary-sourced with full ko/ja parity — this
pass only deletes dead code; no behavior/UI change.

Removed:
- `src/components/foundation-preview.tsx` (unused component, not imported anywhere) and its
  `dictionary.app.*` / `dictionary.foundation.*` keys (its only consumers).
- `dictionary.devEntry.*` (no references), plus `dictionary.app.*` / `dictionary.foundation.*`, from
  both the `FALLBACK_DICTIONARY` (en base) and the `ko` override block.
- Flat duplicate success strings `admin.settings.attendanceQrIssued` / `attendanceQrReissued` /
  `attendanceSiteSaved` — the live settings UI uses the nested `admin.settings.success.*` copies.

Also: `src/app/admin/users/[id]/page.tsx` `getStatusLabel` no longer inlines ko/ja/en membership-status
labels; it now reads `dictionary.common.{active,invited,removed,suspended}`, matching the users list
page (`src/app/admin/users/page.tsx`). The "Stay Ops" wordmark stays hardcoded in the shells — it is a
brand mark, locale-invariant by design (see design-direction doc), not translatable UI copy.

Deferred follow-up: the flat `dictionary.auth.*` block (`loginTitle`, `subtitle`, `magicLinkSent`,
`welcomeBack`, `productSubtitle`, `sendMagicLink`, `signInErrorPrefix`, etc.) appears largely orphaned
by the login redesign to `dictionary.auth.console`, but at least one key (`languageSelector`) is still
referenced. It needs a dedicated audit against the current login page before removal — deliberately
NOT removed in this pass to avoid arbitrary partial deletion.

Reason: user asked for a full i18n check + cleanup (2026-07-07). Verified via lint + build + a
key-parity script that evaluates the real module and lists fallback keys lacking ko/ja overrides.

Status: Confirmed (2026-07-07).

## Annual leave admin sub-tabs — backend wiring + approver toggle model (2026-07-08)

Wired three of the four leave-console sub-tabs to real data (문서 stays design-only for stage 3):

- 팀 캘린더: bar click reuses the review-queue request detail drawer (read-only for approved), driven
  by the org-wide approved requests the client already holds — no new fetch, no new server code.
- 직원 잔여·부여: `listAdminLeaveBalances` (active non-hourly members, approved 유급/특별 usage deducted
  via `computeAnnualLeaveSummary`); drawer editor persists hire-date/grant via `saveEmployeeLeaveBaseline`.
- 승인자 관리: `listAdminApprovers` + `setLeaveApprover` write `memberships.leave_approver_role`.

Approver toggle model (confirmed with user 2026-07-08): keep the handoff's plain on/off toggle; enabling
stores `'department_head'` by default. The `department_head`(部署長) vs `senior_managing_director`(専務)
distinction only affects the stage-3 document stamp box — `is_leave_approver()` treats any non-null value
as an approver. Server guards: can't remove your own approver right (self row locked), org must keep ≥1
approver. Management writes re-verify approver via `isSessionLeaveApprover` on top of the page gate.

The 승인자 관리 소속 column has no data source (no user↔building association, same reason the queue's
branch filter was dropped) and renders "—". Hourly exclusion is by membership role (`part_time_staff`)
for now, not `employment_type_history`.

Reason: user asked to attach the backend for the leave views and add the team-calendar side panel
(2026-07-08). Verified via lint + build + browser render of each view with real-shaped mock props.

Status: Confirmed (2026-07-08).

## Developer account shows as 개발자, not 대표 (2026-07-08)

The developer (김현준) was displaying as **대표** everywhere because their session role resolves from an
`owner` org membership (`dictionary.roles.owner` = "대표"). `owner` is a real permission-bearing business
role (owner-only server actions, payroll finalization, site master), so its label must NOT be renamed.

Correct fix: register the developer as a platform admin (`platform_admins.role = developer_super_admin`).
The session already prefers the platform role (`platformAdmin?.role ?? membership?.role` in
`src/lib/session.ts`), so once registered, all session-based surfaces (mobile shell, admin sidebar,
account) auto-display "개발자 / 최고 관리자" with true top authority — no code change needed there. This
`platform_admins` insert is an access-control change, so it is handed to the user to run in Supabase
rather than executed by the agent.

Code change: the leave-console admin tables (`listAdminApprovers`, `listAdminLeaveBalances`) read the raw
membership role, so they were also surfacing "대표" for the developer. They now resolve active platform
admins (`platformAdminIdSet`) and label them `developer_super_admin`, matching the session-based surfaces
so the developer reads as "개발자 / 최고 관리자" across the whole dashboard.

Reason: user asked to show 김현준 as 개발자 (not 대표) everywhere while keeping top authority (2026-07-08).
Verified via lint + build.

Status: Confirmed (2026-07-08).

## Employment-type (시급↔정규직) management UI (2026-07-08)

Added employment-type change to the 시급 관리 console (`/admin/attendance/wages`), the last missing piece
of payroll rate/employment management (hourly-rate management via `setHourlyRate` was already built).

- Server: `setEmploymentType` (`src/app/admin/attendance/actions.ts`) — privileged
  (`isAttendancePayrollAdmin`), writes `employment_type_history` with the same no-retroactive interval
  logic as `setHourlyRate` (close active period at effective_from−1, delete a still-future pending row,
  insert the new open period), plus an `audit_logs` entry (`employment_type_set`). Blocks a redundant
  same-type change (`no_change`); a member with no history yet can be assigned a type (curType null =
  any pick is a change).
- Frontend: `attendance-wages-client.tsx` — a "고용 형태 변경" section (시급/정규직 segmented control +
  effective date + preview) above the rate editor, shown for both hourly and salaried members,
  so either can be switched to the other. On success it `router.refresh()`es and toasts. i18n
  `wagePanelEmp*` / `wageActionEmploymentDone` added ko/ja/en.
- Safety measures (added 2026-07-08, since employment change alters pay model + leave eligibility): an
  always-visible guidance note (`wagePanelEmpNote`) and a required confirmation step — "적용" opens the
  shared `AdminReasonModal` (danger-styled) with a consequence summary naming the person, target type and
  date (`wagePanelEmpConfirmDesc`) plus a reason field, so the write only happens after an explicit
  confirm. The rate editor keeps its lighter inline flow; only the employment switch is gated this way.
- Switching type leaves `hourly_rate_history` untouched — pay branches on the active employment type, so
  an existing rate stops applying once salaried and resumes if switched back (rate set separately).

Reason: user's attendance gap check flagged "no employment-type change UI"; asked to implement it first
(2026-07-08). Verified via lint + build + live render of the panel (toggle → preview/enable) on the real
authed page; the apply write was intentionally not triggered against real data.

Status: Confirmed (2026-07-08).

## Wage / employment change reasons are now viewable in the panel (2026-07-08)

Follow-up to the employment-type feature: the change **reason** entered in the confirm modal (and the rate
editor's reason) was only stored on `audit_logs.metadata.note` with no viewer. Now the 시급 관리 panel
surfaces it.

- `getAdminAttendanceWages` (`src/lib/admin-attendance.ts`) joins `audit_logs` notes back to each history
  row by `target_id` (target_type `hourly_rate_history` / `employment_type_history`), and now also returns
  a full `employmentHistory` list (was: current type only). New types: `WageHistoryEntry.note`,
  `EmploymentHistoryEntry`, `AdminWageRow.employmentHistory`. The employment select now includes `id`
  (needed for the audit join). Dev-seeded rows have no audit row, so their note is null.
- `attendance-wages-client.tsx`: each 시급 구간 이력 entry shows its reason under the period when present,
  and a new "고용 형태 이력" section (always shown, both hourly/salaried) lists each employment interval
  (type · date range · reason · current pill). i18n `wagePanelReasonLabel` / `wagePanelEmpHistoryTitle` /
  `wagePanelEmpHistoryEmpty` added ko/ja/en; `.ratelist__note` style added.
- `audit_logs` remains otherwise write-only — this is the first read of it, scoped to wage/employment
  target types. A general audit-log viewer is still not built.

Reason: user asked where the entered reason can be seen; chose to surface it on each history entry plus add
an employment-history section (2026-07-08). Verified via lint + build + live render of the "고용 형태
이력" section (seeded intervals show no reason, as expected; no real write was made).

Status: Confirmed (2026-07-08).

## 연차 문서(休暇届) 실제 생성 + 문서번호 (stage 3, 2026-07-08)

The 문서 sub-tab moved from static mock to real generation. No separate documents table — the printable
休暇届 is derived from the approved `annual_leave_requests` row; only the number is persisted.

- Migration `202607080001_annual_leave_document_number.sql` adds `annual_leave_requests.document_number`
  + a partial unique index `(organization_id, document_number)` and backfills existing approved rows.
  **Must be applied on the linked project** (Supabase SQL editor or `supabase db push`).
- Number `AL-YYYY-MM-NNN`: `YYYY-MM` = approval month (Asia/Tokyo), `NNN` = zero-padded per-org/month
  sequence. Assigned in `approveLeaveRequestForApprover` as a **best-effort** step (never blocks the
  approval; retries on a unique-violation race; silently skips if the column isn't migrated yet).
- `listLeaveDocuments` (`annual-leave-admin-server.ts`) returns approved requests that have a number,
  joined with applicant org role + approver name; resilient (returns [] if column missing).
  `leave-documents-view.tsx` now takes real `documents` + `locale`, groups by employee, and renders the
  A4 休暇届. Stamp box by `approved_role`: department_head → 部署長, senior_managing_director → 専務;
  本人 = applicant initial. 申請日 = submitted_at (Tokyo). Print = `window.print()`. Empty-state added.
- Dropped the mock "원본 신청 보기" button (was unwired). `document_number` added to `src/types/database.ts`.
  i18n `docsEmptyTitle`/`docsEmptyBody` ko/ja/en.

Reason: user asked to implement real 休暇届 generation + document numbering (2026-07-08, next attendance
gap). Verified via lint + build + live render of the 문서 view with real-shaped mock data (doc number,
approver stamp, form fields). Real page shows the empty state until the migration is applied.

Status: Confirmed (2026-07-08).

## Leave queue: list/counts refresh after approve/reject (2026-07-08)

Symptom: after approving your own request the row stayed in 승인 대기 and re-opening it showed
"이미 처리된 신청입니다." Cause: the queue list was frozen (`const [items] = useState(initialItems)`),
so an approve/reject updated the DB (and the panel) but never the client list — the stale row still
looked pending, and a second approve hit `not_requested`. Self-approval itself was never blocked
(platform admin = approver; `approveLeaveRequestForApprover` has no requester≠approver guard), so the
developer can file and approve their own request — confirmed on the real page.

Fix (`leave-queue-client.tsx`): `items` is now stateful; `handleResolved(msg, id, status)` updates the
resolved request in place, so it leaves 승인 대기, moves to 승인 완료/반려, and the status-group tab
counts update immediately. The 승인 대기 summary card (건수·일수) is now derived from the live `items`
(`liveSummary`) instead of the frozen server `summary`, so card and list always agree. Re-opening a
resolved request now shows the read-only detail (no approve/reject, since `canAct = status ===
"requested"`).

Note: a future "전무(senior_managing_director) only" approval restriction is not applied — any approver
(incl. platform admin) can still approve, by design, until that change is requested.

Reason: user tested self-file + self-approve and saw the stale "already processed" state (2026-07-08).
Verified via lint + build + real authed page (approved request now sits correctly in 승인 완료 1 / 승인
대기 0).

Status: Confirmed (2026-07-08).

_Applied to production 2026-07-08 via the Supabase connector (migration `annual_leave_document_number`); backfill assigned AL-2026-07-001 to the first approved request. Note: a platform-admin approver has `approved_role` = null, so neither 部署長/専務 stamp box is sealed for their approvals — only real 대표(department_head)/전무(senior_managing_director) approvers fill a box._

## 休暇届 도장(전자 서명) 디자인 (2026-07-09)

확인: 도장은 이름 앞글자를 딴 자동 생성 도장(빨간 원형 seal). 실제 법적 근거는 승인자 이름+승인 시각 기록(approved_by_user_id/approved_at)이고, seal은 그 시각적 표현.

결정(2026-07-09): 本人 칸은 기존대로 신청자 앞글자 자동 도장 유지. 部署長 칸은 우선 공란. 専務 칸은 실제 전무 도장을 본떠 한자 鄭을 사용 — approved_role=senior_managing_director 승인 시에만 표시. .jp__seal--smd 스타일(똑바로, 얇은 원, 글자 크게)로 촬영한 도장 사진에 맞춤. 현재 鄭은 현 전무 도장으로 하드코딩(추후 승인자별 seal 설정으로 확장 가능).

의존성: 실제 승인건에서 鄭 도장이 뜨려면 leave_approver_role=senior_managing_director 인 전무 승인자가 승인해야 함(승인자 관리 토글은 현재 department_head 기본). 플랫폼 관리자 승인은 approved_role=null 이라 部署長/専務 모두 공란.

Status: Confirmed (2026-07-09).

_2026-07-09 결정: 전무 미가입 상태이므로 専務 도장은 당분간 공란 유지(현 구현이 이미 senior_managing_director 승인 시에만 鄭 표시). 전무 가입 후 (1) 초대·가입 (2) 승인자 관리에 부서장/전무 선택 추가해 전무 지정 (3) 전무 승인 시 鄭 자동 — 순으로 진행 예정._

## 연차 잔여 모바일·어드민 완전 연동 (2026-07-09)

승인된 연차 사용분이 모바일 본인 잔여에도 반영되도록, 사용분 집계를 공용 헬퍼 `sumApprovedLeaveUsage`(annual-leave-server.ts)로 단일화. 유급(paid)->base, 특별(special)->bonus, 승인건만 합산(경조·기타 미차감). getMyAnnualLeaveSummary(모바일)·getApplicantLeaveSummary(신청 모달 미리보기)가 이제 차감하며, listAdminLeaveBalances(어드민 표)도 동일 로직 -> 세 곳 숫자 일치.

Reason: 사용자 요청 "승인 사용분 반영, 모바일과 완전 연동" (2026-07-09). Verified via lint + build + 실제 데이터 집계(유급 1일) 확인.

Status: Confirmed (2026-07-09).

## 연차 이력(승인 장부) 탭 추가 (2026-07-09)

연차 하위에 6번째 서브탭 "이력"(subTabLedger) 추가 — 모든 신청을 장부처럼 시간순으로 보는 읽기전용 표. listLeaveLedger(annual-leave-admin-server.ts)가 draft 제외 전체 상태를 반환(신청자 역할 + 처리자 이름 조인). 컬럼: 신청자·유형·기간·일수·상태·처리자·처리일시·문서번호·사유. 상태 필터(전체/승인/대기/반려/취소) + 검색 + 클라이언트측 CSV(UTF-8 BOM) 내보내기. 상태/검색 클래스는 큐(.fseg/.qsearch) 재사용.

Reason: 사용자 요청 "승인이력을 장부처럼 볼 곳" (2026-07-09, 전체 상태 포함 + CSV). Verified via lint + build + 실제 페이지 렌더(승인건 1 행: 처리자·처리일·문서번호 정상).

Status: Confirmed (2026-07-09).

## 승인 취소(revoke) + 과거 날짜 연차 신청 (2026-07-09)

**승인 취소(대시보드)** — 승인 완료 건을 취소(무효)로 되돌리는 기능.
- Migration `202607090001_annual_leave_cancel_tracking.sql` (applied to production): adds
  `cancelled_by_user_id` + `cancelled_reason` to `annual_leave_requests` (mirrors the reject columns).
- Server `cancelApprovedLeaveForApprover` (`annual-leave-approvals-server.ts`): approver-gated, only from
  `approved`, sets status→cancelled + cancelled_by/reason/at. Approved usage is keyed off
  `status='approved'`, so cancelling **auto-restores the applicant's balance** and drops the request from
  the team calendar / documents. The 休暇届 number is kept (audit) but no longer surfaces. Action
  `cancelApprovedLeaveAction`.
- Frontend: the request detail drawer (`LeavePanel`) shows a danger "승인 취소" button when
  `status==='approved'`, opening the shared `AdminReasonModal` (consequence text + optional reason). On
  success `handleResolved` flips the item to `cancelled` so it leaves 승인 완료 / disappears from the
  calendar immediately and shows in the 이력 장부 as 취소. i18n `panelBtnCancelApproval`/`actionDoneCancel`/
  `actionCancelling`/`promptCancelReason`/`errCancelFailed`.
- The 이력 장부's processor/decision-reason now covers cancelled too (`cancelled_by_user_id` →
  processor, `cancelled_reason` → decisionReason); the mobile self-cancel also records
  `cancelled_by_user_id` so employee cancels show a processor. LeaveLedgerEntry `rejectedReason` →
  `decisionReason` (reject or cancel reason).

**과거 날짜 신청** — leave can now be filed for past dates (mobile + dashboard), e.g. urgent leave taken
first, paperwork filed after.
- The server (`submitLeaveRequestAction`, `createAdminLeaveRequest`/`normalizeDays`) never rejected past
  dates, and the admin modal's native date input already allowed them — only the mobile
  `leave-date-picker.tsx` blocked past days. Removed its past-date guards (tap block, dim/disabled cells,
  prev-month/year disables). Any date (past or future) is now selectable.

Reason: user asked for (1) dashboard revoke of an approved leave [chose "취소(무효)"], and (2) backdated
requests on mobile & dashboard (2026-07-09). Verified via lint + build + real authed page (승인 취소 button
+ confirm modal render on the approved request; not executed against real data).

Status: Confirmed (2026-07-09).
## 2026-07-10 Reservation Calendar Shared Metadata / Export / Beds24 Pause

- Decision: admin reservation calendar `Building info` edits are persisted as shared
  organization-scoped metadata and must be reflected in the mobile calendar as the same source of
  truth.
- Decision: reservation calendar export is not a reservation CSV. The admin export action now opens
  an A4 landscape print surface for browser print / PDF save.
- Decision: Beds24 ingestion stays paused by default during the temporary webhook shutdown period,
  and the calendar chrome should surface this as a paused state instead of a live sync state.

## 2026-07-13 권한 부여를 사용자 화면으로 통일 / 연차 승인자 관리 탭 제거

- Decision: 모든 역할·권한 부여(급여 담당 `attendance_payroll_admin`, 연차 결재자 `leave_approver_role`,
  시간제한 권한 예외 `membership_permission_overrides`)를 **사용자 화면(`/admin/users`)으로 통일**한다.
  부여 UI 가시성은 대표(owner)·개발자 전용.
- Decision: 기능이 사용자 화면으로 이관되므로 연차 콘솔의 **승인자 관리 서브탭을 제거**한다(연차 서브탭 5개로 축소).
  백엔드 헬퍼(`listAdminApprovers`/`setLeaveApprover`)는 사용자 화면 백엔드 재사용을 위해 유지.
- Decision: 사용자 화면 재구현은 `design_handoff_permission_override` 핸드오프를 **100% 디자인만** 먼저
  구현하고, 백엔드는 **디자인 컨펌 후** 진행한다. 그때까지 `leave_approver_role`는 DB 직접 변경만 가능.

Reason: 권한/역할 관리 진입점이 연차 콘솔·사용자 화면으로 분산되어 있어 사용자 화면으로 일원화하기로 함(2026-07-13).

Status: Confirmed (2026-07-13). Step 1(탭 제거+문서) 구현 완료, Step 2(사용자 디자인) 예정.

## 2026-07-13 사용자/권한 모델 개편 — 전무 역할·상태 축소·삭제·사용자관리 접근 통제

두 권한 평면을 명확히 분리한다: **플랫폼 평면**(`developer_super_admin`, `platform_admins`, 크로스-org
최고권한)과 **조직 평면**(`memberships.role` enum). 아래는 확정 결정(2026-07-13).

- **전무(`senior_managing_director`) 조직 역할 추가.** `organization_role` enum에 추가하고 **owner와 완전
  동급(모든 권한)** 으로 취급한다. owner를 검사하는 모든 RLS/서버 게이트를 `isOrgTopAdmin = owner |
  senior_managing_director` 단일 헬퍼로 통일해 스윕(누락 방지). **연차 결재는 전무가 담당** → 연차 결재자
  부여 기본 역할값을 `senior_managing_director`로. 전무/대표는 아직 미가입 — 가입 후 개발자가 직접 부여.
- **개발자는 조직 역할 드롭다운에 넣지 않는다.** `developer_super_admin`은 플랫폼 최고권한이라 일반 역할
  부여 UI로 노출하면 권한 상승 취약점. **개발자 지정은 기존 개발자만** 가능한 별도 경로(=`platform_admins`
  기록)로 한다.
- **상태를 `active`/`inactive` 2개로 축소.** 기존 `invited/removed/suspended`는 통합(초대 흐름 확인 후
  `invited` 처리 결정). **비활성화 = 완전 차단**: 조직 접근은 이미 세션이 active 멤버십만 로드해 차단되지만,
  **로그인(Supabase auth) 차단까지** 확장한다.
- **사용자 하드 삭제 = 가드형.** 기본은 비활성화. **활동 기록(근태·급여·청소·연차 등)이 있으면 하드 삭제
  차단**(기록 파괴 방지). 삭제 허용 시 **로그인 계정(auth user)까지 함께 삭제**. 2단계 확인 UX 필수.
  실수/미활동 계정 정리용으로 한정.
- **사용자 관리 접근을 통제·위임.** `/admin/users`(+ 액션) 접근을 **개발자 기본**으로 좁히고, 개발자가
  **`manage_users` 권한을 위임**할 수 있게 한다. **재위임은 개발자만**(위임받은 사람은 화면은 쓰되 그 권한을
  남에게 넘길 수 없음). 위임자는 자기 이하 역할만 부여 가능(상승 체인 차단).
- **모든 역할·권한 부여를 사용자 화면으로 통일**(재확인). 다른 화면엔 권한 부여 UI를 만들지 않는다.

Reason: 권한 부여가 여러 화면에 흩어져 있고, 최고권한을 일반 드롭다운에 노출/하드삭제로 감사기록 파괴 같은
구조적 위험이 있어, 두 평면 분리 + 사용자 화면 단일화 + 안전 가드로 정리(2026-07-13).

Status: Confirmed (2026-07-13). 단계 구현 예정 — 스키마(enum 2개, `manage_users` 컬럼)·앱 전역 RLS 스윕·
인증 차단·가드형 삭제는 마이그레이션 적용(대표)이 필요.

## 청소/근태/사용자/예약 캘린더 4개 화면 마무리 확정 (2026-07-14)

사용자가 **청소(`/admin/cleaning`), 근태(`/admin/attendance/*`), 사용자(`/admin/users/*`), 예약 캘린더
(`/admin/calendar`)** 4개 어드민 화면을 **완전히 마무리 상태**로 확정했다. 실데이터 연동·라이브 테스트·
사용자 피드백 기반 버그 수정까지 끝난 상태이며, 추가 지시가 없는 한 이 4개 화면에 대한 선제적 리팩터·
기능 추가·디자인 변경은 하지 않는다.

- **범위**: 위 4개 화면과 그 하위 라우트(예: 근태의 `payroll`/`queue`/`roster`/`leave`/`transport`/`wages`,
  사용자의 `[id]`/`invites`)를 포함한다.
- **의미**: "완료"는 향후 변경이 전혀 없다는 뜻이 아니라, **지금 시점에서 알려진 버그·요구사항이 모두
  반영됐고 다음 작업은 사용자가 명시적으로 요청할 때 시작한다**는 뜻이다. 문서(특히
  `docs/product/07-cleaning-workflow.md`, `docs/planning/06-current-status.md`의 각 섹션)는 이 4개
  화면의 최신 구현 상태를 계속 나타내는 기준으로 유지한다.
- **적용 안 됨**: 이 4개 화면이 다른 화면(예: 신규 대시보드, 알림, 대리 신청)의 공용 컴포넌트·서버
  액션·타입을 노출하는 경우, 그 공용 자산에 대한 변경까지 막는 것은 아니다 — 공용 자산 변경이 이
  4개 화면의 동작을 바꾸지 않는 한 별도 협의 없이 진행 가능.

Reason: 청소 대시보드의 디자인 이식 → 백엔드 연동 → 사용자 라이브 테스트 기반 버그 수정(담당자 드롭다운,
KPI 로드실패 표시, 리포트 이동, 소요시간 경고 배지 제거, 지연 상태 제거 등)까지 여러 라운드를 거쳐 완료된
것을 계기로, 근태/사용자/예약 캘린더 3개도 이미 유사한 완성도에 도달했다고 판단해 함께 마무리 선언.

Status: Confirmed (2026-07-14). 상세 이력은 `docs/planning/06-current-status.md` → "Current Build Stage"의
동일 날짜 항목, `docs/product/07-cleaning-workflow.md` 하단 참고.

## 어드민 수리·점검 콘솔 — 디자인 우선 이식, 백엔드 후속 (2026-07-14)

Claude Design 핸드오프(`StayOps 수리 점검 (admin)/수리 점검 현황 (admin).html`)를 `/admin/maintenance`에
**디자인 100% 그대로** 이식하고, **데이터는 전부 목데이터**로 둔 채 백엔드 연동을 다음 사이클로 미룬다.
청소 콘솔이 밟았던 순서(디자인 이식 → 실데이터 연결 → 라이브 버그 수정)를 그대로 반복한다.

사용자 확정 사항 2가지:

- **Excel/PDF 내보내기 버튼 = 제거.** 핸드오프에 없으므로 "디자인 100% 그대로"를 우선한다. 이는
  `docs/product/05-admin-web-ia.md`의 "Excel + PDF 내보내기 — 절대 규칙"에 대한 **한시적 예외**이며,
  서버 액션(`exportMaintenanceWorkbook` / `exportMaintenanceReport`)은 삭제하지 않고 남겨 두었다가
  백엔드 연동 시 공용 `<AdminExportButtons>`로 다시 붙여 예외를 닫는다.
- **데이터 = 전부 목데이터.** 화면이 쓰는 필드(priority, category, 완료 사진, 처리 메모, completedBy,
  연동 예약/청소)가 실제 `maintenance_reports`에 아직 없다. 예외 개입(강제 완료/무효/삭제)도 현재는
  로컬 상태만 바꾼다.

부수 결정: 청소 전용 스타일시트에 있던 공용 콘솔 프리미티브(`.cviewbar` · `.lviews` · `.syncchip` ·
`.ctoolbar` · `.cstat` · `.rptile` · `.hmeta` · `.opscell__v` 상태색 · `.panel .kv`)를 `admin-console.css`로
**승격**했다 — 수리·점검이 두 번째 소비자가 됐기 때문. 복제 대신 승격을 택했다.

또한 "오래된 미해결" 기준을 재기획 문서의 24시간에서 **72시간(`OLD_HOURS`)** 으로 확정했다.

Reason: 백엔드(마이그레이션 4종 + 모바일 폼 카테고리/우선순위 교체)를 먼저 하면 화면 없이 검증이 어렵고,
청소에서 "디자인 먼저 → 데이터 나중"이 잘 동작했다.

Status: Confirmed (2026-07-14). 화면 구현 완료(`npm run lint` 0 errors, `npm run build` 통과, 3뷰·패널·
모달 브라우저 확인). 백엔드 연동은 후속 — `docs/product/08-maintenance-workflow.md` 참고.

## 수리·점검 백엔드 연동 + 모바일 현장 처리 (2026-07-14)

승인된 어드민 콘솔 디자인에 실데이터를 붙이고, **모바일 현장 처리 UI를 신설**했다. 조사 과정에서 문서에도
없던 구조적 문제가 여럿 드러나 함께 정리했다.

**사용자 확정 사항 3가지:**

- **`resolved` 폐기 → `closed`로 병합.** 상태는 접수/처리중/완료/무효 4개로 확정. 현장이 "해결"과
  "완료"를 구분할 수 없어 두 상태가 실질적으로 같게 쓰였다. 기존 `resolved` 행은 `closed`로 이동한다
  (되돌릴 수 없음).
- **모바일 현장 처리 = 전체 구현.** 상태 변경 + 처리 메모 + 완료 사진(≤5, 선택)을 한 번에 저장하는
  "현장 처리" 블록을 상세 화면에 신설.
- **무효 처리는 현장도 가능.** `part_time_staff`만 제외.

**드러난 문제 (전부 수정):**

- 신청 폼의 **카테고리·우선순위·메모가 전부 저장되지 않고 있었다.** 카테고리는 서버가 읽지 않았고
  (컬럼 없음), 우선순위와 메모는 `name` 속성이 없어 폼에 실리지도 않았다. 사용자가 고른 값이 그대로
  버려졌다.
- **모바일에 상태 변경 UI가 없었다.** 문서는 "현장이 모바일에서 처리한다"고 못박고 있었지만 구현된 적이
  없었다. 상태를 바꿀 수 있는 경로는 어드민 상세 페이지 하나뿐이었다.
- **`property_name` 컬럼에 마이그레이션이 없었다.** 타입과 코드는 이미 쓰고 있는데 DDL이 없어,
  `supabase db reset`을 하면 모바일 신청이 깨지는 상태였다.
- **상태 변경이 조용히 실패했다.** RLS가 행을 걸러내면 Supabase는 에러 없이 0행을 돌려주는데 영향 행 수를
  확인하지 않아, 권한 없는 사용자에게도 "변경됨"이라고 응답했다.
- **RLS UPDATE 정책에서 `staff`가 빠져 있었다.** 문서는 Staff의 상태 변경을 허용한다 — 문서를 정답으로
  보고 정책을 정정했다.

부수 결정: "오래된 미해결" 기준 **72시간**(`MAINTENANCE_AGING_HOURS`). 재실 중·오래된 미해결은 저장하지
않고 조회 시 파생한다. 카테고리는 **10종**으로 교체(기존 8종은 저장된 적이 없어 데이터 마이그레이션 불필요).
**Excel/PDF 내보내기는 두지 않기로 확정했다** — 수리·점검은 외부로 넘길 산출물이 아니라 현장이 처리하고
콘솔이 감시하는 운영 기록이다. 버튼과 서버 액션을 모두 삭제했고, 이는 `05-admin-web-ia.md`의 내보내기
절대 규칙에 대한 **확정 예외**다(그 규칙은 *내보내기를 제공하는 화면*이 두 포맷을 함께 내야 한다는
뜻이지, 모든 화면이 내보내기를 가져야 한다는 뜻이 아니다).

Reason: 디자인을 먼저 승인받고 백엔드를 붙이는 순서(청소 콘솔과 동일)가 검증에 유리했고, 실제로 그 과정에서
"UI는 있는데 저장이 안 되는" 유령 필드들이 드러났다.

Status: ✅ **완료 (2026-07-15 확정).** 코드 완료 — `npx tsc --noEmit` 0, `npm run lint` 0 errors,
`npm run build` 통과. 마이그레이션 `202607160001_maintenance_backend.sql` **적용 완료** — 원격
Supabase 프로젝트에서 컬럼·enum·인덱스·RLS·스토리지 정책을 직접 확인했다. 라이브 DB에 사진 첨부
테스트 신고 6건을 삽입해 신고·완료 사진의 스토리지 업로드/public 읽기까지 실검증(스토리지 정책 통과).
유일한 후속 항목인 긴급 건 푸시 알림은 프로젝트 전체 알림 단계에서 일괄 구현한다.

## 분실물 모바일 반환(현장 처리) — 수리·점검과 동일 매커니즘 이식 (2026-07-15)

Decision: 분실물도 수리·점검과 **동일한 매커니즘**(현장이 모바일에서 처리 + 감시 콘솔 + 배정 없음)을
쓴다. 손님에게 물건을 넘긴 결말을 담는 **`returned`(반환완료)** 상태를 신설하고, **등록자와 무관하게
누구나(파트타임 제외) 모바일에서 반환 처리**할 수 있으며 처리자·시각이 기록으로 남는다.

Reason: 기존 4상태는 "폐기"로만 끝나 물건이 주인에게 돌아가는 결말을 담지 못했다. 무인 숙소 특성상
물건을 쥔 현장 스태프가 그대로 반환하므로, 반환을 모바일 현장 처리로 두는 것이 실제 운영과 맞는다.
반환은 되돌릴 수 없어 저장 전 canonical BottomSheet로 완료 확인한다.

Scope: **이번은 모바일까지.** 대시보드(어드민)의 반환 이력 표시·예외 개입 UI는 후속. 무효·삭제 같은
예외 개입은 어드민 몫(모바일 처리 화면에는 없음).

Status: 코드 완료 — `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과. 디자인
(Claude Design 핸드오프) 100% 이식. **마이그레이션 `202607170001_lostfound_return.sql`은 대표님이
Supabase 대시보드에서 적용**해야 한다(수리·점검과 동일) — 적용 전에는 화면이 없는 컬럼을 읽으려다
깨진다. 적용 후 라이브 E2E 1회 권장.

## 어드민 공지 관리 콘솔 재구현 — Claude Design 1:1 이식 (2026-07-23)

Decision: `/admin/announcements` 를 2026-07-22 재기획 명세대로 **공용 운영 콘솔 패턴**으로 재구현했다.
좌측 고정 생성 카드 → KPI 요약 바(게시중/초안/중요/팝업/중요·미읽음) + Published/Drafts/Archived 3
상태 세그먼트 + 고밀도 목록 표 + 우측 상세 패널 구조. 상세 패널은 **작성 zone ↔ 운영 zone** 권한 분리
UI 를 가지며, 새 공지/편집·게시/재게시/보관/초안 복귀/삭제 확인·읽음 현황(대상자 명단)·이미지 뷰어 모달을
포함한다. 데이터 모델(`announcements` 테이블, 3 상태, 대상 scope/roles, 중요/고정/팝업+`popup_until`,
읽음 추적)은 기존 그대로 재사용했고 스키마 변경은 없다.

Reason: 주문·분실물·수리 콘솔과 동일한 대시보드 콘솔 계약(§4)에 공지도 맞춰, 어드민을 모바일 공지의
배포·감사 관리 표면으로 정리하기 위함. Claude Design 핸드오프("StayOps 공지 관리 (admin)")를 StayOps
admin-console.css 토큰·공유 primitive 위에 1:1 이식했다.

Scope: 신규 `src/lib/admin-announcements.ts`(도달/읽음 파생 지표 배치 로드), 결과 반환형 서버 액션 4종,
`announcement-i18n.ts` `console` 네임스페이스(ko/ja/en), `src/components/admin/announcements/*`
(+`announcements-console.css`), `page.tsx` 재작성. 콘솔 페이지에서 앱-오픈 팝업 미리보기 +
고아 이미지 정리 버튼 UI 제거(서버 로직 유지). `/admin/announcements/[id]` 상세 + 기존 redirect 액션은
긴 본문/직접 진입 fallback·레거시로 유지. 댓글은 콘솔에 포함하지 않음(방향성 유지).

Status: 코드 완료 — `npm run lint` 0 errors, `npm run build` 통과. 마이그레이션 없음(기존 스키마 재사용).
문서 동기화: `docs/product/11-announcement-workflow.md`, `docs/product/05-admin-web-ia.md`,
`docs/planning/06-current-status.md`.

## 투두 날짜 모델 단일화 + Todoist식 통합 일정 피커 (모바일, 2026-07-24)

Decision: 투두 작업의 **날짜를 1개로 단일화(A안)**하고, 날짜·시간·반복을 **하나의 통합 피커
(BottomSheet)**로 합쳤다. Todoist 데스크톱 날짜 팝오버를 벤치마크로, 빠른 옵션(오늘·내일·다음 주·
다음 주말·날짜 없음) + 인라인 달력 + 시간/반복을 한 시트에서 처리한다.

Reason: 기존 예정일 + 마감일 2개 날짜는 현장 실사용에서 거의 안 쓰이고 UI만 무겁게 했다. 대부분
"이 날 해라/이 날까지"만 필요하므로 Todoist처럼 단일 날짜가 명료하다. 시간·반복이 "더 보기"에 숨어
있던 것도 한 피커로 끌어올려 깔끔하게 했다.

Scope: 단일 날짜는 내부적으로 **기준일(`due_at`)**에 매핑(앱의 anchor가 이미 due 우선). `scheduled_date`
컬럼은 유지(마이그레이션 없음) — 레거시 예정일-only 작업은 anchor로 계속 표시되고, 폼으로 편집하면
due-only로 수렴. 신규 컴포넌트 `task-schedule-sheet.tsx`(`TaskSchedulePicker`), 폼(`task-create-form.tsx`)
재구성(2날짜 탭·"더 보기"의 시간/반복 제거 → 일정 칩 + 시트), 이동/빠른생성 액션 4종을 due_at 기준으로
정렬(이동은 시간 보존 + 반복 인스턴스 재앵커), i18n `schedule*` 키(ko/ja/en), 상세의 날짜 라벨을 중립
"일정"으로. DB 스키마 변경 없음. 대시보드 투두는 이 모바일 정리 이후 착수 예정.

Status: 코드 완료 — `npm run lint` 0 errors, `npm run build` 통과. 문서 동기화:
`docs/product/18-todo-task-workflow.md`, `docs/engineering/09-todo-task-technical-design.md`.

## 투두 시간 블록(기간) + 매년 반복 — Todoist식 시간/반복 서브피커 (모바일, 2026-07-24)

Decision: 통합 일정 시트의 **시간**·**반복** 서브피커를 Todoist에 맞춰 마저 다듬었다.
(1) **기간(duration)** — 시각이 있는 작업에 같은 날 안의 **시간 블록 길이**(기본 "기간 없음", 15분/30분/
1시간/2시간/사용자 정의)를 부여. 신규 nullable 컬럼 `tasks.duration_minutes`. 시각이 없으면 서버에서
null 강제(멀티데이 아님 — 단일 날짜 유지). (2) **반복** — 선택 날짜 기준 **문맥형 목록**(매주 {요일}/
매월 {일}일/매년 {월 일} 등)으로 바꾸고, **`매년`(yearly) 규칙을 엔진에 신규 추가**. 목록에서 "주말마다"는
제외(엔진/레거시 표시는 유지).

Reason: 대표님이 Todoist의 시간(기간)·반복 서브피커를 벤치마크로 제시. "기간 동안 투두가 있어야"는
같은 날의 시간 블록(A안)으로 해석 — 현장 투두에 맞고 단일 날짜 모델을 안 깬다. 반복 문맥형 라벨은
실제 요일/일자를 보여줘 의미가 명확하고, 연 단위 정기 업무를 위해 매년을 추가.

Scope: 마이그레이션 `202607240001_task_duration.sql`(대표님 Supabase 적용), `src/types/database.ts`,
`src/lib/tasks.ts`(TaskRecord.durationMinutes + TASK_SELECT + yearly 엔진 `shiftYearlyYmd`),
`createTask`/`updateTaskCore`(duration 파싱·가드), 시트(`task-schedule-sheet.tsx`) 시간/반복 재구성,
폼·편집페이지·카드·상세 표시(시간 블록 HH:MM–HH:MM), i18n `duration*`/`repeat*On`/`repeatYearly`
(ko/ja/en). 표시 helper에 yearly 매핑.

Status: 코드 완료 — `npm run lint` 0 errors, `npm run build` 통과. **마이그레이션 적용 전에는
`duration_minutes` 컬럼이 없어 저장/조회가 깨지므로 배포 전 Supabase 적용 필수.** 문서 동기화:
`docs/product/18-todo-task-workflow.md`, `docs/engineering/09-todo-task-technical-design.md`.

## 대시보드 Todoist 기획 확정 — 심플(모바일 코어 + 업무 지시) (2026-07-24)

Decision: 어드민 웹 Todoist는 **모바일 Todoist 코어 기능을 큰 화면에서 그대로 + 사무실 "업무 지시"
하나**로 심플하게 간다. 다른 어드민 모듈(주문·분실물·수리·공지)의 "관리형 콘솔" 패턴이 아니라 Todoist
본연의 개인 워크스페이스(레이아웃도 Todoist 데스크톱식)를 따른다.

- **성격**: 모바일 전 기능 패리티 + 업무 지시. 관리자 분석/오버사이트(팀 KPI·워크로드·업무일지 취합),
  저장된 필터·라벨·전역 검색 등 부가기능은 **미포함**(번거롭지도 무겁지도 않게).
- **정식 담당자(assignee): 미도입** — 향후 확장 후보. 지금은 업무 지시로 충분.
- **업무 지시(Work Directive)**: 정식 담당자 개념 신규 대신 **기존 공유(참여자) 모델을 "한 명에게
  지시"로 재사용**. 매니저=지시자(작성자), 대상=수행자(참여자). 받는 사람 쪽에 **"[매니저] 지시" 표식**을
  명확히(peer 공유와 구분되게 가벼운 지시 플래그 1개 정도). 이 표식은 새 대시보드 기능의 "모바일 수신
  절반"이므로 모바일 종료 상태를 다시 여는 게 아님.
- **동기화**: 같은 DB·같은 서버 액션 → 모바일↔대시보드 자동 반영(별도 계층 없음).
- **라우트**: 신설 `/admin/tasks`(사이드바 "Todoist"), legacy `/admin/recurring-work` 리다이렉트.
- **모바일**: 2026-07-24 기준 first-slice 기능 완료로 개발 종료(단일 날짜 통합 피커 + 기간 + 문맥형
  반복/매년 + 지난-작업 일정변경 피커). 대시보드는 이걸 토대로 기획.

Reason: 대표님 방향 — "투두는 번거롭거나 무거우면 안 되고, 투두의 목적만 심플하게." 관리형 오버사이트를
얹으면 Todoist 철학과 어긋나고 무거워짐. 업무 지시는 공유 재사용이라 모델·모바일 변경이 사실상 0.

Status: **기획 문서만 작성(코드 없음).** 스펙: `docs/product/28-admin-todoist-console.md`. 교차 참조
갱신: `docs/product/18-todo-task-workflow.md`, `docs/product/05-admin-web-ia.md`. 디자인은 대표님이 이
문서를 기준으로 직접 진행.

## Todoist 삭제 = soft-delete + 되돌리기(실행 취소) 토스트 (2026-07-29, 오너 승인)

Decision: 작업(task) 삭제를 **hard-delete → soft-delete(`deleted_at`)** 로 전환하고, 완료·삭제 시
**"실행 취소" 토스트**로 되돌릴 수 있게 한다(Todoist 방식). **삭제 정책 변경은 오너 명시 승인**(규칙 9).
- **DB**: 마이그레이션 `202607290001_task_soft_delete` — `tasks.deleted_at timestamptz` + 부분 인덱스
  (프로덕션 적용 완료). 모든 목록/상세 조회가 `deleted_at is null` 필터(RLS 아님 — RLS는 삭제행도 보이므로
  작성자가 복구 가능). 자동 정리(purge)는 아직 없음(향후 크론).
- **삭제 액션**: 콘솔 deleteConsoleTask/leaveConsoleTask(author), 모바일 deleteTask/deleteTasksInList/
  removeTaskParticipant(author-self)/dismissOverdue(one-off)/섹션 삭제 → `deleted_at` 세팅. 생성 롤백 삭제는
  하드 유지. 복구: restoreConsoleTask / restoreTask(삭제행 직접 조회 + 작성자 검증 후 `deleted_at=null`).
- **되돌리기 토스트**: 완료 → "완료했습니다"(+반복이면 "다음: {날짜}") · 실행 취소(reopen). 삭제 → "삭제했습니다"
  · 실행 취소(restore). 대시보드는 다크 하단-좌측 `.undobar`(신규), 모바일은 기존 완료 토스트 확장 + 삭제는
  `?deleted=<id>` 리다이렉트로 리스트 토스트. 6초 자동 소멸 + X.
- **확인 모달 처리**: 단일 작업 삭제는 확인 모달 제거 → **즉시 삭제 + 되돌리기**(대시보드). 나가기·지난 정리
  (벌크)는 확인 모달 유지. 프로젝트/섹션 삭제는 기존 확인 유지.
- 문서: `docs/engineering/04-data-model`·`05-rls-permissions`, `docs/product/18`·`28`, CLAUDE.md 규칙 9 갱신.
`npm run lint`(0 errors)/`build` 통과.

## 모바일 Todoist 디버그 QA — yearly 반복 데이터 손실 외 (2026-07-29)

정적 전수 감사 후 실사용 버그 수정:
- **[높음/데이터 손실] yearly 반복 규칙이 두 lib 간 불일치**: `tasks.ts`의 `STANDARD_RECURRENCE_RULES`는
  yearly 포함(create/edit/complete 처리 O)인데 client-safe `tasks-recurrence.ts`엔 누락 → 오버듀 yearly
  작업에 "지난 미완료 삭제" 시 `isStandardRecurrence("yearly")===false`로 **영구 삭제**되던 버그.
  `tasks-recurrence.ts`에 yearly + `shiftYearlyYmd` + `nextOccurrence` 분기 추가해 `tasks.ts`와 단일화
  (두 파일 sync 필수 주석). 캘린더 미리보기·reschedule 데스싱크도 함께 해소.
- **[중] 캘린더 날짜 시트가 반복 확장 안 함**: 달력 셀엔 보이는데 날짜 탭 시 시트가 비던 문제 →
  `renderDaySheet`를 캘린더 셀과 동일한 `recurringOccurrencesInRange` 확장으로 정렬.
- **[중] 프로젝트 상세 완료 토글 미반영**: `completeTask`/`reopenTask`가 프로젝트 경로를 재검증 안 함 →
  `revalidateProjectPath(task.projectId)` 추가(4개 경로).
- **[낮] 공유/초대 검색 대소문자 구분**(share-picker/projects-board) → toLowerCase 비교.
- **[낮] 오버듀 일괄 선택에 남의 작업 포함**(카운트 과대) → `toggleOverdueTask`를 owned로 제한.
- **[낮] SharePicker 전원 해제 불가** → 기존 선택이 있던 경우 0명 적용 허용.
- **[후속 2026-07-29] 업무일지(보고서)에 반복 완료 포함**: 반복 완료는 `status=completed`가 아니라
  `task_updates`의 `completed` 이벤트로만 남으므로 보고서에서 누락됐음. `generateDailyReport`를 그날의
  `task_updates` 완료/재오픈 **net(완료−재오픈)** 집계로 재작성 → 반복 완료(매일 청소 등) 포함 + 같은 날
  undo는 상쇄. 대시보드 콘솔 보고서도 위임이라 동일 적용. (완료·기록 **탭**은 여전히 status 기준 — 탭은
  상태 뷰, 보고서는 업무 로그로 역할 분리, 문서화.)
- 미수정(설계상 수용): 늦게 완료한 반복 작업 undo는 원래 오버듀 날짜가 아닌 직전 회차(대개 오늘)로 복구
  — 단일 행 stateless 설계(사전 인스턴스 미저장)의 수용된 트레이드오프로 문서화.
`npm run lint`(0 errors)/`build` 통과. `docs/product/18` 갱신.

## 관리함 = 프로젝트 밖 모든 활성 작업 (Todoist Inbox 모델, 모바일·대시보드 정렬) (2026-07-29)

Decision: 벤치마크(Todoist)처럼 **관리함(Inbox) = 프로젝트에 속하지 않은 모든 활성 작업**(날짜 유무 무관)으로
확정. 오늘/내일은 이 집합의 **필터**(날짜 있는 작업은 관리함·오늘 동시 노출). 프로젝트 작업은 프로젝트 뷰에만.
- **모바일**: 이미 이 모델(`page.tsx`가 `!projectId`로 분리 + 관리함=`isActive` 전체, 문구도 "모든 할 일 관리").
  변경 없음.
- **대시보드**: 관리함을 `is_inbox`(날짜 없는 것만)로 필터하던 것을 수정 → `personalTasks=tasks.filter(!projectId)`
  로 오늘/내일/관리함/공유함/지시/캘린더/레일을 프로젝트 제외 집합으로 렌더. `moveConsoleToInbox`=프로젝트에서
  빼기(날짜 유지). `is_inbox` 컬럼은 뷰를 안 가름(잔존). 완료·기록만 전체 기준(프로젝트 완료 포함).
- 문서: `docs/product/18` §Inbox, `docs/product/28` §4·§12 갱신. `npm run lint`/`build` 통과.

## 어드민 Todoist 콘솔 구현 착수 — Claude Design 이식 (2026-07-27)

Decision: 대시보드 Todoist 콘솔을 Claude Design 핸드오프("StayOps 투두 (admin)") 기준으로 구현 시작.
`/admin/tasks` 신설(legacy `/admin/recurring-work`는 리다이렉트), 사이드바 "Todoist" 활성. 기존 tasks
백엔드(getVisibleTasks/getVisibleProjects/getShareableUsers + task 액션)를 재사용하고, 결과 반환형 콘솔
액션(`src/app/admin/tasks/actions.ts`) + 데이터 로더(`src/lib/admin-tasks.ts`)를 얹는다. 단일 날짜 모델·
기간·문맥형 반복은 모바일과 동일. base.css가 StayOps admin-console.css와 동일 디자인 시스템이라 AdminShell
셸을 재사용하고 todo.css의 투두 전용 스타일만 이식.

업무 지시: 새 컬럼 `tasks.is_directive`(마이그레이션 `202607270001_task_directive.sql` — Supabase 적용
완료). author=지시자, 대상=참여자. 보낸 지시는 보낸 사람 개인 뷰에서 제외(myOwn 필터), 콘솔의 "지시" 탭
(보낸/받은) + 받은 지시 "[매니저] 지시" 표식으로 노출. 담당자(assignee)는 미도입.

Status: 구현 중. 마이그레이션 적용 완료. 기준 문서 `docs/product/28-admin-todoist-console.md`.

**완료 (2026-07-27):** 콘솔 전량 구현·통합·검증 완료. `src/components/admin/tasks/`
(`admin-tasks-console.tsx` 메인 + `helpers.ts` 클라이언트 안전 Tokyo 날짜/술어 + `admin-tasks-console.css`
디자인 포팅). 뷰: 오늘/내일/관리함/지시(받은·보낸 세그)/공유함/캘린더/완료·기록 + 프로젝트 + 우산 레일 +
인라인 추가 + 상세 슬라이드오버 + 일정/우선순위/공유(대상) 팝오버 + 새 프로젝트/보고서 모달. 콘솔 액션에
`getConsoleTaskDetail`·`getConsoleProjectDetail` 추가, 날짜 없는 빠른추가는 `is_inbox` 저장. i18n
`admin-tasks-i18n.ts`(ko/ja/en). 확정 디자인은 지시 전용 화면 대신 **콘솔 "지시" 탭으로 통합**(구 §7.2
개정). CSS 충돌 3종 리네임(`.subnav→.tsubnav`/`.empty→.tempty`/`.wgrid→.tgrid`). 공용 콘솔 계약(§4/4a/4b)은
Todoist 독립 시각 언어로 의도적 미적용(문서화). 의도적 축소: 인라인 사진·태그 입력 없음, yearly 반복 제외
(백엔드 미지원), 리마인드/답장은 상세 열기로. `npm run lint`(0 errors)·`npm run build`(`/admin/tasks` 생성)
통과. As-built 상세 → `docs/product/28-admin-todoist-console.md` §12.

## 2026-07-29 근태 subnav — 탭 간 시각 일관성 확정

**결정.** `/admin/attendance/*`의 공통 subnav는 어느 탭이 열려 있든 동일한 모습을 유지한다. 사용자가
"연차만 누르면 버튼색·위치가 달라진다"고 보고한 문제를 세 축으로 정리해 확정했다.

1. **배지 누락 금지.** 7개 페이지 전부 `getAdminAttendanceBadgeStats`로 `queue`/`payroll`/`transport`
   배지를 넘긴다. 연차 페이지만 `badges`를 안 넘겨 숫자 칩이 사라졌고, 그만큼 뒤 탭들이 왼쪽으로
   밀려 "탭 위치가 움직이는" 현상이 생겼다 → 수정.
2. **활성 탭 스타일 단일화.** 출근자 명단에만 붙던 solid navy CTA 스타일(`.subnav__t--entry`,
   `admin-console.css` + `attendance-subnav.tsx`의 조건부 클래스)을 **삭제**했다. 7개 탭이 모두
   연한 primary 칩(`.subnav__t.on`)으로 활성화된다.
3. **우측 컨트롤은 피커 or 없음.** 월 스코프 → `AdminMonthPicker`, 운영일 스코프 → `AdminDatePicker`,
   스코프 없음(연차) → 렌더링하지 않음. 기존의 정적 텍스트 폴백은 제거했다 — 좌측 페이지 제목과
   같은 문자열(`lc.header`)을 그대로 반복해 화면에 두 번 나왔고, 그 탭만 다른 컴포넌트처럼 보였다.
   `AttendanceSubnav.monthLabel`은 선택적 prop이 되어 피커 `aria-label` 용도로만 남는다.

**대안 검토.** 연차에도 월 피커를 넣어 완전히 동일한 컨트롤을 두는 안은 기각 — 연차 승인 큐는 월로
필터되지 않아 아무 효과 없는 버튼이 된다. 반대로 배지만 고치고 텍스트를 유지하는 안도 기각(제목 중복).

**변경 파일**: `src/app/admin/attendance/leave/page.tsx`, `src/components/admin/attendance/attendance-subnav.tsx`,
`src/components/admin/admin-console.css`. i18n·DB 변경 없음. `npm run lint`(에러 0) / `npm run build` 통과.
문서: `docs/product/05-admin-web-ia.md`(근태 subnav 계약 3항 추가).

## 2026-07-29 투두이스트 일괄 삭제 — 선택 모드 확정

**결정.** `/admin/tasks` 목록에 선택 모드 + 일괄 삭제를 추가한다. 네 가지를 확정했다.

1. **진입은 필터 바의 "선택" 토글 칩.** 호버 시 체크박스가 나타나는 Gmail 방식은 왼쪽에 이미 있는
   완료 토글과 헷갈려서 기각. 모드가 명시적이라 오삭제 위험이 가장 낮다.
2. **"전체 지우기" 전용 버튼은 만들지 않는다.** "전체 선택 → 삭제"로 같은 일을 하되, 오클릭 한 번에
   목록이 날아가지 않는다.
3. **남의 작업(공유·지시받음)은 삭제가 아니라 "나만 빠지기".** 참여자에게 남의 작업을 지울 권리가
   없다는 기존 `deleteConsoleTask` 규칙을 일괄 경로도 그대로 따른다. 나가기는 되돌릴 수 없으므로
   확인 모달에 명시하고 실행 취소는 내가 만든 작업에만 건다.
4. **전용 서버 액션 `bulkDeleteConsoleTasks(ids)` 신설.** 기존 "지난 미완료 삭제"가 쓰던 클라이언트
   `for` 루프(작업 수만큼 서버 왕복)도 이걸로 교체했다. 부분 실패를 `failedIds`로 보고한다.

부수 정리: 작업이 소프트 삭제로 바뀐 뒤로 사실이 아니었던 `confirmClearMsg`의 "되돌릴 수 없습니다"
문구를 ko/ja/en에서 걷어냈다.

**변경 파일**: `src/app/admin/tasks/actions.ts`, `src/components/admin/tasks/admin-tasks-console.tsx`,
`src/components/admin/tasks/admin-tasks-console.css`, `src/lib/admin-tasks-i18n.ts`. DB 변경 없음.
`npx tsc --noEmit` 0 / `npm run lint` 0 errors / `npm run build` 통과.
As-built 상세 → `docs/product/28-admin-todoist-console.md` §14.

## 2026-07-29 (후속) 투두이스트 선택 바 — 공용 `.bulkbar` 미채택

바로 위 결정의 구현에서 다중 선택 바를 공용 `.bulkbar`(근태 검토 큐와 동일)로 만들었다가, 사용자가
실제 화면을 확인한 뒤 되돌렸다. 두 가지가 깨졌다.

1. **정렬.** `.bulkbar`와 `.filt`가 놓이던 자리는 `.tgrid` 바깥이라 전체 폭이다. 우측 요약 레일 위까지
   뻗어 작업 리스트 카드와 세로선이 맞지 않았고, "선택" 칩도 `flex:1` 스페이서 때문에 리스트를 지나
   화면 끝까지 날아갔다.
2. **톤.** 솔리드 네이비 채움이 투두이스트 콘솔의 밝은 카드 언어와 충돌했다.

**확정.** 선택 바는 이 콘솔의 지연 배너(`.odbanner`) 골격을 primary 톤으로 재사용한 `.selbar`로
만들고, `.wcol` **안**에서 렌더해 리스트 카드와 같은 폭에 세운다. "선택" 칩은 필터들과 같은 줄에
인라인으로 둔다.

이는 `docs/product/28-admin-todoist-console.md` §11이 명시한 "투두이스트는 독립 시각 언어" 방침과
일치한다 — 공용 콘솔 프리미티브 재사용이 항상 옳은 것은 아니며, 이 화면에서는 레이아웃 컨테이너가
달라 재사용이 오히려 정렬을 깨뜨렸다.

`npx tsc --noEmit` 0 / `npm run lint` 0 errors / `npm run build` 통과.

## 2026-07-29 투두 반복 — 사용자 지정 요일 추가

**결정.** "매주 월·수·금"처럼 사용자가 직접 요일을 고르는 반복을 추가한다. 기존 표준 6종
(`daily`/`weekly`/`monthly`/`yearly`/`weekdays`/`weekends`)에 이어지는 7번째 선택지다.

1. **저장은 기존 text 컬럼 재사용, 마이그레이션 없음.** `tasks.recurrence_rule`에
   `custom:1,3,5`(0=일…6=토, 중복 제거 + 오름차순) 형태로 넣는다.
2. **요일 없는 bare `custom`(레거시)은 건드리지 않는다.** 스케줄 정보가 없는 값이라 계속
   round-trip 전용으로 두고, 새 요일 규칙과 별개 값으로 공존시킨다.
3. **요일 0개는 저장 불가.** 어드민 적용 / 모바일 완료 버튼을 잠근다. 모바일 시트는
   commit-on-close라 버튼만으로 부족해서, 드래그로 닫아도 미완성 규칙이 `""`로 정규화된다.
4. **모바일도 편집까지 지원.** 표시만 하면 어드민에서 만든 반복을 모바일에서 못 고치는 반쪽이
   되므로 요일 선택 UI를 양쪽에 넣었다.

**가장 큰 함정 — 쌍둥이 파일 어긋남.** `STANDARD_RECURRENCE_RULES`가 `src/lib/tasks.ts`(서버)와
`src/lib/tasks-recurrence.ts`(클라이언트)에 쌍둥이로 존재하고, 후자의 헤더가 경고하듯 **한쪽에만
있는 규칙은 지난 작업을 하드 삭제시킨다**(서버는 롤포워드, dismiss 분기는 클라이언트 판정을 보고
삭제). 커스텀 규칙의 파서·판정·요일 포맷을 `tasks-recurrence.ts` 한 곳에만 두고 서버가 그걸
import하게 만들어, 이 어긋남을 구조적으로 불가능하게 했다.

**서버 검증도 함께 열었다.** `resolveRecurrenceRule`이 `custom:…`을 재파싱 후 재직렬화한다 —
조작된 `custom:5,1,1`은 `custom:1,5`로, `custom:9`는 `null`로 정규화된다.

**변경 파일**: `src/lib/tasks-recurrence.ts`, `src/lib/tasks.ts`,
`src/components/admin/tasks/{helpers.ts,admin-tasks-console.tsx,admin-tasks-console.css}`,
`src/components/tasks/{task-schedule-sheet.tsx,task-card.tsx,task-detail-view.tsx,tasks-workspace.tsx}`,
`src/lib/{admin-tasks-i18n.ts,i18n.ts}`. **DB 마이그레이션 없음.**

**검증**: `npx tsc --noEmit` 0 / `npm run lint` 0 errors / `npm run build` 통과. 추가로 반복 계산을
런타임 스크립트로 확인했다 — 파싱 정규화, 범위 밖 요일 거부, bare `custom` 미인식, 앵커 포함 여부가
기존 `weekends` 규칙과 동일함(`custom:0,6` === `weekends` 출력 일치)까지 검증.
As-built 상세 → `docs/engineering/09-todo-task-technical-design.md` → "사용자 지정 요일 반복".

## 2026-07-30 투두 반복 — 롤포워드 폐지, 날짜별 독립 회차 모델로 전환

**배경.** 기존 모델(2026-06-16, Todoist식 "단일 살아있는 행 + 완료 시 롤포워드")은 운영 현장과
맞지 않았다. 반복 업무는 "지금 하나만 처리하고 다음으로 넘기는 리마인더"가 아니라 **각 날짜의
독립 의무**(매일 청소·재고·매출 시트)다. 완료해야만 다음 날짜로 넘어가서, 오늘 걸 안 하면 내일
회차가 안 보이고, 날짜별 완료/미완료를 감사할 수 없었다. 사용자 요구: "반복이 5개면 내일도 5개가
보여야 한다. 완료해야만 넘어가는 게 아니라."

**결정 (2026-06-16 롤포워드 결정을 대체).**

1. **롤포워드 완전 폐지.** 반복 업무 = 고정된 규칙 정의(행 1개 + `recurrence_rule` + 고정 앵커
   `recurrence_instance_date`). 완료해도 행의 날짜가 바뀌지 않는다. 회차(occurrence)는 규칙으로
   계산되는 가상 날짜.
2. **날짜별 독립 회차.** 지정된 각 날짜에 회차가 독립적으로 표시된다(오늘/내일/캘린더/날짜 시트).
   완료 여부와 무관하게 다음 날짜 회차도 보인다.
3. **회차별 완료 상태는 새 테이블 `task_occurrence_state`가 정본.** 반복 행의
   `status`/`completed_at`은 더 이상 완료를 의미하지 않는다(일회성 작업 전용). 마이그레이션
   `202607300001_task_occurrence_state.sql`.
4. **지연(overdue)은 영구 유지 — 자동 놓침/자동 삭제 없음.** 연차·연휴·업무 사정으로 며칠이
   밀려도 사라지지 않는다. overdue 회차 = 과거 지정일인데 미완료·미해결(skipped/moved 아님) 회차.
   오늘 지연 섹션에 **작업별 1건으로 묶어** "○○ · N일 밀림"으로 표시한다.
5. **지연 처리 2택.** (a) **삭제** = 그 작업의 미해결 지연 회차를 전부 `skipped`로 기록(시리즈는
   계속, 영구 보존, 재등장 없음). (b) **오늘로 가져오기** = 미해결 지연 회차를 `moved`로 기록하고
   **오늘 날짜의 carry-over 일회성 작업 1건**(제목·컨텍스트 복사, 비반복)을 생성한다. 시리즈는
   그대로 이어진다.
6. **집계 소스도 회차 기준으로.** 완료탭·업무일지 보고서·"오늘 완료" 카운트는 반복의 경우
   `task_occurrence_state`(state=completed)를 **occurrence_date 기준**으로 집계한다. 일회성은
   기존대로 `tasks.status`/`task_updates`. (기존 `task_updates` completed/reopened 로그는 상세
   활동 로그 용도로 계속 기록.)
7. **모바일 + 콘솔 동일 적용.**

**carry-over를 합성 회차가 아니라 일회성 작업으로 만든 이유.** "오늘로 가져오기"를 회차 리졸버에
"moved→today 합성 회차"로 주입하는 방식도 검토했으나, 회차를 계산하는 모든 지점(오늘/내일/캘린더/
시트/카운트)에 특수분기가 번져 회귀 위험이 컸다. 대신 **기존 일회성 작업 머신(렌더·완료·undo·
보고서·삭제)을 그대로 재사용**하는 carry-over 일회성 생성이 특수분기 0으로 가장 안전하다.

**기존 데이터 처리.** 이미 롤포워드된 행의 `recurrence_instance_date`(및 due/scheduled)는 규칙
위상을 이미 올바르게 인코딩하므로 **그대로 고정 앵커로 동결**한다(추가 이동 없음). 과거 완료
이력은 어느 occurrence_date였는지 복원 불가라 `task_occurrence_state` 백필은 하지 않는다 — 과거
완료는 기존 `task_updates`(created_at일)로 히스토리에만 남는다. **자동 놓침/클램프는 넣지 않는다**
(요구사항 4: 지연은 사라지면 안 됨). 앵커가 오래된 방치 반복은 backlog가 커질 수 있으나, 이는
실제로 밀린 것이며 사용자가 "삭제(일괄 skip)" 1회로 정리한다.

**쌍둥이 파일 경고(재확인).** `src/lib/tasks.ts`(서버)와 `src/lib/tasks-recurrence.ts`(클라)의
회차 계산·판정이 어긋나면 지난 작업이 잘못 처리된다(2026-07-29 항목 참조). 회차 상태 판정 순수
헬퍼(`occurrenceStatus`/`outstandingOverdueOccurrences`)는 `tasks-recurrence.ts` 한 곳에 두고 양쪽이
import한다. 콘솔 `helpers.ts`의 술어도 동일 소스를 쓴다.

**As-built 상세** → `docs/product/18-todo-task-workflow.md`, `docs/product/28-admin-todoist-console.md`,
`docs/engineering/09-todo-task-technical-design.md`, `docs/product/12-recurring-work-scheduler.md`,
`docs/engineering/04-data-model.md`, `docs/engineering/05-rls-permissions.md`.

## 2026-07-29~30 어드민 투두이스트 — 모바일 패리티 채우기 + 표시 버그 정리

**배경.** `28-admin-todoist-console.md` §12.5가 사진·태그·컨텍스트 링크·제목/본문 편집을 "모바일에서"로
남겨둔 의도적 축소였는데, 이는 `05-admin-web-ia.md`의 원칙("모바일에서 가능한 기능은 관리자
대시보드에서도 가능해야 한다")과 어긋나고 실제로 관리자가 지시할 때마다 모바일로 넘어가야 했다.

**결정.** 축소를 걷어내고 콘솔에서 생성·편집 모두 지원한다. 세부 판단은 다음과 같다.

1. **컨텍스트 조회는 모바일 서버 액션을 그대로 재사용**한다(`fetchPickerBuildings` 등 4개).
   org 스코프가 이미 걸려 있어 콘솔에서 호출해도 안전하고, 두 표면이 같은 데이터를 본다.
2. **피커 UX는 모바일이 아니라 콘솔 관례를 따른다.** 모바일 시트는 탭 즉시 커밋이지만 콘솔
   팝오버는 로컬 draft + 적용 버튼 — 일정·우선순위·공유 팝오버와 일관되게.
3. **사진 경로 검증·삭제 로직은 공용 모듈로 추출**(`src/lib/task-images.ts`). 스토리지 객체를
   실제로 지우는 코드라 모바일/어드민 두 벌로 두면 한쪽만 고쳐질 위험이 있다.
4. **편집 액션의 사진·컨텍스트는 선택적 패치**로 설계한다. 생략 시 기존 값 유지 — 제목만 고치는
   호출이 링크를 지우거나 사진을 떼어내면 안 된다.
5. **노트 사진은 별도 폴더**(`task-update-images/`). 작업 레벨 사진 정리 로직에 걸려 지워지면 안 된다.

**함께 고친 표시 버그 2건 (2026-07-30).**

- `yearly` 반복이 콘솔에서 **"반복 없음"으로 거짓 표시**됐다. `repeatLabel`/`repeatShort`에 분기가
  없어 `default`로 떨어진 것. 콘솔에서 지정할 수 없는 규칙이라도 **모바일이 만든 값은 제대로 읽어야
  한다** — 화면이 데이터를 부정하면 운영 판단을 오도한다.
- `errMsg`가 서버 코드 대부분을 "처리하지 못했습니다"로 뭉개, 실제로 반복 저장 실패 원인을 화면에서
  찾지 못한 사례가 있었다. 코드 전체를 매핑하고 문구 6개를 ko/ja/en에 추가했다.

**남은 격차(별도 슬라이스).** 모바일에만 있는 프로젝트 섹션·멤버 관리와 드래그 정렬, 콘솔에만 있는
진행 중(in_progress) 상태 설정. 후자는 같은 데이터를 한쪽에서만 다룰 수 있어 우선순위가 높다.

As-built 상세 → `docs/product/28-admin-todoist-console.md` §16.

## 2026-07-30 진행 중 상태 — 모바일에 설정 수단 추가

**결정.** 3상태 모델(`open`/`in_progress`/`completed`)을 모바일에서도 **설정**할 수 있게 한다.
그전까지 모바일은 완료/재개 2상태뿐이라, 콘솔이 진행 중으로 바꾼 작업을 현장에서 읽기만 하고
바꿀 수 없었다(상세는 값을 표시하고 있었고, 목록 카드에는 표시조차 없었다).

세부 판단:

1. **완료 전환은 기존 `completeTask` 가 계속 맡는다.** 신규 `setTaskProgress` 는 open ↔ in_progress
   만 다룬다 — 완료는 반복 회차 처리와 알림이 얽혀 있어 한 액션에 합치면 회귀 위험이 크다.
2. **모바일 세그먼트는 2칸(대기/진행 중)**, 완료는 아래 전용 버튼 유지. 콘솔의 3칸과 모양은 다르지만
   상태 모델은 같다. 완료 상태에서는 세그먼트를 숨긴다(그 시점에 필요한 건 "다시 열기").
3. **목록 카드에 진행 중 칩을 추가**한다. 상세에서만 보이면 목록에서 대기와 구분되지 않아 상태를
   바꾼 의미가 사라진다.

`npx tsc --noEmit` 0 / `npm run lint` 0 errors.
Docs: `docs/product/18-todo-task-workflow.md`.

## 2026-07-30 프로젝트 섹션 · 멤버 관리 — 콘솔 이관

**결정.** 모바일 전용이던 프로젝트 섹션(추가·이름변경·삭제)과 멤버(초대·제거)를 콘솔에도 구현한다.
관리자가 프로젝트를 구성하는 화면에서 구성 자체를 못 만지는 상태였다.

1. **모바일 액션을 재사용하지 않고 콘솔용으로 다시 쓴다.** 모바일은 `FormData` + `redirect` 라
   결과를 돌려주지 않아 콘솔의 토스트/낙관적 흐름에 못 얹는다. 권한 규칙과 부수 효과(섹션 삭제 시
   작업 소프트 삭제, 멤버 0명이면 `is_shared` 해제, 알림 발송)는 동일하게 유지했다.
2. **멤버 관리는 기존 공유 팝오버를 재사용**하고, 적용 시 현재 멤버와 diff 해서 제거→초대를 호출한다.
   전용 화면을 새로 만들지 않아 콘솔의 사용자 선택 UX가 한 벌로 유지된다.
3. **드래그 정렬은 이번 범위에서 뺐다.** 모바일은 롱프레스+드래그, 데스크톱은 포인터 드래그와
   키보드 대체 수단까지 별도 설계가 필요해 성격이 다르다.

`npx tsc --noEmit` 0(내 파일) / `npm run lint` 0 errors.
As-built → `docs/product/28-admin-todoist-console.md` §17.

## 2026-07-30 반복 회차 드래그 순서 — 날짜별 저장(B안)

**결정.** 오늘/내일 목록에서 반복 회차에도 드래그 순서를 허용하되, 순서를 **날짜별로** 저장한다.

검토한 두 안:
- **A안** — 반복도 `tasks.sort_order` 를 쓴다. DB 변경 없음. 대신 오늘에서 올린 순서가 내일·모레까지
  따라 올라간다.
- **B안(채택)** — `(task_id, occurrence_date)` 키로 날짜별 위치를 따로 저장한다.

날짜마다 순서가 달라야 실제 운영에 맞으므로 B안.

**신규 테이블 `task_occurrence_order`.** `task_occurrence_state` 에 컬럼을 더하지 않은 이유가
핵심이다 — 그 테이블은 **"행이 없으면 열린 회차"** 가 계약이라(`outstandingOverdueOccurrences`),
순서용 행을 넣으면 오버듀 회차가 조용히 사라진다. 순서는 완료·스킵과 수명이 달라 분리했다.

**작업 중 잡은 함정.** 두 목록을 하나로 합치면서, 예전 `RecurringOccurrenceCards` 가 넘기던
`occurrence={{date, done}}` 이 빠져 **체크박스가 회차가 아니라 행 전체를 완료 처리**할 뻔했다.
목록 컴포넌트가 항목별로 다시 붙이도록 했다.

**범위**: 오늘 · 내일. 지연 섹션은 날짜별 그룹 카드 구조라 제외, 관리함은 날짜가 없어 기존 유지.

`npx tsc --noEmit` 0 / `npm run lint` 0 errors. **마이그레이션 원격 적용 필요.**
As-built → `docs/engineering/09-todo-task-technical-design.md`.

## 2026-07-30 (후속) 회차별 드래그 순서 — 어드민 콘솔에도 적용

바로 위 B안을 어드민 콘솔 오늘·내일 뷰에도 넣었다. **저장 모델은 새로 만들지 않고 공유**한다
(`reorderConsoleDateTasks` ↔ `reorderDateTasks`, 같은 `task_occurrence_order`) — 두 표면에서 바꾼
순서가 서로 그대로 보여야 하기 때문이다.

드래그 상호작용은 **표면마다 다르게** 뒀다. 콘솔은 관리함이 이미 쓰던 HTML5 `draggable` 과 CSS
(`.idrag`)를 재사용하고, 모바일은 포인터+전용 핸들을 유지한다. 콘솔 안에서 조작 감각이 갈리지 않는
쪽이 표면 간 통일보다 중요하다고 봤다.

모바일에서 겪었던 `occurrence` 누락 함정은 콘솔에선 발생하지 않았다 — 콘솔은 원래부터 목록을 합쳐
`renderRow(t, { occurrence })` 로 넘기고 있었다.

`npx tsc --noEmit` 0 / `npm run lint` 0 errors.

## 2026-07-30 (후속) 순서 저장 실패가 조용히 묻히던 문제

`task_occurrence_order` 마이그레이션을 원격에 적용하기 전에 코드만 돌린 상태에서, 드래그가 화면에서만
먹고 탭을 옮기면 되돌아갔다. `setOccurrenceOrders` 가 Supabase upsert 결과를 버리고 있어 **에러가
어디에도 남지 않아** 원인 파악이 늦어졌다.

**수정**: `setOccurrenceOrders` 가 성공 여부를 `boolean` 으로 돌려주고 실패 시 `console.error`.
어드민 `reorderConsoleDateTasks` 는 `save_failed` 로 반환해 기존 errMsg 매핑이 문구를 띄우고,
모바일은 서버 로그에 남긴다.

**교훈**: 스키마가 필요한 기능은 마이그레이션 적용을 코드 배포와 같은 단계로 취급한다. 그리고
쓰기 헬퍼가 결과를 버리면 실패가 "화면만 바뀌고 되돌아감"으로만 드러나 디버깅 단서가 사라진다.

마이그레이션은 원격 적용 완료(컬럼 6 · 인덱스 3 · RLS 정책 1 · 트리거 1 · rowsecurity=true).

## 2026-07-30 투두 우선순위 — 4단계(Todoist P1~P4) + 색 깃발

**결정.** 우선순위를 `긴급/중요/일반`(3단계, 워드 라벨)에서 **`우선순위 1~4`(Todoist식 4단계)**로 바꾸고
깃발에 색을 넣는다.

- **내부 값은 최소 변경.** 기존 `urgent/important/normal`을 유지하고 신규 값 `medium`(P3) **하나만**
  추가한다(마이그레이션 `202607300002_task_priority_medium.sql` — check 제약에 `medium` 추가, 데이터
  마이그레이션 없음). 사다리: `urgent > important > medium > normal`.
- **표시 매핑**: urgent=우선순위 1(빨강) · important=우선순위 2(주황) · medium=우선순위 3(파랑) ·
  normal=우선순위 4(회색·기본). i18n `prioUrgent/prioImportant/prioMedium/prioNormal`(ko/ja/en) 재라벨.
- **색 소스**: 콘솔 `--flag-urgent`(빨)/`--flag-warn`(주)/신규 `--flag-medium`(파), normal은 무색.
  모바일은 rose/amber/blue/slate. 콘솔 우선순위 피커가 정의되지 않은 `--rose/--amber`를 써서 색이
  네이비로 보이던 버그도 정의된 `--flag-*`로 교정.
- **정렬/필터/피커/상세/캘린더/레일** 전부 4단계 반영. `prioLabel`/`PRIO_ORD`(helpers) 중앙화.

**변경 파일**: `supabase/migrations/202607300002_*`, `src/lib/{admin-tasks-i18n,i18n}.ts`,
`src/components/admin/tasks/{helpers.ts,admin-tasks-console.tsx,admin-tasks-console.css}`,
`src/components/admin/admin-console.css`, `src/components/tasks/{task-card,task-create-form,task-detail-view}.tsx`,
`src/app/{admin,mobile}/tasks/**/actions.ts`. **검증**: lint 0 errors / build 통과.

## 2026-07-30 모바일 지시(받은/보낸) — 공유함 탭을 재구성

**결정.** 관리 콘솔에만 있던 **받은 지시 / 보낸 지시**를 모바일에도 넣는다. 탭 수를 늘리지 않고
**기존 `공유함`(`sent`) 탭을 `지시`(`instr`) 탭으로 재구성**한다(7탭 유지).

- **받은 지시는 오늘/내일/관리함에도 계속 보인다** — 지시 탭은 *모아보기* 역할(사용자 확정).
- **내가 보낸 지시는 내 일정 뷰에서 제외한다** — 대상자의 일정이므로. 콘솔 `myOwn` 과 같은 규칙.
- 상태 그룹은 콘솔 `recvView`/`sentView` 와 **같은 순서**를 쓴다: 받은 = 지연 → 해야 할 지시 →
  진행 중 → 완료, 보낸 = 미확인·대기 → 진행 중 → 완료. 사무실과 현장이 같은 분류를 보게 하는 것이
  이 화면의 목적이다.
- 세그먼트 컨트롤의 시각 규격은 **이미 배포된 건의함 세그먼트**(`suggestions.css` `.seg`)를 따른다.
  새 컨트롤 문법을 만들지 않는다.

**지시 술어는 한 곳에서만 정의한다.** `sentInstr`/`recvInstr`/`myOwn`/`partsOf`/`isMine` 을
`src/lib/task-directives.ts` 로 옮기고 `src/components/admin/tasks/helpers.ts` 는 재수출만 한다.
모바일·콘솔에 같은 규칙을 복사하면 `tasks.ts` / `tasks-recurrence.ts` 반복 규칙에서 이미 겪은
쌍둥이 파일 분기(오버듀 작업이 하드 삭제되던 사고)를 되풀이한다.

**담당자별 진행률은 만들지 않는다.** `task_participants` 에 담당자별 완료 상태가 없고 완료는 작업
1건당 하나다. 보낸 지시 카드는 **담당 인원 수 + 작업 상태**만 보여준다(콘솔과 동일). 담당자별
진행률이 필요하면 `task_participants.completed_at` 추가 + 완료 의미 변경이라는 별도 결정이 필요하다.

**용어.** 카드 칩은 "수행"이 아니라 **담당**을 쓴다(ko `담당 {n}명` · ja `担当 {n}名` ·
en `{n} assigned`) — 청소·근태·주문 화면이 이미 `담당자`를 쓰고 있어 새 단어를 만들지 않는다.

**받아들인 손실.** peer 공유만 모아 보는 모바일 화면이 없어진다. 공유한 작업은 여전히 내 작업이라
오늘/내일/관리함에 그대로 보이고, 콘솔에는 공유함 탭이 남는다.

**하위호환.** 뷰 키 `sent` → `instr`. 예전 `?view=sent` 링크·되돌아오기 쿼리는 `page.tsx` 에서
조용히 `instr` 로 넘긴다.

**변경 파일**: `src/lib/task-directives.ts`(신규), `src/lib/i18n.ts`,
`src/components/tasks/{tasks-workspace,task-card,task-detail-view}.tsx`,
`src/components/admin/tasks/helpers.ts`, `src/app/mobile/tasks/page.tsx`,
`src/app/mobile/tasks/[id]/actions.ts`, docs(18·16·23-product, 01·06-planning, 09-engineering).
**검증**: `tsc --noEmit` 0 errors, `npm run lint` 0 errors(경고 11 = 기존).
`npm run build` 는 **실행하지 않음** — 사용자의 `next dev` 가 같은 `.next/` 를 쓰고 있어 빌드가
개발 서버를 깨뜨린다(이번 세션에 2회 발생).

## 2026-07-30 반복 작업 삭제 — "이 날짜만 건너뛰기 / 반복 전체 삭제"

**문제.** 오늘 화면에서 반복 카드를 삭제하면 시리즈 전체가 모든 날짜에서 사라졌다. 반복 업무는
"오늘만 못 한다"가 흔한데 그걸 표현할 수단이 없었다.

**결정(A안).** 반복 작업을 **회차로 보고 있을 때만** 삭제 시 무엇을 지울지 먼저 묻는다 —
`이 날짜만 건너뛰기` / `반복 전체 삭제`. 구글 캘린더 반복 일정 삭제와 같은 문법이라 학습 비용이 없다.
일회성 작업과 회차가 아닌 목록(관리함)은 기존 확인 모달 그대로다.

**새 저장소를 만들지 않는다.** 기존 `task_occurrence_state` 의 `skipped` 를 그대로 쓴다 — 오버듀
회차 정리에 이미 쓰던 상태이고, 오늘/내일 회차에만 배선이 없었다. 날짜는 서버에서 반복 규칙으로
재계산해 실제 회차인지 검증한다(클라이언트 값을 믿지 않는다).

**확인 모달 대신 실행 취소.** `skipped` 는 영구 상태이므로 6초짜리 "실행 취소" 토스트를 둔다.
되돌릴 수 있는 동작에는 확인 모달을 붙이지 않는다는 기존 규칙(CLAUDE.md §9)과 같은 판단이다.

**필터 규약 정정.** 모바일·콘솔의 회차 필터가 `state !== "completed"` 였다 —
**상태 행이 있으면 해결된 회차**(completed · skipped · moved)이므로 `!state` 로 바꿨다. 안 고치면
건너뛴 회차가 목록에 그대로 남는다. 콘솔은 주석이 이미 셋 다 제외한다고 적혀 있었으나 코드가
달랐다.

**두 화면 모두 적용.** 모바일(BottomSheet)과 관리 콘솔(`RecurDeleteModal`) 둘 다 같은 선택지를
제공하고 같은 서버 규칙(`task_occurrence_state` + 날짜 재검증)을 쓴다. 콘솔의 상세 패널 삭제와
관리함처럼 회차가 아닌 목록은 **의도적으로** 시리즈 삭제 그대로다 — 거기선 행이 곧 시리즈다.

**변경 파일**: `src/app/mobile/tasks/[id]/actions.ts`, `src/app/admin/tasks/actions.ts`,
`src/components/tasks/{tasks-workspace,task-card}.tsx`,
`src/components/admin/tasks/{admin-tasks-console.tsx,admin-tasks-console.css}`,
`src/lib/{i18n,admin-tasks-i18n}.ts`, docs(18-product, 01·06-planning). **검증**: `tsc --noEmit` 0 errors(다른 세션이 만든
`__tests__/admin-table-workbook.test.ts` 오류 1건 제외), `npm run lint` 0 errors.
`npm run build` 미실행(개발 서버 구동 중).

## 2026-07-31 참여자 재초대(Re-sharing) — 문서 쪽으로 통일, 콘솔을 연다

**발견.** 참여자 추가 권한이 두 화면에서 갈라져 있었다.

- 모바일 `shareTaskWithUsers` — 작성자 검사 **없음**(참여자도 추가 가능)
- 콘솔 `shareConsoleTask` — `createdByUserId !== session.user.id → forbidden`(작성자만)

**어느 쪽이 옳았나.** 문서(`18-todo-task-workflow.md` → Sharing Model → Re-sharing)에
*"participants may re-share to more people"* 라고 적혀 있었다. **모바일이 문서를 따랐고 콘솔이
갈라진** 상태였다.

**결정.** 소유자 확인으로 **문서 쪽(참여자도 초대 가능)** 으로 통일한다. 콘솔을 연다.

> 검토 과정에서 "지시받은 사람이 그 지시를 제3자에게 다시 뿌릴 수 있다"는 점을 제기했고
> (추가된 사람에게는 원 작성자가 보낸 지시로 보이며 객실·예약·게스트 컨텍스트도 함께 전달된다),
> 소유자가 그 위험을 알고 **현장에서 동료를 부를 수 있는 편의**를 택했다. 필요해지면 지시만
> 다시 잠그는 것으로 좁힐 수 있다.

**부르기는 열되 축출은 잠근다.** 남을 참여자에서 빼는 것은 계속 작성자만
(`removeTaskParticipant`; 자기 나가기는 누구나), `is_directive` 전환도 작성자만.

**콘솔 액션의 구조적 함정.** `shareConsoleTask` 는 피커 체크 상태로 **집합을 재조정**한다(체크 해제
= 제거). 작성자 검사만 걷어내면 참여자가 다른 참여자를 **축출**할 수 있게 된다 — 모바일 액션은
추가 전용이라 애초에 그 힘이 없다. 그래서 작성자가 아니면 `toRemove = []` 로 두고 `tasks` 갱신도
`is_shared: true` 만 한다. 화면에서도 기존 참여자 행을 `disabled` 로 잠가 유령 조작을 막는다.

**프로젝트 작업.** 두 화면 모두 per-task 공유를 거부한다(프로젝트 멤버십이 정한다). 모바일에는
이 검사가 없었어서 이번에 함께 넣었다.

**변경 파일**: `src/app/admin/tasks/actions.ts`, `src/app/mobile/tasks/[id]/actions.ts`,
`src/components/admin/tasks/{admin-tasks-console.tsx,admin-tasks-console.css}`,
docs(18-product, 05-engineering, 01·06-planning). **검증**: `tsc --noEmit` 0 errors,
`npm run lint` 0 errors.

## 2026-07-31 투두 화면 간 불일치 — 한쪽으로 맞추는 기준

병렬 감사에서 나온 투두 불일치를 정리하며 세운 기준.

**반복 옵션은 양쪽 합집합으로.** 어느 화면에서 만들었느냐에 따라 선택지가 다르면 안 된다. 읽기는
이미 양쪽 다 되고 엔진도 지원하므로 목록만 맞추면 끝나는 문제였다.

**삭제 되돌리기는 경로가 아니라 동작 기준으로.** 모바일은 상세 삭제에만 실행 취소가 있었다.
같은 "삭제" 인데 어디서 눌렀느냐로 되돌리기 유무가 갈리는 건 사용자가 예측할 수 없다.
소프트 삭제(CLAUDE.md §9 예외)를 쓰는 이상 **모든 삭제 경로에 되돌리기**를 붙인다.

**같은 숫자를 보여야 하는 집계는 함수 하나로.** 완료 로그가 두 파일에 복사돼 있었다. 이 저장소는
반복 규칙 복사본이 갈라져 오버듀 작업이 하드 삭제된 전례가 있다. 콘솔 완료·기록과 모바일
완료·기록/업무일지처럼 **사용자가 두 화면을 대조하는 숫자**는 특히 단일 출처여야 한다.

**변경 파일**: `src/components/tasks/{task-schedule-sheet,tasks-workspace}.tsx`,
`src/components/admin/tasks/helpers.ts`, `src/app/mobile/tasks/[id]/actions.ts`,
`src/lib/admin-tasks.ts`, docs(18-product, 01·06-planning).
**검증**: `tsc --noEmit` 관련 오류 0, `npm run lint` 0 errors.

## 2026-08-03 스코프 CSS 변수는 반드시 접두어를 쓴다 (ABSOLUTE)

**문제.** `admin-console.css` 가 `.adm` 스코프에서 `--muted` / `--surface` / `--primary` 를
재정의했다. 클래스 이름은 `.adm` 이 막아 주지만 **CSS 변수는 상속된다.** Tailwind 가 이 이름들을
`bg-muted` / `bg-surface` 유틸로 컴파일하므로, `.adm` 안에 렌더되는 **공용 컴포넌트의 색이 조용히
바뀌었다.**

| 변수 | globals | `.adm` |
| --- | --- | --- |
| `--muted` | `hsl(40 22% 90%)` 밝은 웜 그레이 | `hsl(222 10% 44%)` 어두운 슬레이트 |
| `--surface` | `hsl(44 52% 98.5%)` 거의 흰색 | `hsl(40 22% 90%)` 중간 토프 |
| `--primary` | `hsl(223 46% 32%)` | 같은 값(현재 버그는 없으나 잠재 위험) |

실제 증상: `ui/card.tsx`·`ui/input.tsx` 가 탁해지고, `ui/button.tsx` 의 secondary 는
`active:bg-muted` 때문에 **누를 때 어두운 슬레이트가 번쩍였다.** 유지보수 상세의 "취소됨" 배지는
어두운 배경 + 어두운 글씨로 판독이 어려웠다. `/admin/announcements/[id]`,
`/admin/maintenance/[id]`, `/account?mode=admin` 등 12곳이 영향받았다.

**결정. 스코프 CSS 는 globals 의 Tailwind 토큰과 같은 변수 이름을 쓰지 않는다.** 콘솔 전용 값은
`--adm-*` 접두어를 쓴다. 저장소에 이미 선례가 있다 — `users-console.css` 의 `--ui-*`,
`home-screen.css` 의 `--hm-*`. `admin-console.css` 계열만 예외였다.

**왜 공용 컴포넌트에 명시 색을 박는 방식(대안 b)이 아닌가.** 그 방식은 재발을 못 막는다. 실제로
`/account` 를 그 방식으로 막았는데 **그 화면조차 두 곳(`bg-muted/20`, secondary 버튼)이 다시
새고 있었다.** 앞으로 `bg-muted` 를 쓰는 공용 컴포넌트가 하나 추가될 때마다 같은 버그가 재발한다.
CLAUDE.md §3 의 "cards/sheets stay white (`bg-surface`)" 토큰 계약도 파기된다.

**적용.** 선언 3개 + 참조 887건 / 42파일을 기계적으로 치환했다. **값을 바꾸지 않으므로 콘솔
렌더 결과는 픽셀 동일**이고, `var(--muted)` 는 `var(--muted-foreground)` 와, `var(--surface)` 는
`var(--surface2)` 와 매칭되지 않아 치환이 안전하다. `/account` 의 임시 하드코딩 4곳도 토큰으로
원복했다.

**나머지 6개 스코프도 같은 날 처리했다.** `.cx`(민원) · `.sg`(건의) · `.att`/`.lv`/`.trn`(근태) ·
`.authx`(로그인) — 14파일 / 361건. 접두어는 스코프 이름을 따랐고(`--cx-*` `--sg-*` `--authx-*`),
근태 3개 스코프는 **선언 값이 완전히 동일**해서 `--att-*` 하나로 묶었다(어느 스코프가 감싸든 값이
같으므로 모호성이 없다).

이 6개 스코프에서는 **실제 버그가 0건**이었다. 유일한 후보였던
`src/app/auth/login/language-sheet.tsx:120` 의 `bg-muted` 는 `BottomSheet` 안이라 `<body>` 로
포털되어 `.authx` 밖에서 렌더된다 — 오탐. 즉 이 6개는 순수 예방 조치다.

## 2026-08-03 비밀번호 정책 — 두 겹으로 간다

**문제.** 규칙이 "8자 이상 + 영문자 + 숫자" 뿐이라 `password1` / `stayops1` 같은 **유출 목록
상위 문자열이 전부 통과**했다. 실제로 iOS 키체인이 "이 암호는 데이터 유출에 노출되었다"고
경고하는 상황이 나왔다(그 경고는 StayOps 유출이 아니라 비밀번호 문자열 자체에 대한 것).

**결정. 앱과 Supabase 두 겹으로 막는다.**

1. **앱**(`src/app/auth/actions.ts` `isValidPassword`) — 최소 **10자**, 영문자+숫자, 제품·도메인에서
   유추되는 문자열(`stayops` `password` `qwerty` `123456` `admin` `letmein`) 부분 일치 거부,
   단일 문자 반복 거부, **이메일 로컬파트 포함 거부**. 사용자 언어로 즉시 안내한다.
2. **Supabase Auth 의 유출 비밀번호 차단(HaveIBeenPwned)** — 대시보드 설정. 앱이 못 잡는
   "구성은 멀쩡한데 이미 유출된" 문자열을 막는다.

둘 중 하나만으로는 부족하다. 앱은 유출 여부를 모르고, Supabase 는 사용자 언어로 안내하지 못한다.

**왜 10자인가.** 8자는 구성 요건을 붙여도 사전 공격 범위 안이고 이 제품은 급여·개인정보를 다룬다.
**특수문자는 계속 선택 사항** — 강제하면 오히려 `Password1!` 류로 수렴한다.

**적용 시점이 중요하다.** 정책 강화는 **이미 만들어진 약한 비밀번호에 소급되지 않는다.** 신규
가입·비밀번호 변경에만 걸리므로, 실제 직원 계정이 늘기 전인 지금이 비용이 가장 작다.

**미완**: Supabase 대시보드의 유출 비밀번호 차단은 코드로 켤 수 없다 — 소유자가 직접 활성화해야
한다(Authentication → Sign In / Providers → Password).

## 2026-08-03 유출 비밀번호 차단(HIBP) — 지금은 하지 않는다

Supabase 의 leaked password protection 은 **Pro 플랜 전용**이라 현재 무료 플랜에서 켤 수 없다
(대시보드에서 시도 시 `available on Pro Plans and up` 오류). Supabase 진단에도
`auth_leaked_password_protection` 경고로 잡힌다.

**결정: 지금은 넘어간다.**

- StayOps 는 **초대코드로만 가입하는 폐쇄형**이고 사용자는 실제 직원 소수다. 공개 서비스와 위험
  수준이 다르다.
- 이번에 문제가 된 것(iOS 키체인의 "데이터 유출에 노출된 암호" 경고)은 `password1` 류 유출 목록
  상위 문자열이고, **같은 날 강화한 앱 정책이 이미 잡는다** — 10자 이상 + 제품·도메인 유추 문자열
  거부 + 이메일 로컬파트 거부.
- HIBP 가 추가로 잡는 것은 "구성은 멀쩡한데 어딘가 유출된" 비밀번호다. 있으면 좋지만 현재 규모에서
  한계 이득이 작다.

**언제 다시 볼 것인가** — 아래 중 하나라도 해당되면:

1. 직원 계정이 10명 이상으로 늘 때
2. 외부(협력업체·본사)에 계정을 열 때
3. Pro 플랜으로 올릴 때 — 그러면 대시보드 토글 하나로 끝나므로 직접 구현이 불필요하다

**직접 구현도 가능하다는 점은 기록해 둔다.** HaveIBeenPwned 의 Pwned Passwords range API 는 무료·
무인증이고 k-익명성 방식이라(SHA-1 앞 5자만 전송) 비밀번호가 외부로 나가지 않는다. 붙일 자리는
`src/app/auth/actions.ts` 의 `isValidPassword` 직후이고, **HIBP 장애 시에는 fail open** 이어야
한다 — 외부 서비스 하나 때문에 신규 직원이 계정을 못 만드는 것이 더 큰 운영 리스크다.

**주의: 정책 강화는 기존 비밀번호에 소급되지 않는다.** 이미 만들어진 약한 비밀번호는 본인이 직접
변경해야 한다.


## 2026-08-05 — 영수증 정산: 전자장부로 가지 않는다 (기획, 구현 전)

활동비·경비 영수증 처리를 자동화하기로 했다(상세: `docs/product/29-expense-receipt-workflow.md`).
결정 3건:

1. **원본 종이를 계속 보관한다 — 전자장부(스캐너 보존) 요건을 지지 않는다.** 일본
   전자장부보존법상 요건을 갖추면 원본 폐기가 가능하고(정정·삭제 이력, 날짜·금액·거래처 검색,
   200dpi·256계조, 2개월+7영업일 내 입력, 규정·개요서 비치. 사전 승인은 2022년 폐지, JIIMA 인증도
   필수 아님) 자체 개발 시스템도 인정된다. **그러나 금액이 크지 않은데** 삭제 이력·보관 기간
   7~10년·세무조사 증명 책임·법 개정 대응까지 떠안는 것은 얻는 것에 비해 과하다. 원본을 남기면
   목표(형광펜·붙이기·엑셀 이중입력·대조 제거)는 그대로 달성된다.
   *주의: 전자로 받은 영수증(메일·PDF·웹)은 2024년부터 전자보관 의무라 규칙이 다르다.*

2. **OCR 은 Azure Document Intelligence 로 시작한다.** 월 500장 무료 구간이 이 규모(월 80~100장)를
   덮고 영수증 전용 모델이라 별도 파싱이 필요 없다. **Claude API 를 쓰지 않는 이유는 품질이 아니라
   종량제 계정**이다 — 업무일지에서 같은 이유로 LLM 을 되돌린 선례가 있고 "현재 스택에 LLM 의존성
   없음"을 유지한다. 품질이 부족하면 바꿀 수 있도록 **어댑터를 사이에 둔다**(100장 ≈ $0.5,
   Sonnet 5 기준).

3. **교통비 정산 모듈을 확장한다 — 새 모듈을 만들지 않는다.** `transport_reimbursement_*` 가 이미
   "월별 개인 리포트 + 항목 + 영수증 이미지 + 검토 + 엑셀" 파이프라인을 갖고 있다. `kind`(활동비 /
   경비), 활동비 개인 한도·잔액, OCR 원본 값 추적, A4 인쇄 레이아웃만 더한다.

**활동비와 경비는 돈의 방향이 반대**라 집계를 반드시 나눈다(활동비 = 선지급 사용 증빙, 경비 =
청구 근거). 합치면 "총액"이 뜻을 잃는다.

**엑셀 서식은 미확정이며 마지막에 얹는다.** 서식이 바뀌어도 앞단(촬영·OCR·집계·검토)은 흔들리지
않는다.

---

## 2026-08-06 — 외부 리뷰 세부 점수: 항목명을 현지화한다 (표시만)

컴플레인 상세의 «세부 점수»가 `Clean / Facilities / Location / Services / Staff / Value`처럼
영문으로 노출되고 있었다. 이는 버그가 아니라 초기 결정("플랫폼이 준 항목명 자체를 번역하거나
재정의하지 않는다")의 결과였으나, **운영 담당자가 읽는 화면에 영어가 그대로 남는 것은 다국어
원칙에 어긋난다**고 판단해 결정을 바꾼다.

- **저장은 그대로, 표시만 현지화한다.** `rating_breakdown`은 계속 플랫폼 원본 키·구조로 보관한다
  (Airbnb `category_ratings[]`, Booking.com `scoring{}`). 공통 스키마로 정규화하지 않는다는 원래
  결정은 유효하다.
- 라벨은 `dictionary.complaints.breakdownLabels`(ko/ja/en)에서 온다. Booking 6항목
  (`clean`/`facilities`/`location`/`services`/`staff`/`value`)과 Airbnb 6항목
  (`cleanliness`/`accuracy`/`checkin`/`communication`/`location`/`value`)을 함께 담는다.
- **사전에 없는 키는 종전대로 영문 폴백**(`check_in` → `Check In`)이다. 플랫폼이 항목을 추가해도
  화면이 깨지지 않고, 사전에 키만 추가하면 번역된다. Beds24 리뷰 엔드포인트가 Beta/Alpha라
  항목명이 바뀔 수 있어 이 폴백은 의도적으로 남긴다.
- 파싱·라벨 매핑을 `src/lib/external-review-rules.ts`의 `parseReviewBreakdown()` 하나로 합쳤다.
  모바일 상세(`components/complaints/review-detail.tsx`)와 어드민 상세 패널
  (`components/admin/complaints/review-detail-panel.tsx`)이 동일 로직을 두 벌 들고 있던 상태를
  정리한 것으로, 앞으로 항목을 추가할 때 한쪽만 고쳐지는 사고를 막는다.

상세 계약은 Product `25`에 반영했다.

---

## 2026-08-06 — Airbnb 리뷰에 예약·게스트 이름을 붙인다 (초기 기술 정정)

기획 문서와 migration 주석에 "Airbnb는 예약 ID와 작성자 이름을 제공하지 않는다"로 적혀 있었다.
**절반이 틀렸다.** 보존해 둔 `raw_payload`를 실측했다.

- Airbnb 리뷰 **2,214건 전부**가 `reservation_confirmation_code`(예: `HMRWNK5RQW`)를 갖고 있다.
  Beds24 bookingId가 아니라서 `source_reservation_id` 역조회에 안 걸렸을 뿐이고, **같은 코드가 우리
  예약의 `raw_payload->>apiReference`에 저장돼 있다.**
- 작성자 **이름**은 정말 없다(`reviewer_id` 숫자 ID뿐). 이 부분의 기존 기술은 맞다. 대신 위 코드로
  찾은 **예약의 `guest_name`**을 쓴다. 리뷰에서 추정하는 것이 아니라 다른 신뢰 가능한 출처를
  붙이는 것이므로 "없는 값을 추정하지 않는다" 원칙과 충돌하지 않는다.

결정:

1. **`external_reviews.source_reservation_id` 신설.** 제공자가 쓰는 예약 번호를 담는다(Airbnb 확인
   코드 / Booking.com bookingId). **화면의 «예약 ID»는 이 값이다.** 기존 구현은 Booking.com 상세에
   내부 uuid를 그대로 보여 주고 있었는데, 운영자가 OTA 익스트라넷에서 검색할 수 없는 값이라 의미가
   없었다. `reservation_id`(uuid)는 내부 링크로만 남긴다.
2. **게스트 실명을 그대로 표시한다** (사용자 확인 2026-08-06). Booking.com이 이미 그렇게 하고 있어
   플랫폼 간 동작이 일치한다.
3. **객실은 예약에서 가져오지 않는다.** Airbnb는 조회한 `roomId`가 이미 확정값이고 예약보다 신뢰도가
   높다. Booking.com과 방향이 반대라는 점을 코드·문서에 명시한다.
4. **매칭 실패는 null로 둔다.** 화면에는 `연결된 예약 없음` / `이름 없음`(ko/ja/en). 플랫폼 탓을 하는
   이전 문구(`Airbnb는 예약 ID를 제공하지 않습니다`)는 사실이 아니므로 삭제했다.

**커버리지는 리뷰가 아니라 예약 보유 범위가 결정한다.** 로컬 예약이 2026-04-22부터라 전체 2,214건 중
222건(10%)만 매칭된다. 2026-05-01 이후 리뷰만 보면 **222/233 = 95%**다. 즉 앞으로 들어오는 리뷰는
거의 다 채워지고, 과거분은 Beds24 예약 백필을 과거로 더 돌리지 않는 한 비어 있다. 이 한계를 감추지
않고 문서에 남긴다.

**곁가지로 발견한 기존 버그도 고쳤다.** 수집 코드의 예약 인덱스가 `range()` 없이 select 하고 있어
PostgREST 기본 상한 1000행에서 잘리고 있었다(현재 예약 2,173건). 예약이 2,000건을 넘는 조직에서
Booking.com 객실 역조회가 조용히 절반만 동작하던 셈이다. 1000행 단위 페이지네이션으로 수정했다.

migration: `202608060001_external_reviews_source_reservation.sql` (컬럼 추가 + 기존 행 백필 +
`reservations_api_reference_idx`). 상세 계약은 Product `25`, 연동은 Engineering `01`, 스키마는
Engineering `04`에 반영했다.

---

## 2026-08-06 — 대시보드에서 수동 컴플레인 직접 등록

지금까지 수동 컴플레인 등록은 **모바일에만** 있었다. 사무실에서 접수한 건도 휴대폰을 꺼내야 했고,
대시보드는 읽기·전환·삭제만 가능했다. 대시보드에도 등록을 넣는다.

결정:

1. **저장 경로는 하나로 유지한다.** 대시보드 `createManualComplaintAction`은 모바일과 같은
   `createComplaint`를 부른다. 권한(`canWriteComplaint`)·조직 스코프·제목/플랫폼/이미지 검증이
   한 곳에만 있어야 두 화면이 갈라지지 않는다.
2. **연결 방식을 3가지로 늘린다** — `예약 연결` / `건물 · 객실` / `연결 안 함`.
   모바일은 예약을 고르는 길 하나뿐인데, **전화·워크인·자사 홈페이지처럼 Beds24를 거치지 않은
   예약은 예약 피커에 아예 없다.** 그 건들은 건물·객실이 빈 채로 등록돼 「문제 객실」 집계에서
   통째로 빠지고 있었다. 객실 마스터에서 직접 고르는 경로로 이 구멍을 막는다.
3. **건물·객실은 자유 텍스트가 아니라 마스터 선택이다.** 표기가 흔들리면 객실별 집계가 같은 키로
   묶이지 않는다. 선택지는 예약 캘린더·청소와 같은 활성 객실 집합을 쓴다.
4. **폼은 공용 `.panel` 우측 슬라이드오버**로 띄운다(사용자 확인). 입력 항목이 많아 세로 공간이
   넉넉한 쪽이 맞고, 리뷰 상세가 이미 같은 셸을 쓰고 있어 콘솔 안에서 패턴이 하나로 유지된다.
   전용 스타일을 새로 만들지 않고 `.fld` / `.btn--pri` / `.chipbtn` 공용 primitive를 쓴다.
5. **사진 첨부 포함** (최대 5장, 모바일과 동일 정책). OTA 메시지 캡처·메일 스크린샷을 붙이는 데는
   오히려 데스크톱이 편하다.
6. `연결 안 함`도 유효한 선택으로 남긴다. 어느 방 건인지 모르는 컴플레인도 등록은 가능해야 한다.

구현 메모: `dictionary.complaints`에는 `ratingOf` 같은 **함수 값**이 있어 클라이언트 컴포넌트에
통째로 넘기면 RSC 직렬화가 깨진다(커밋 cb15f7e 회귀). 등록 패널에는 `ManualComplaintList`와 같은
방식으로 **문자열만 담은 `labels` 객체**를 넘긴다.

상세 계약은 Product `25`에 반영했다.

---

## 2026-08-07 — 리뷰 수집 크론이 한 번도 성공한 적 없었다 (60초 상한)

`/admin/complaints` 리뷰가 안 들어온다는 지적에서 시작해 원인을 끝까지 팠다.

**관측**

- 워크플로 `beds24-reviews-sync.yml` 은 `state: active`, 스케줄 정상 등록. 그런데 **총 실행 1회**,
  그마저 `failure` (2026-08-06 09:04 JST, 08:05 예정 대비 59분 지연 — 무료 러너에서 정상 범위).
- 같은 시크릿을 쓰는 `beds24-reconcile.yml` 은 **63회 전부 성공** → 시크릿·Actions 문제가 아니다.
- 프로덕션 엔드포인트를 직접 호출 → **61초에 `504 FUNCTION_INVOCATION_TIMEOUT`**.
- 같은 작업을 로컬에서 → **200, 126초, Beds24 호출 71회**.

**결론.** 라우트 `maxDuration = 60`, Vercel Hobby 함수 상한 60초. 71개 대상을 순차 호출하는 한 주기는
60초 안에 끝날 수 없다. **재시도로 해결되는 종류가 아니라 구조적 불가능**이었고, 그때까지 DB 의 리뷰
2,464건은 전부 로컬 수동 실행 결과였다.

**결정 — 조각내어 이어받는다 (방식 a).**

1. 라우트가 `?offset=N&limit=M` 을 받아 대상 M개(기본 12, 최대 40)만 처리하고
   `nextOrganizationId` / `nextOffset` / `done` 을 반환한다. 워크플로가 `done` 까지 반복 호출한다.
   대상당 1.5~2초이므로 12개면 30초 안팎 — 상한의 절반이라 지연에도 여유가 있다.
2. **대상 정렬을 `id` 오름차순으로 고정했다.** 이어받기의 전제다. PostgREST 는 정렬 미지정 시 순서를
   보장하지 않으므로, 고정하지 않으면 중복 처리와 **조용한 누락**이 동시에 생긴다.
3. 크레딧 부족 중단 시 `nextOffset` 은 **처리하지 못한 첫 대상**을 가리킨다. 건너뛰는 대상이 없다.
4. **크레딧은 늘지 않는다.** 총 Beds24 호출 수 = 대상 수 = 71 로 쪼개기 전과 동일하다.

대안 (b) Actions 러너에서 직접 실행 — 시간 제한은 없지만 Supabase 서비스 롤 키를 Actions 시크릿으로
내보내야 해 키 노출면이 늘어 기각. (c) Vercel Pro(300초) — 돈이 들고 대상이 늘면 다시 한계에 부딪혀 기각.

**함께 확인된 사실**

- **리뷰에는 Beds24 웹훅이 없다.** 예약·객실은 웹훅 우선으로 이미 정상이지만(24시간 712건 갱신,
  reconcile 63/63), 리뷰만은 폴링이 유일한 경로다. "웹훅으로 유지" 요구를 리뷰에는 적용할 수 없다.
- 유실 범위: Booking.com 은 `from` 창으로 과거를 다시 긁을 수 있어 **30일 안에 고치면 무손실**.
  Airbnb 는 객실당 50건 하드 상한이라 별개 제약이며 이번 장애로 잃은 건은 없다.
- Airbnb roomId `67890` 이 매 주기 **HTTP 400** 을 반환한다 — 매일 1회 크레딧 낭비. 별건으로 정리 필요.

**남은 일 — 실패를 알아채는 장치.** 이번 건은 **이틀간 아무도 몰랐다.** 수집 결과를 기록하고 마지막
완주가 오래되면 알리는 장치가 없으면 같은 사고가 반복된다. 다음 작업으로 남긴다.

---

## 2026-08-07 — 웹훅 점검 + 잔재 정리 (셋팅 KPI 버그 / 거짓 로그 / 테스트 객실)

리뷰 수집 장애를 파는 과정에서 실시간 웹훅 상태를 함께 점검하고, 나온 것들을 정리했다.

**웹훅은 정상이다.** 최근 45분간 수신 12건 전부 200, 최근 24시간 신규 예약 18건이 새벽부터
아침까지 끊김 없이 들어왔다. **당일 예약도 반영된다** — `08-06 16:46 생성 → 체크인 08-06`
(Kabukicho 803#) 실사례 확인. 캘린더에 못 얹히는 예약은 **0건**이다(room_label 공백 0,
property_name 공백 0, 객실 마스터에 없는 조합 0종). 캘린더 페이지는 세션 쿠키를 읽어 자동으로
동적이라 캐시 때문에 늦게 보일 여지도 없다.

### 1. 캘린더 「셋팅 대상」 KPI 가 항상 0이었다

`admin-reservation-console.tsx` 의 중복 제거가 `activeReservations` **전체**를 훑어
`findIndex` 가 그 객실의 *가장 과거* 예약을 가리켰다. 한 객실에 예약이 수십 건이니 오늘 도착
건이 그 자리에 올 일이 거의 없어 조건이 사실상 항상 거짓이 됐다. 중복 제거를 **오늘 도착분**
안에서만 하도록 고쳤다. 2026-08-07 실측으로 화면 0 / 실제 2건(다카다노바바 4·8)이었다.

조사 중 "아라키초 `501`/`501_2` 물리 객실 분리 문제도 있다"고 봤으나 **오판이었다** —
`roomKey` 가 `displayRoomLabel` 기반이라 이미 한 키로 합쳐진다. 실제 결함은 중복 제거 범위 하나뿐.

셋팅 대상의 정의는 그대로 유효하다: **오늘 체크인인데 같은 방 체크아웃은 없는 방** = 불 꺼진
방에 손님이 든다. 체크아웃 당일 체크인이면 청소하며 그대로 이어지므로 셋팅 대상이 아니다.

### 2. 로그가 거짓말을 하고 있었다

`room-sync.ts` 가 `minimum_stay` 부재 시 "stored as **inactive** (conservative policy)" 를 찍는데,
`classifyBeds24Room(null)` 은 **active** 를 돌려준다. 2026-06-18 에 "null min-stay 가 실제 운영
객실을 숨긴다"는 이유로 정책을 바꾸면서 **로그 문구만 옛것으로 남았다.** 이 줄이 하루 수십 번
찍히며 "웹훅이 방을 비활성으로 바꾸는 중"이라는 잘못된 단서를 흘려, 이번 조사에서도 시간을
버리게 했다. 실제 동작과 맞췄다.

### 3. 테스트 잔재 객실 삭제 (사용자 승인)

`rooms.external_room_id = "67890"` — 객실 라벨이 건물명과 같은(`Arakicho A` / `Arakicho A`)
가짜 행. 실제 Beds24 룸 ID 대역(513698~648399)과 형태가 다르고, 2026-06-02 이후 room-sync 가
건드린 적이 없어 옛 정책 시절 `inactive`(min_stay=null) 상태로 굳어 있었다.

리뷰 수집은 휴면 어카운트 리뷰를 확보하려고 비활성 객실도 **일부러** 호출하므로, 매 주기 이
존재하지 않는 roomId 에 1회씩 던져 **HTTP 400 + 크레딧 1회 낭비**가 반복되고 있었다.

붙어 있던 예약 3건은 전부 웹훅 개발 시기 픽스처였다 — `Taro Yamada`, `Webhook BatchOne`,
`Webhook BatchTwo` (source id `99001`/`99002`, 2026-05-24~06-02 생성). 청소 세션·리뷰·컴플레인·
수리 참조 0건을 확인하고 객실 1행 + 예약 3행을 삭제했다. 대상 수 71 → **70**.

### 남은 일

**리뷰 수집 실패 감지 장치가 아직 없다.** 이번 건은 이틀간 아무도 몰랐다. 수집 결과 기록 +
마지막 완주가 오래되면 알림이 필요하며, **점검은 수집 밖에 두어야 한다** — 수집이 안 도는 것이
문제인데 수집이 스스로 알릴 수는 없다. 하루 4회 안정적으로 도는 reconcile 워크플로에 얹는 것이
현실적이다.
