-- 투두 RLS 정책의 행별 재평가 제거 (2026-09-04) — **권한 변화 없음, 평가 횟수만 줄인다.**
--
-- Supabase database linter `auth_rls_initplan`: 정책 안에서 `auth.uid()` 를 그냥 부르면 Postgres 가
-- **행마다** 다시 평가한다. `(select auth.uid())` 로 감싸면 InitPlan 이 되어 쿼리당 한 번만 평가된다.
-- 결과값은 같으므로 **누가 무엇을 볼 수 있는지는 전혀 바뀌지 않는다.**
--
-- 같은 이유로 `is_platform_admin()` 도 감싼다 — 인자가 없어 행에 무관한데도 행마다 호출되고 있었다.
-- `has_active_membership(organization_id)` / `is_task_participant(id)` 등은 **행 값을 인자로 받으므로**
-- 감싸지 않는다(감싸면 상관 서브쿼리가 되어 오히려 손해다).
--
-- 적용 범위는 투두 5개 테이블뿐이다. 이 진단은 DB 전체에서 111건이 잡히지만, 한 번에 모든 정책을
-- 다시 쓰는 것은 «접근 권한을 잃는» 실패 모드가 있어 위험이 크다. 나머지 기능은 그 기능을 만질 때
-- 같은 방식으로 옮긴다(레시피는 이 파일 그대로).
--
-- 현재 데이터 규모(작업 71건 · 사용자 4명)에서는 체감 차이가 없다. 행 수에 비례해 벌어지는 비용이라
-- 미리 잡아 두는 것이다.

-- ── tasks ────────────────────────────────────────────────────────────────────
drop policy if exists "participants can read tasks" on public.tasks;
create policy "participants can read tasks" on public.tasks
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (
        has_active_membership(organization_id)
        and (
          is_task_participant(id)
          or (project_id is not null and is_project_participant(project_id))
        )
      )
    )
  );

drop policy if exists "author can create own task" on public.tasks;
create policy "author can create own task" on public.tasks
  for insert with check (
    (select auth.uid()) is not null
    and created_by_user_id = (select auth.uid())
    and has_active_membership(organization_id)
  );

drop policy if exists "author can update task" on public.tasks;
create policy "author can update task" on public.tasks
  for update using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (created_by_user_id = (select auth.uid()) and has_active_membership(organization_id))
    )
  );

drop policy if exists "author can delete task" on public.tasks;
create policy "author can delete task" on public.tasks
  for delete using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (created_by_user_id = (select auth.uid()) and has_active_membership(organization_id))
    )
  );

-- ── task_participants ────────────────────────────────────────────────────────
drop policy if exists "participants can read participant rows" on public.task_participants;
create policy "participants can read participant rows" on public.task_participants
  for select using (
    (select auth.uid()) is not null
    and ((select is_platform_admin()) or is_task_participant(task_id))
  );

-- ── task_updates ─────────────────────────────────────────────────────────────
drop policy if exists "participants can read task updates" on public.task_updates;
create policy "participants can read task updates" on public.task_updates
  for select using (
    (select auth.uid()) is not null
    and ((select is_platform_admin()) or is_task_participant(task_id))
  );

drop policy if exists "participants can add notes" on public.task_updates;
create policy "participants can add notes" on public.task_updates
  for insert with check (
    (select auth.uid()) is not null
    and created_by_user_id = (select auth.uid())
    and is_task_participant(task_id)
  );

-- ── 회차 상태 / 회차 순서 ─────────────────────────────────────────────────────
drop policy if exists "participants can read occurrence state" on public.task_occurrence_state;
create policy "participants can read occurrence state" on public.task_occurrence_state
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (has_active_membership(organization_id) and is_task_participant(task_id))
    )
  );

drop policy if exists "participants can read occurrence order" on public.task_occurrence_order;
create policy "participants can read occurrence order" on public.task_occurrence_order
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (has_active_membership(organization_id) and is_task_participant(task_id))
    )
  );
