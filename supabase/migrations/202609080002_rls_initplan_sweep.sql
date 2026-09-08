-- 전 테이블 RLS 정책의 행별 재평가 제거 (2026-09-08) — **권한 변화 없음, 평가 횟수만 줄인다.**
--
-- Supabase database linter `auth_rls_initplan`: 정책 안에서 `auth.uid()` 를 그냥 부르면 Postgres 가
-- **행마다** 다시 평가한다. `(select auth.uid())` 로 감싸면 InitPlan 이 되어 쿼리당 한 번이다.
-- 인자가 없어 행에 무관한 `is_platform_admin()` 도 같다. **결과값은 같으므로 누가 무엇을 볼 수
-- 있는지는 전혀 바뀌지 않는다.**
--
-- 투두(2026-09-04 `202609040001`)와 프로젝트·제안(`202609080001`)에서 먼저 적용했고, 여기서 나머지
-- 111개 정책을 한 번에 옮긴다.
--
-- **손으로 쓰지 않았다.** 정책을 다시 쓰는 일은 「접근 권한을 잃는」 실패 모드가 있어, 111개를
-- 손으로 옮기면 오타 하나가 조용히 격리를 뚫는다. 그래서 **현재 정의 자체를 소스로** DDL 을
-- 생성했다(`pg_get_expr` → `auth.uid()` / `is_platform_admin()` 만 텍스트 치환 → CREATE POLICY 재조립).
-- 로직·역할·명령·permissive 는 원문 그대로 옮겨진다.
--
-- **행 값을 인자로 받는 헬퍼는 감싸지 않는다** — `has_active_membership(organization_id)`,
-- `is_task_participant(id)` 등. 감싸면 상관 서브쿼리가 되어 오히려 손해다. 위 치환은 인자 없는
-- 두 함수만 건드리므로 그 규칙이 자동으로 지켜진다.
--
-- 검증: 적용 전후로 「감싼 것을 되돌려 정규화한」 정책 정의의 md5 를 비교해 동일함을 확인했다
-- (before = b456be6a85cbae7263e74de410105ae8, 132개 정책). 규칙은
-- `docs/engineering/05-rls-permissions.md` 참고.
--
-- **DDL 을 손으로 나열하지 않고 DO 블록으로 둔 이유.** 111개 정책문을 파일에 박아 두면 그 순간의
-- 스냅샷이 되어, 이후 다른 마이그레이션이 정책을 바꾸면 이 파일과 어긋난다. 자기 정의를 읽어
-- 재작성하는 형태라 **이미 감싼 것은 건드리지 않고**(WHERE 절이 걸러낸다) 여러 번 실행해도 안전하다.

do $$
declare
  r record;
  ddl text;
  n int := 0;
begin
  for r in
    select c.relname as tbl, p.polname as name, p.polcmd as cmd, p.polroles as roles,
           replace(replace(pg_get_expr(p.polqual, p.polrelid),
                   'auth.uid()','(select auth.uid())'),
                   'is_platform_admin()','(select is_platform_admin())') as q2,
           replace(replace(pg_get_expr(p.polwithcheck, p.polrelid),
                   'auth.uid()','(select auth.uid())'),
                   'is_platform_admin()','(select is_platform_admin())') as w2
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n2 on n2.oid = c.relnamespace
    where n2.nspname = 'public'
      and p.polpermissive
      and (coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') like '%auth.uid()%'
        or coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') like '%is_platform_admin()%')
      and coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') not like '%SELECT auth.uid()%'
      and coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') not like '%SELECT is_platform_admin()%'
  loop
    ddl := format('drop policy if exists %I on public.%I', r.name, r.tbl);
    execute ddl;
    ddl := format('create policy %I on public.%I for %s to %s%s%s',
      r.name, r.tbl,
      case r.cmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                 when 'd' then 'delete' else 'all' end,
      case when r.roles = '{0}'::oid[] then 'public' else 'authenticated' end,
      case when r.q2 is null then '' else ' using ('||r.q2||')' end,
      case when r.w2 is null then '' else ' with check ('||r.w2||')' end
    );
    execute ddl;
    n := n + 1;
  end loop;
  raise notice 'rewrapped % policies', n;
end $$;
