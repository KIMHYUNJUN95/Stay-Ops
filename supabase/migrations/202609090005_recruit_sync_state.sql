-- 채용 지원서 당겨오기(pull) 상태 (2026-09-09).
--
-- 채용 사이트에는 Cloud Function 이 없다(2026-09-09 저장소 확인). 지원서는 브라우저가 Firestore 에
-- 직접 쓴다. 그래서 「밀어넣기」가 아니라 StayOps 가 Firestore 를 **당겨온다**.
--
-- 당겨오는 경로 `POST /api/recruit/sync` 는 시크릿이 없다. 하는 일이 고정이라(공개 Firestore 를
-- 읽어 우리 DB 에 넣는다) 호출자가 데이터를 위조할 수 없기 때문이다. 남는 위험은 **남용**이다 —
-- 반복 호출이 Firestore 무료 읽기 한도(5만/일)를 태울 수 있다. 이 표가 마지막 실행 시각을 들고
-- 있어서, 창 안에 다시 부르면 Firestore 를 **읽지 않고** 즉시 돌려보낸다.
--
-- 한 줄짜리 표다. `id` 는 항상 true 라 두 줄이 될 수 없다.
--
-- 결과를 함께 남기는 이유: Firestore 규칙을 잠그면 이 경로는 조용히 죽는다. 마지막 성공 시각과
-- 마지막 결과가 없으면 「어제부터 지원서가 안 들어온다」를 아무도 눈치채지 못한다.
create table if not exists public.recruit_sync_state (
  id boolean primary key default true check (id),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

insert into public.recruit_sync_state (id) values (true) on conflict (id) do nothing;

alter table public.recruit_sync_state enable row level security;

-- 서버(service-role)만 읽고 쓴다. 운영 화면에 노출할 값이 아니고, service-role 은 RLS 를 우회하므로
-- 정책을 두지 않는 것이 곧 「authenticated 는 접근 불가」다.
--
-- **grant 를 빼먹으면 안 된다.** service-role 은 RLS 를 우회하지만 테이블 권한까지 우회하지는
-- 않는다. 처음에 이 줄이 없어 `permission denied for table recruit_sync_state` 로 상태 기록이
-- 조용히 실패했고, 그 결과 스로틀이 전혀 걸리지 않았다(첫 실행 테스트에서 잡음).
grant all on public.recruit_sync_state to service_role;
