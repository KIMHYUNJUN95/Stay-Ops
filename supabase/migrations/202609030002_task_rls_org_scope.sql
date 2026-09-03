-- 투두 RLS 에 조직 스코프 추가 (2026-09-03) — **가시성 변화 없음, 방어 강화만.**
--
-- CLAUDE.md 는 조직 격리를 서버 관심사로 규정하지만, `tasks` 의 SELECT/UPDATE/DELETE 정책은
-- 참여자 여부(`is_task_participant`)만 보고 `organization_id` 는 보지 않았다. 즉 조직 격리가
-- 애플리케이션 쿼리의 `.eq("organization_id", …)` 에만 의존하고 있었다 — 한 곳만 빠뜨리면 격리가
-- 뚫린다.
--
-- 같은 테이블의 INSERT 정책은 **이미** `has_active_membership(organization_id)` 를 쓰고 있다.
-- 즉 이건 설계 판단이 아니라 나머지 세 정책에서 빠진 누락이다.
--
-- 회차 테이블 두 개도 같다: `task_occurrence_state` / `task_occurrence_order` 는
-- `organization_id` 컬럼을 갖고 있으면서 정책에서는 안 봤다.
--
-- **가시성은 그대로다.** 조건을 AND 로 좁히지만, 참여자가 그 작업의 조직에 활성 멤버가 아닌 경우에만
-- 결과가 달라진다. 적용 전 실측: 그런 행 0건(task_participants 0 / project_participants 0,
-- organization_id 가 null 인 작업 0). 플랫폼 관리자(`is_platform_admin()`)의 조직 간 조회도
-- 그대로 유지된다 — org 조건은 일반 경로에만 AND 로 붙인다.
--
-- 콘솔의 조망 범위는 «본인 참여 업무만» 으로 유지하기로 확정했다(2026-09-03). 이 마이그레이션은
-- 그 결정을 바꾸지 않는다.

-- ── tasks ────────────────────────────────────────────────────────────────────
drop policy if exists "participants can read tasks" on public.tasks;
create policy "participants can read tasks" on public.tasks
  for select using (
    auth.uid() is not null
    and (
      is_platform_admin()
      or (
        has_active_membership(organization_id)
        and (
          is_task_participant(id)
          or (project_id is not null and is_project_participant(project_id))
        )
      )
    )
  );

drop policy if exists "author can update task" on public.tasks;
create policy "author can update task" on public.tasks
  for update using (
    auth.uid() is not null
    and (
      is_platform_admin()
      or (created_by_user_id = auth.uid() and has_active_membership(organization_id))
    )
  );

drop policy if exists "author can delete task" on public.tasks;
create policy "author can delete task" on public.tasks
  for delete using (
    auth.uid() is not null
    and (
      is_platform_admin()
      or (created_by_user_id = auth.uid() and has_active_membership(organization_id))
    )
  );

-- ── 회차 상태 / 회차 순서 ─────────────────────────────────────────────────────
drop policy if exists "participants can read occurrence state" on public.task_occurrence_state;
create policy "participants can read occurrence state" on public.task_occurrence_state
  for select using (
    auth.uid() is not null
    and (
      is_platform_admin()
      or (has_active_membership(organization_id) and is_task_participant(task_id))
    )
  );

drop policy if exists "participants can read occurrence order" on public.task_occurrence_order;
create policy "participants can read occurrence order" on public.task_occurrence_order
  for select using (
    auth.uid() is not null
    and (
      is_platform_admin()
      or (has_active_membership(organization_id) and is_task_participant(task_id))
    )
  );
