-- 판매 캘린더 작업·이력 표 읽기를 운영 관리자 권한(`ops_admin.access`)으로 좁힌다 (2026-09-30).
--
-- 문서: docs/engineering/05-rls-permissions.md → 「2026-09-30 판매 캘린더 작업·이력 표 — 읽기도 `ops_admin.access`」
--       docs/engineering/14-permission-architecture.md
--       docs/product/32-ops-admin-area.md
--
-- 대상: `beds24_price_jobs` · `price_change_logs` · `beds24_block_logs`
--
-- 전:  has_active_membership(organization_id) OR is_platform_admin()   — 조직 구성원이면 누구나 읽음
-- 후:  organization_id ∈ 「내가 `ops_admin.access` 를 가진 조직」       — 앱의 canAccessOpsAdmin 과 같은 답
--      (+ 기존 「platform admins can manage …」 FOR ALL 정책이 그대로 남아 플랫폼 관리자는 계속 읽는다)
--
-- 왜: 세 표는 **누가 · 언제 · 어느 방 가격을 얼마에서 얼마로** 바꿨는지(작업 요청 본문 `room_updates`,
-- 이력의 `changed_by_name`, 차단 요청자)를 담는다. 쓰는 화면(`/admin/ops/*`)은 이미 `ops_admin.access`
-- 로만 열리는데, RLS 는 구성원 전원에게 열려 있어서 현장 직원 세션으로 REST 를 직접 치면 읽혔다.
--
-- ## 판정식을 새로 만들지 않는다
--
-- `has_capability(org, uid, key)`(202609100001)가 앱의 evaluateCapability 와 같은 규칙이다
-- (차단 우선 · 역할표 capability_roles · 개인 부여/차단 · 만료/회수 · 플랫폼 관리자 통과 · 전무 = 대표).
-- 역할 배열을 여기 다시 적지 않는다 — 역할표의 원본은 src/config/capabilities.ts 이고 DB 사본은 생성된다.
--
-- ## 왜 헬퍼를 하나 더 두는가 — 행마다 판정하지 않기 위해
--
-- `has_capability(organization_id, …)` 를 정책에 바로 쓰면 행 값을 인자로 받으므로 **행마다** 평가된다
-- (SECURITY DEFINER 함수는 인라인되지 않는다). 판매 캘린더는 `price_change_logs` 를 창 하나 전체로 읽고
-- (`getOpsCalendarData` 의 이력 표시 · `getOpsPriceConversions`), 이 함수는 한 번에 서브쿼리 네 개를 돈다.
-- 그래서 「내가 이 권한을 가진 조직 목록」을 **쿼리당 한 번** 구하는 헬퍼를 두고, 정책은
-- `organization_id = any ((select …))` 로 InitPlan 이 되게 쓴다(05-rls-permissions.md → RLS 작성 규칙 1).
--
-- 헬퍼는 대상자를 인자로 받지 않고 **`auth.uid()` 만 본다**(RLS 작성 규칙 2). 비로그인 호출은 빈 배열.
-- 조직도 호출자의 active 멤버십에서만 고른다 — 멤버가 아닌 조직의 개인 부여 행이 남아 있어도 열리지 않는다
-- (앱도 active 멤버십이 없으면 그 조직 세션 자체가 없다). 멤버십 없는 플랫폼 관리자는 이 목록에 없고,
-- 기존 FOR ALL 정책으로 읽는다 — 결과는 이전과 같다.
--
-- ## 바뀌지 않는 것
--
-- - INSERT / UPDATE / DELETE: 손대지 않는다(「platform admins can manage …」 FOR ALL 정책 그대로).
--   쓰기는 서버 액션·워커가 service-role 로 한다(RLS 우회).
-- - service-role 로 읽는 경로(서버 액션의 이력·전송 로그·작업 상태, 워커, 틱, 웹훅)는 영향 없음.
-- - 사용자 세션(RLS)으로 읽는 경로는 두 곳이고 둘 다 이미 `canAccessOpsAdmin` 뒤에 있다:
--     `getOpsCalendarData` (/admin/ops/calendar — requireOpsAdminPage)
--     `getOpsPriceConversions` (loadOpsPriceConversions — requireOpsWriter)
--   정당한 사용자의 동작은 바뀌지 않는다. 세 표를 postgres_changes 로 구독하는 곳도 없다.

-- ---------------------------------------------------------------------------
-- 1. capability_organization_ids(key) — 호출자가 그 권한을 가진 조직 id 배열
-- ---------------------------------------------------------------------------
create or replace function public.capability_organization_ids(target_capability text)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.memberships m
  where auth.uid() is not null
    and m.user_id = auth.uid()
    and m.status = 'active'
    and public.has_capability(m.organization_id, auth.uid(), target_capability);
$$;

comment on function public.capability_organization_ids(text) is
  '호출자(auth.uid())가 active 멤버이면서 해당 권한 키를 가진 조직 id 배열. RLS 에서 (select …) 로 감싸 쿼리당 한 번 평가. 판정은 has_capability.';

revoke all on function public.capability_organization_ids(text) from public;
revoke all on function public.capability_organization_ids(text) from anon;
grant execute on function public.capability_organization_ids(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. SELECT 정책 교체 — `to authenticated` 로 한정
-- ---------------------------------------------------------------------------
--
-- `to authenticated` 인 이유: 헬퍼 EXECUTE 는 authenticated 에만 있다. anon 에게도 이 정책이 평가되면
-- false 가 아니라 권한 에러로 끝난다(RLS 작성 규칙 2). 역할을 한정하면 anon 에게는 정책이 아예 적용되지
-- 않아 (FOR ALL 정책의 is_platform_admin() = false 로) 0행이다.

-- beds24_price_jobs
drop policy if exists "members can read organization price jobs" on public.beds24_price_jobs;
drop policy if exists "ops admins can read organization price jobs" on public.beds24_price_jobs;
create policy "ops admins can read organization price jobs"
on public.beds24_price_jobs
for select
to authenticated
using (
  organization_id = any ((select public.capability_organization_ids('ops_admin.access'))::uuid[])
);

-- price_change_logs
drop policy if exists "members can read organization price logs" on public.price_change_logs;
drop policy if exists "ops admins can read organization price logs" on public.price_change_logs;
create policy "ops admins can read organization price logs"
on public.price_change_logs
for select
to authenticated
using (
  organization_id = any ((select public.capability_organization_ids('ops_admin.access'))::uuid[])
);

-- beds24_block_logs
drop policy if exists "members can read organization block logs" on public.beds24_block_logs;
drop policy if exists "ops admins can read organization block logs" on public.beds24_block_logs;
create policy "ops admins can read organization block logs"
on public.beds24_block_logs
for select
to authenticated
using (
  organization_id = any ((select public.capability_organization_ids('ops_admin.access'))::uuid[])
);

-- ---------------------------------------------------------------------------
-- 검증 (적용 후 SQL 에디터에서 수동 실행 — 이 파일은 실행하지 않는다)
-- ---------------------------------------------------------------------------
--
-- 0) 정책 목록: 세 표 모두 SELECT 1개(ops admins …, roles {authenticated}) + ALL 1개(platform admins …)
--    select tablename, policyname, cmd, roles, qual
--    from pg_policies
--    where schemaname = 'public'
--      and tablename in ('beds24_price_jobs', 'price_change_logs', 'beds24_block_logs')
--    order by tablename, cmd;
--
-- 1) 앱 판정과 대조: 조직의 모든 active 멤버에 대해 has_capability 결과가 「대표·전무 + 개인 부여자 +
--    멤버십 있는 플랫폼 관리자」와 일치하는가. 이 목록이 /admin/ops 에 들어갈 수 있는 사람과 같아야 한다.
--    select m.user_id, m.role,
--           public.has_capability(m.organization_id, m.user_id, 'ops_admin.access') as ops
--    from public.memberships m
--    where m.status = 'active'
--    order by ops desc, m.role;
--
-- 2) 사용자 시뮬레이션 (트랜잭션 안에서, 끝에 rollback):
--    begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', json_build_object('sub', '<ops 권한 없는 staff uid>', 'role', 'authenticated')::text, true);
--      select public.capability_organization_ids('ops_admin.access');   -- 기대: {}
--      select count(*) from public.price_change_logs;                   -- 기대: 0
--      select count(*) from public.beds24_price_jobs;                   -- 기대: 0
--      select count(*) from public.beds24_block_logs;                   -- 기대: 0
--    rollback;
--    begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', json_build_object('sub', '<owner 또는 개인 부여자 uid>', 'role', 'authenticated')::text, true);
--      select public.capability_organization_ids('ops_admin.access');   -- 기대: {<조직 id>}
--      select count(*) from public.price_change_logs;                   -- 기대: 적용 전과 같은 수
--    rollback;
--
-- 3) 비로그인: begin; set local role anon; select count(*) from public.price_change_logs; rollback;
--    -- 기대: 0 또는 permission denied for table(anon 에 표 grant 가 없을 때). 함수 권한 에러가 아니어야 한다.
--
-- 4) 실행 계획: InitPlan 한 번인지
--    explain select id from public.price_change_logs where organization_id = '<org>' limit 1;
--    -- (authenticated 로 전환한 상태에서) Filter 에 `= ANY ($0)` · InitPlan 1 이 보여야 한다.
