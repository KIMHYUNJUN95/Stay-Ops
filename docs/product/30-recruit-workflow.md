# Recruit — 지원서 수신과 채용 워크플로

외부 채용 사이트에 들어온 지원서를 StayOps 로 받아 **읽고 분류하는** 흐름.

- 상태: 1단계(수신) 구현 완료 — 2026-09-09
- 관련 코드: `src/lib/recruit/*`, `src/app/api/recruit/applications/route.ts`
- 관련 테이블: `job_applications`, 버킷 `recruit-resumes`
- 관련 문서: `docs/engineering/04-data-model.md`, `docs/engineering/05-rls-permissions.md`,
  `docs/engineering/07-environment-setup.md`, `docs/product/04-organization-invitations.md`

---

## 1. 왜 연동하는가

채용 사이트(**haru-recruit** / stayari.web.app)는 Firebase 위에 따로 서 있다. 지원서는 거기 쌓이고,
입사 후의 모든 운영은 StayOps 에서 일어난다. 그 사이가 끊겨 있어 **합격자를 다시 손으로 옮겨
적어야** 했고, 채용 당시의 이력서·지원 동기는 입사와 동시에 사라졌다.

연동의 목적은 두 가지다.

1. **지원 현황을 운영 콘솔 안에서 본다** — 별도 사이트를 오가지 않는다.
2. **채용 이력이 남는다** — 이력서·지원서가 회사 기록으로 보존된다.

**채용 확정 자체는 콘솔에서 하지 않는다**(2026-09-09 결정, §6 참고).

## 2. 역할 분담 — 접수는 채용 사이트, 심사는 StayOps

겹치지 않는다. 채용 사이트 어드민의 `status` 는 문서 생성 시 `"대기 중"` 으로 박히는 **표시용**
값이고 심사 워크플로가 없다(`AdminPage.tsx`). 그래서 상태 관리를 StayOps 가 가져와도 기존 화면이
하던 일을 빼앗지 않는다.

```txt
[haru-recruit]  지원 폼 → Firestore applications/{docId}
                       └─ Cloud Function onApplicationCreated
                            ├→ Slack 알림            (기존)
                            └→ StayOps 수신 웹훅      (추가)

[StayOps]       job_applications 에 보관
                → /admin/recruit 에서 읽고 분류
                (채용 확정은 전화·면접으로 오프라인)
```

**상태를 Firestore 로 되돌려 쓰지 않는다.** 원본을 두 곳에서 쓰면 반드시 어긋난다.

### 왜 밀어넣기(push)인가

StayOps 가 Firestore 를 읽어오는 방식도 가능하지만, 그러면 StayOps 가 Firebase 서비스 계정 키를
들고 있어야 한다. 채용 사이트에는 **이미 지원서 생성 시점에 도는 Cloud Function 이 있어**, 거기에
호출 한 곳을 더하는 편이 훨씬 작고 안전하다. 이 방식에서 StayOps 는 Firebase 자격증명이 전혀
필요 없다.

**브라우저에서 호출하지 않는다.** 공유 시크릿이 번들에 노출되기 때문이다(채용 사이트의 Firebase
설정이 그렇듯 클라이언트 번들은 전부 공개된다). 반드시 함수에서만 호출한다.

## 3. 수신 계약

```txt
POST /api/recruit/applications
Header: x-recruit-webhook-secret: <RECRUIT_WEBHOOK_SECRET>
Body:   { source?: "applications" | "applicants",
          docId: string,
          document: { ...Firestore 문서 그대로 } }
        여러 건: { items: [{ docId, document, source? }, ...] }
```

- **시크릿 미설정 시 거부한다(503).** Beds24 웹훅은 미설정 배포를 견디려고 통과시키지만, 이쪽은
  개인정보가 들어오는 입구라 기본값이 거부여야 한다.
- 시크릿 비교는 **상수 시간**이다. 공개 URL 이라 시도 횟수에 제한이 없다.
- **재전송해도 안전하다.** `(organization_id, source, external_id)` 가 유니크이고, 이미 있는 행은
  **지원자 정보만** 갱신한다. 심사 상태·검토 메모·합격 연결은 절대 덮지 않는다 — 덮으면
  「불합격 처리해 뒀는데 재전송 한 번에 대기 중으로 돌아가는」 사고가 난다.
- 일부만 실패해도 200 으로 답한다. 성공분까지 재전송되면 무의미한 중복 처리가 생긴다. 실패 목록은
  응답 본문과 서버 로그에 남는다.

### 조직 결정

`RECRUIT_ORGANIZATION_ID` 가 있으면 그 조직. 없으면 **유일한 조직**을 쓴다. 조직이 둘 이상인데
환경변수가 없으면 **추측하지 않고 거부한다** — 남의 조직으로 지원서가 새는 것이 가장 나쁜 실패다.

## 4. 지원서 필드

채용 사이트 폼(`ApplicationPage.tsx`)의 제출 객체를 그대로 받는다.

| 구분 | 항목 |
| --- | --- |
| 공고 | `job_id` · `job_title` · `employment_type` · `applied_position` |
| 기본 | `name` · `age` · `gender` · `phone` · `kakao_id` · `address` · `commute_time` · `uniform_size` |
| 체류 | `nationality` · `visa_type` · `visa_period` |
| 조건 | `days` · `days_per_week` · `duration` · `start_date` |
| 경험 | `has_industry_exp` · `industry_tasks` · `source`(지원 경로) · `motivation` |
| 첨부 | `resumeUrl` · `resumeFileName` |

주의점 셋:

- **`source` 가 둘이다.** 폼의 `source` 는 지원 경로(인스타그램 등)이고, 테이블의 `source` 컬럼은
  Firestore 컬렉션 이름이다. 지원 경로는 `source_channel` 에 담는다.
- **거의 전부 nullable.** 폼은 앞으로도 바뀐다. 없는 값을 추측해 채우지 않고, 원문은 `raw_payload`
  에 통째로 남긴다.
- **레거시 `applicants` 컬렉션**이 남아 있다(구 지원 폼). 같은 표에 담되 `source` 로 구분하고,
  `resume_url` / `appliedAt` 같은 옛 필드명도 함께 읽는다.

### 접수 시각

Firestore Timestamp 는 전송 형태가 세 가지다(ISO 문자열 / `{_seconds}` / `{seconds}`). 셋 다 받되
**판독 불가면 지금 시각으로 대체하지 않고 NULL** 로 둔다. 접수 시각을 지어내면 목록 정렬이 조용히
틀어진다.

## 5. 이력서 — 비공개 보관

원본은 토큰이 박힌 Firebase Storage 다운로드 URL 이다. **링크만 저장하지 않는다**:

- URL 을 아는 사람이면 누구나 열 수 있다
- 채용 사이트를 접거나 파일을 지우면 링크가 죽는다 — 채용 이력이 사라진다

수신 시 서버가 파일을 받아 **비공개 버킷** `recruit-resumes` 로 복사한다
(`{organization_id}/{application_id}/{파일명}`). 다른 첨부 버킷(`request-images` 등)과 달리
`public = false` 다. 이력서에는 이름·연락처·주소·비자 정보가 함께 담긴다. 열람은 서버가 그때그때
만드는 서명 URL 로만 한다.

복사에 실패해도 **수신 자체는 성공**으로 둔다 — 접수 기록을 잃는 것이 훨씬 큰 손해다.
`resume_source_url` 이 남아 있고 `resume_path` 가 비어 있는 행은 재시도 대상이다
(`job_applications_resume_pending_idx`).

## 5-1. 백필 (2026-09-09 실행 완료)

기존 지원서 **194건**(`applications` 150 + 레거시 `applicants` 44, 2025-11-25 ~ 2026-09-08)을
`POST /api/dev/recruit/backfill` 로 옮겼다. 로컬 전용·일회성 경로이며, 변환은 웹훅과 **같은
`ingestJobApplication`** 을 쓴다 — 백필이 자기만의 변환을 갖게 두면 두 경로가 어긋난다.

실제 데이터가 두 가지를 알려줬고, 둘 다 고쳤다.

- **허용 형식이 현실과 달랐다.** 이력서 89건 중 4건이 거부됐다: `.hwp`(한글), `.heic`(아이폰
  사진), `.xlsx`. pdf/jpg/docx 만 상정한 첫 목록이 틀렸다. 목록을 넓히고
  (`202609090002_recruit_resume_mime_widen.sql`), **목록에 없는 형식은 `application/octet-stream`
  으로 낮춰 저장**한다 — 접수를 잃는 것보다 낫고, 그렇게 저장하면 브라우저가 실행 대신 내려받으므로
  html/svg 가 섞여 들어와도 위험하지 않다. (html·svg 를 목록에 넣지 않는 이유이기도 하다.)
- **Supabase Storage 키는 한글을 거부한다.** `이력서.pdf` 가 `Invalid key` 로 튕겼다. 저장 경로는
  `resume.{확장자}` 로 ASCII 만 쓰고, 원래 파일명은 `resume_file_name` 컬럼이 갖는다.

덧붙여 **구 폼은 파일명을 저장하지 않았다.** 업로드 경로가 `resumes/{timestamp}_{원본파일명}` 이라
URL 에서 되살린다(`fileNameFromStorageUrl`). 화면에 「resume」 대신 원래 이름이 뜬다.

최종: 194건 전부 수신, 이력서 89건 전부 복사, 실패 0건.

## 6. 심사 상태

| 코드값 | 뜻 |
| --- | --- |
| `pending` | 접수됨 (Firestore `"대기 중"` 이 여기로 들어온다) |
| `screening` | 서류 검토 |
| `interview` | 면접 |

채용 사이트의 한국어 문자열을 그대로 쓰지 않는다. StayOps 는 `ko`/`ja`/`en` 을 함께 지원하므로
상태는 코드값이어야 하고, 표시 문구는 i18n 이 만든다.

### 합격·불합격은 없다 (2026-09-09 사용자 결정)

처음 설계에는 `hired` / `rejected` 가 있었고 「합격 → 초대코드 자동 발급」까지 계획했다. 뺐다.

**채용 확정은 전화·면접으로 오프라인에서 이뤄진다.** 그 결과를 콘솔에도 적게 하면 같은 사실이 두
곳에 기록되고 **한쪽은 반드시 낡는다** — 실제로는 아무도 「합격」을 누르지 않아, 이미 출근 중인
사람이 화면에서는 「면접」에 멈춰 있게 된다. 콘솔이 실제로 하는 일(들어온 지원서를 훑고 분류한다)만
남긴다.

같은 이유로 `invite_code_id` / `hired_user_id` / `hired_at` 세 컬럼도 지웠다
(`202609090003_job_application_status_triage_only.sql`). `hired` 상태가 없으면 영원히 채워지지
않는 자리이고, 쓰이지 않는 컬럼을 남겨 두면 다음 사람이 「이건 왜 항상 비어 있지」로 시간을 쓴다.
입사 연동을 하기로 하면 그때 다시 세운다.

## 7. 권한

열람은 **`owner` / `senior_managing_director`(전무) / `office_admin`** 만. 지원서는 민감 개인정보라
어드민 웹에 들어올 수 있는 전 역할(`field_manager`·`staff` 포함)에게 열지 않는다.

쓰기는 service-role 전용이다. 수신 웹훅과 심사 서버 액션이 조직을 재확인한 뒤 쓴다
(`external_reviews` 와 같은 방식). `authenticated` 에는 `select` 만 있다.

## 8. 보관·삭제

**자동 삭제 없음** (사용자 결정, 2026-09-09). 불합격자 지원서도 보관 기간에 따른 자동 정리를 두지
않고 관리자가 직접 지운다. 자동 정리를 넣게 되면 이 결정부터 다시 확인할 것.

삭제는 StayOps 의 기본 정책대로 하드 삭제다. 지원서를 지울 때 `recruit-resumes` 의 파일도 함께
지워야 한다(콘솔 구현 시).

## 9. 남은 단계

1. ~~`job_applications` 테이블 + RLS + 수신 웹훅 + 기존 194건 백필~~ — 2026-09-09 완료
2. `/admin/recruit` 콘솔 — 목록·상세·상태 분류·삭제. 기존 어드민 프리미티브(칩 필터·테이블·상태
   배지)와 `.panel` 상세 패널을 재사용한다. 새 date picker·새 export 를 만들지 않는다
   (CLAUDE.md §4a·§4b). 디자인 브리프: `docs/design/03-recruit-console-design-brief.md`
3. 채용 사이트 — `onApplicationCreated` 에 전송 추가 (백필은 2026-09-09 완료)

### 채용 사이트 쪽 미결 사항 — **Firestore 가 공개 읽기 상태다 (2026-09-09 확인)**

**어드민 페이지가 Firebase Auth 를 쓰지 않는다.** 비밀번호가 `AdminPage.tsx` 에 상수로 박혀 있고
브라우저에서 문자열 비교만 한다. 로그인한 사용자가 없으니 그 화면이 동작하려면 **Firestore 규칙이
공개 읽기를 허용**해야 하고, 실제로 인증 없는 REST 호출이 200 을 돌려준다(확인함).

즉 지원자의 **이름·전화번호·주소·국적·비자 종류/만료·카카오 ID·이력서 파일**이 URL 만 알면 열린다.
API 키도 번들에 들어 있다.

백필이 끝났으므로 **규칙을 잠글 수 있다**: `applications`/`applicants` 는 `create` 만 허용하고
`read` 는 전면 차단. 지원 폼은 그대로 동작하고, 목록 열람은 StayOps 콘솔(2단계)이 대신한다.

그 밖에:

- **Slack 웹훅 URL 이 `functions/index.js` 에 하드코딩**되어 있다. StayOps 시크릿을 추가하는 김에
  함께 환경변수로 옮기는 것을 권한다.
- 과거 배포가 Node 18 폐지로 실패한 로그가 있다(`deploy_output.txt`). `engines` 는 node 22 로
  올라가 있으나, 함수를 수정하면 재배포가 필요하므로 배포가 실제로 되는지 먼저 확인할 것.
