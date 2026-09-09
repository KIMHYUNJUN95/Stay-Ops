-- 채용 지원서 수신 (2026-09-09) — 외부 채용 사이트(haru-recruit)에서 넘어온 지원서를 StayOps 가 보관·심사한다.
--
-- New type:   public.job_application_status
-- New table:  public.job_applications
-- New bucket: recruit-resumes (**비공개**)
--
-- 도메인 계약: docs/product/30-recruit-workflow.md
-- 데이터 모델: docs/engineering/04-data-model.md → job_applications
-- RLS:        docs/engineering/05-rls-permissions.md
--
-- 이 마이그레이션이 담은 결정(2026-09-09):
--
--   * **접수는 채용 사이트, 심사는 StayOps.** 채용 사이트(Firebase/Firestore)의 지원서 문서에는
--     `status: "대기 중"` 이 박혀 있을 뿐 심사 워크플로가 없다(AdminPage 는 표시만 한다). 그래서
--     상태 관리를 StayOps 가 가져와도 기능이 겹치지 않는다. 반대로 `status` 를 Firestore 로 되돌려
--     쓰지는 않는다 — 원본을 두 곳에서 쓰면 어긋난다.
--
--   * **원본 식별자를 그대로 보관한다.** `external_id` 는 Firestore 문서 ID다. 같은 지원서가 두 번
--     전달돼도(함수 재시도·백필 재실행) unique 제약이 중복을 막는다. 상태·메모 같은 StayOps 쪽
--     판단은 재전송으로 덮이지 않는다(수신 경로가 지원자 정보 컬럼만 갱신한다).
--
--   * **레거시 컬렉션을 함께 받는다.** 채용 사이트에는 구 지원 폼의 `applicants` 컬렉션이 남아 있고
--     어드민이 두 컬렉션을 합쳐 보여 준다. `source` 로 구분해 같은 표에 담되, 어느 폼에서 온
--     지원서인지는 잃지 않는다.
--
--   * **이력서는 비공개 버킷.** 다른 첨부(request-images 등)와 달리 public 이 아니다. 이력서는
--     이름·연락처·주소·비자 정보가 담긴 개인정보 문서라 URL 을 아는 사람이면 누구나 열 수 있는
--     상태로 두면 안 된다. 열람은 서버가 그때그때 만드는 서명 URL 로만 한다.
--
--   * **원문(raw_payload)을 남긴다.** 채용 사이트의 폼 항목은 앞으로도 바뀐다(이미 구 폼 흔적이
--     있다). 정규화 컬럼이 못 담은 항목이 생겨도 원문이 있으면 나중에 복구할 수 있다.
--     external_reviews 와 같은 이유·같은 방식이다. **클라이언트에 노출하지 않는다.**
--
--   * **쓰기는 service-role 전용.** 수신은 웹훅, 심사는 서버 액션이 조직을 재확인한 뒤 쓴다.
--     authenticated 에는 select 만 준다(정책 없는 grant 는 그 자체로 거부된다).
--
--   * **열람 권한은 owner / 전무 / office_admin.** 지원서는 민감 개인정보라 어드민 웹에 들어올 수
--     있는 전 역할(field_manager·staff 포함)에게 열지 않는다. `has_org_role` 은 owner 와 전무를
--     동등하게 다룬다(202607130003).
--
--   * **자동 삭제 없음(사용자 결정, 2026-09-09).** 불합격자 지원서는 보관 기간에 따른 자동 정리를
--     두지 않고 관리자가 직접 지운다. 자동 정리를 넣게 되면 이 결정부터 다시 확인할 것.

-- ────────────────────────────────────────────────────────────
-- 1. 심사 상태
--
-- 채용 사이트의 한국어 문자열(`"대기 중"`)을 그대로 쓰지 않는다. StayOps 는 ko/ja/en 을 함께
-- 지원하므로 상태는 코드값이어야 하고, 표시 문구는 i18n 이 만든다.
-- ────────────────────────────────────────────────────────────
create type public.job_application_status as enum (
  'pending',    -- 접수됨 (Firestore `"대기 중"` 이 여기로 들어온다)
  'screening',  -- 서류 검토
  'interview',  -- 면접
  'hired',      -- 합격 → 초대코드 발급
  'rejected'    -- 불합격
);

-- ────────────────────────────────────────────────────────────
-- 2. job_applications
-- ────────────────────────────────────────────────────────────
create table public.job_applications (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null references public.organizations(id) on delete cascade,

  -- 원본 식별. `source` 는 Firestore 컬렉션 이름을 그대로 쓴다.
  source                text        not null default 'applications'
                                    check (source in ('applications', 'applicants')),
  external_id           text        not null check (char_length(trim(external_id)) > 0),

  -- 지원한 공고. 공고 자체는 채용 사이트에 하드코딩된 목록이라 StayOps 로 가져오지 않는다.
  job_external_id       text,
  job_title             text,
  employment_type       text,       -- '정사원' / '아르바이트' 등 채용 사이트 표기 그대로
  applied_position      text,

  -- 지원자 기본 정보. 폼이 언제든 바뀔 수 있어 대부분 nullable 로 둔다 — 누락은 NULL 이고
  -- 추측해서 채우지 않는다.
  applicant_name        text        not null check (char_length(trim(applicant_name)) > 0),
  age                   text,       -- 폼이 문자열로 받는다. 숫자 변환은 표시 단계에서.
  gender                text,
  phone                 text,
  kakao_id              text,
  address               text,
  commute_time          text,
  uniform_size          text,

  -- 외국인 채용. 숙박업 현장 채용에서 실제로 판단에 쓰이는 항목이다.
  nationality           text,
  visa_type             text,
  visa_period           text,

  -- 근무 조건
  work_days             text[]      not null default '{}'::text[],  -- 폼의 `days`
  days_per_week         text,
  duration              text,
  start_date            text,       -- 폼이 자유 입력이라 date 로 강제하지 않는다

  -- 경험·동기
  has_industry_exp      text,       -- '예' / '아니오'
  industry_tasks        text[]      not null default '{}'::text[],
  source_channel        text,       -- 폼의 `source` (지원 경로). 컬럼 `source` 와 구분한다.
  motivation            text,

  -- 이력서. 원본 URL 은 Firebase Storage 다운로드 URL(토큰 포함)이라 **서버 전용**이다.
  -- `resume_path` 가 채워지면 StayOps 비공개 버킷으로 복사가 끝난 것이다.
  resume_file_name      text,
  resume_source_url     text,
  resume_path           text,

  -- 심사 (StayOps 소유)
  status                public.job_application_status not null default 'pending',
  status_changed_at     timestamptz,
  status_changed_by_user_id uuid    references public.profiles(id) on delete set null,
  review_note           text,

  -- 합격 → 입사 연결
  invite_code_id        uuid        references public.invite_codes(id) on delete set null,
  hired_user_id         uuid        references public.profiles(id) on delete set null,
  hired_at              timestamptz,

  -- 시각
  applied_at            timestamptz,  -- Firestore createdAt / appliedAt
  imported_at           timestamptz not null default now(),

  -- 서버 전용 원문 사본. 클라이언트 select 목록에 넣지 말 것.
  raw_payload           jsonb       not null default '{}'::jsonb,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint job_applications_source_unique unique (organization_id, source, external_id)
);

comment on column public.job_applications.raw_payload is
  'Server-only copy of the recruiting-site document. Do not expose to clients.';
comment on column public.job_applications.resume_source_url is
  'Firebase Storage download URL (carries an access token). Server-only — never send to clients.';
comment on column public.job_applications.source_channel is
  'The applicant-reported channel (form field `source`), not the collection name.';

-- 콘솔 기본 정렬: 최근 지원 순
create index job_applications_org_applied_idx
  on public.job_applications (organization_id, applied_at desc nulls last);

-- 상태 탭 + 상태별 정렬
create index job_applications_org_status_idx
  on public.job_applications (organization_id, status, applied_at desc nulls last);

-- 미처리 대기열(콘솔이 열리는 화면)
create index job_applications_pending_idx
  on public.job_applications (organization_id, applied_at desc)
  where status = 'pending';

-- 이력서 복사가 아직 안 끝난 건 — 재시도 대상
create index job_applications_resume_pending_idx
  on public.job_applications (organization_id)
  where resume_source_url is not null and resume_path is null;

create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. RLS
--
-- SELECT: owner / 전무 / office_admin, 또는 플랫폼 관리자.
-- INSERT / UPDATE / DELETE 정책은 두지 않는다 — 수신 웹훅과 심사 서버 액션이 service-role 로
-- 조직을 재확인한 뒤 쓴다(external_reviews 와 같은 방식).
-- ────────────────────────────────────────────────────────────
alter table public.job_applications enable row level security;

create policy "job applications: org admins can read"
  on public.job_applications for select
  using (
    (select auth.uid()) is not null
    and (
      public.has_org_role(organization_id, array['owner', 'senior_managing_director', 'office_admin']::public.organization_role[])
      or exists (
        select 1 from public.platform_admins pa
        where pa.user_id = (select auth.uid()) and pa.is_active = true
      )
    )
  );

-- ────────────────────────────────────────────────────────────
-- 4. Grants
-- ────────────────────────────────────────────────────────────
grant select on public.job_applications to authenticated;
grant all    on public.job_applications to service_role;

-- ────────────────────────────────────────────────────────────
-- 5. 이력서 버킷 — **비공개**
--
-- request-images 등 기존 첨부 버킷은 public 이지만 이것은 아니다(위 결정 참고). 업로드는 서버가
-- service-role 로만 하고, 열람은 서명 URL 로만 한다. 그래서 storage.objects 에 authenticated
-- 정책을 두지 않는다 — service-role 은 RLS 를 우회하므로 정책 없이도 서버 경로는 동작한다.
-- ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recruit-resumes',
  'recruit-resumes',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
