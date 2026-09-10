-- 채용 지원서 읽기 정책을 권한 키로 (2026-09-10).
--
-- 설계: docs/engineering/14-permission-architecture.md — 5단계(기능 전환)의 첫 사례.
--
-- **여기서부터 실제 권한이 움직인다.** 앞선 마이그레이션(202609100001)은 토대만 놓았다.
--
-- 사용자 결정(2026-09-10): 「사무직이든 현장직이든 지정된 소수 몇 명만」.
-- 그래서 직군으로는 아무도 받지 않는다. 대표·전무만 역할로 남기는데, 지정 목록이 비면 아무도 못
-- 보게 되고 담당자를 지정할 사람도 그 화면을 봐야 할 때가 있기 때문이다(잠금 방지).
--
-- 전:  has_org_role(org, ARRAY['owner','senior_managing_director','office_admin']) OR 플랫폼 관리자
-- 후:  has_capability(org, uid, 'job_application.read')
--
-- 바뀌는 것: **`office_admin` 의 자동 열람이 사라진다.** 현재 그 역할인 1명은 실제 채용 담당이라
-- 개인 부여로 옮겼다(`job_application.read` + `.triage`, 무기한). 앞으로 사무직이 늘어도 지원서가
-- 자동으로 열리지 않는다. 넣고 빼는 것은 `/admin/users/[id]` 권한 카드에서 한다.
--
-- 역할 배열을 여기 다시 적지 않는다 — 역할표는 capability_roles 에만 있고, 그 표는
-- src/config/capabilities.ts 로부터 생성된다(202609100001 의 생성 구간).
drop policy if exists "job applications: org admins can read" on public.job_applications;

create policy "job applications: capability can read"
  on public.job_applications for select
  using (
    (select auth.uid()) is not null
    and public.has_capability(organization_id, (select auth.uid()), 'job_application.read')
  );
