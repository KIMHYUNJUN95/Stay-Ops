-- 지원서 삭제 기록(tombstone) (2026-09-10).
--
-- **삭제한 지원서가 하루 뒤에 되살아나고 있었다.**
--
-- StayOps 는 Firestore 를 읽기만 한다(원본은 채용 사이트가 가져야 한다). 그래서 콘솔에서 지워도
-- Firestore 문서는 남고, 하루 1회 도는 **전량 훑기**(`/api/recruit/sync?mode=full`, 04:20 JST)가
-- 그것을 다시 읽어 넣었다. 이력서 파일까지 다시 복사되므로 **지운 개인정보가 되돌아온다.**
--
-- 5분 주기 동기화는 `createdAt > 마지막 성공` 조건이라 옛 문서를 건드리지 않는다 — 전량 훑기만
-- 되살렸다. 즉시가 아니라 하루 안에 돌아오므로 오히려 알아채기 어려운 형태였다.
--
-- 「지웠다」는 **StayOps 쪽 정보**다. Firestore 에는 그 개념이 없다. 그래서 여기에 남기고, 수신
-- 경로가 이 표를 먼저 본다 — 전량 훑기 · 재전송 · 나중에 붙일 Cloud Function 이 **모두 같이**
-- 막힌다(수신은 `ingestJobApplication` 하나로 모여 있다).
--
-- 소프트 삭제(`deleted_at`)를 쓰지 않은 이유: 이 프로젝트는 하드 삭제가 기본이고 소프트 삭제는
-- 투두 한 곳에만 승인된 예외다(CLAUDE.md §9). 그 정책을 건드리지 않으면서 같은 문제를 푼다.
create table if not exists public.job_application_deletions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Firestore 컬렉션 이름 — `job_applications.source` 와 같은 값이다.
  source text not null,
  -- Firestore 문서 ID.
  external_id text not null,
  deleted_at timestamptz not null default now(),
  deleted_by_user_id uuid references public.profiles(id) on delete set null,
  primary key (organization_id, source, external_id)
);

-- 수신 경로가 매 문서마다 조회한다.
create index if not exists job_application_deletions_lookup_idx
  on public.job_application_deletions (organization_id, source, external_id);

alter table public.job_application_deletions enable row level security;

-- 서버(service-role)만 읽고 쓴다. 운영 화면에 노출할 값이 아니다.
-- service-role 은 RLS 를 우회하지만 **테이블 권한까지 우회하지는 않는다** — grant 를 빼먹으면
-- 조용히 permission denied 가 난다(2026-09-10 recruit_sync_state 에서 실제로 겪었다).
grant all on public.job_application_deletions to service_role;
