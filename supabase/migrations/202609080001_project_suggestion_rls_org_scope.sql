-- 프로젝트·직원제안 RLS 에 조직 스코프 추가 (2026-09-08) — **가시성 변화 없음, 방어 강화만.**
--
-- 2026-09-03 에 투두(`tasks` · 회차 테이블)에서 고친 것과 **같은 계약 누락**이다. 전체 점검에서
-- 남은 곳이 드러났다: 참여자 여부(`is_project_participant` / `can_view_staff_suggestion`)만 보고
-- `organization_id` 는 보지 않는다. 즉 조직 격리가 애플리케이션 쿼리의 `.eq("organization_id", …)`
-- 에만 의존한다 — 한 곳만 빠뜨리면 격리가 뚫린다. CLAUDE.md 는 조직 격리를 서버 관심사로 규정한다.
--
-- 판정 헬퍼들이 `auth.uid()` 를 내부에서 읽으므로 **실제 유출은 없었다.** 그래도 방어를 한 층 더
-- 두는 이유는 투두 때와 같다: 헬퍼가 바뀌거나 새 정책이 이 표를 베껴 쓸 때 조직 조건이 함께
-- 따라가야 한다.
--
-- **대상은 `organization_id` 컬럼이 있는 5개 테이블뿐이다.** `project_participants` 와
-- `project_sections` 는 그 컬럼이 없고 `project_id` 로 스코프되므로 `is_project_participant` 가
-- 이미 올바른 관문이다 — 건드리지 않는다.
--
-- 함께 `auth_rls_initplan` 도 적용한다(정책을 어차피 다시 쓰므로): `(select auth.uid())` /
-- `(select is_platform_admin())` 로 감싸 **행마다** 재평가되던 것을 쿼리당 한 번으로 만든다.
-- 행 값을 인자로 받는 헬퍼(`is_project_participant(id)` 등)는 감싸지 않는다 — 감싸면 상관
-- 서브쿼리가 되어 오히려 손해다. 자세한 규칙은 `docs/engineering/05-rls-permissions.md`.
--
-- **검증에 대한 정직한 한계.** 투두 때는 활성 사용자별 가시 행 수를 적용 전후로 비교해 동일함을
-- 실측했다. 이 두 기능은 **현재 데이터가 0건**이라(프로젝트 0 · 제안 0) 같은 실측이 불가능하다.
-- 대신 구조로 보장한다: 조건을 AND 로 좁히기만 하고, 좁히는 조건은 「그 행의 조직에 활성 멤버인가」
-- 하나다. 참여자인데 그 조직 멤버가 아닌 경우에만 결과가 달라지는데, 그런 행은 애플리케이션이
-- 만들 수 없다(참여자 추가는 전부 org 스코프 조회를 거친다). 데이터가 쌓인 뒤 첫 QA 때
-- 프로젝트/제안 목록이 정상인지 눈으로 확인할 것.

-- ── projects ─────────────────────────────────────────────────────────────────
drop policy if exists "participants can read projects" on public.projects;
create policy "participants can read projects" on public.projects
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (has_active_membership(organization_id) and is_project_participant(id))
    )
  );

-- ── staff_suggestions ────────────────────────────────────────────────────────
drop policy if exists "participants can read staff suggestions" on public.staff_suggestions;
create policy "participants can read staff suggestions" on public.staff_suggestions
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (has_active_membership(organization_id) and can_view_staff_suggestion(id))
    )
  );

drop policy if exists "participants can read staff suggestion comments" on public.staff_suggestion_comments;
create policy "participants can read staff suggestion comments" on public.staff_suggestion_comments
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (has_active_membership(organization_id) and can_view_staff_suggestion(suggestion_id))
    )
  );

drop policy if exists "participants can read staff suggestion events" on public.staff_suggestion_events;
create policy "participants can read staff suggestion events" on public.staff_suggestion_events
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (has_active_membership(organization_id) and can_view_staff_suggestion(suggestion_id))
    )
  );

drop policy if exists "participants can read staff suggestion references" on public.staff_suggestion_references;
create policy "participants can read staff suggestion references" on public.staff_suggestion_references
  for select using (
    (select auth.uid()) is not null
    and (
      (select is_platform_admin())
      or (has_active_membership(organization_id) and can_view_staff_suggestion(suggestion_id))
    )
  );

-- ── org 컬럼이 없는 프로젝트 하위 테이블: InitPlan 만 적용 ────────────────────
-- `project_id` 로 스코프되므로 조직 조건을 걸 자리가 없다. 행별 재평가만 없앤다.
drop policy if exists "participants can read project participant rows" on public.project_participants;
create policy "participants can read project participant rows" on public.project_participants
  for select using (
    (select auth.uid()) is not null
    and ((select is_platform_admin()) or is_project_participant(project_id))
  );

drop policy if exists "participants can read project sections" on public.project_sections;
create policy "participants can read project sections" on public.project_sections
  for select using (
    (select auth.uid()) is not null
    and ((select is_platform_admin()) or is_project_participant(project_id))
  );
