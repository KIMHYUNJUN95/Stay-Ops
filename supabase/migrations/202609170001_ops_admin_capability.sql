-- 운영 관리자 영역 권한 키 `ops_admin.access` (2026-09-17).
--
-- 설계: docs/product/32-ops-admin-area.md
--       docs/engineering/14-permission-architecture.md
--
-- STAY ARI Manager 에서 가져오는 기능(캘린더 쓰기 · 가동률 · 매출 · 전표 · 자동화)이 들어가는
-- `/admin/ops/*` 영역을 여는 **키 하나**다. 기능별로 쪼개지 않는다 — 들어오는 사람이 사무실
-- 직원 몇 명뿐이고, 들어왔으면 그 안의 기능을 전부 쓴다.
--
-- ## 왜 마이그레이션이 하나 더 있는가
--
-- 역할표·정책표의 **생성 구간은 202609100001 에만 있다**(`capability-registry.test.ts` 가 그
-- 파일을 검사한다). 그래서 레지스트리를 고치면 그 파일의 생성 구간도 함께 바뀐다 — 새로 만드는
-- DB 는 그것으로 충분하다.
--
-- 그런데 **202609100001 은 이미 적용된 마이그레이션**이라 기존 DB 에서는 다시 돌지 않는다.
-- 이 파일이 그 차이를 메운다. 생성 구간을 통째로 복사하지 않고 **새 키의 행만** 넣는다 —
-- `delete from` 으로 시작하는 생성 구간을 여기서 또 돌리면 두 파일이 같은 표를 두 번 정의하게
-- 되고, 나중에 한쪽만 갱신됐을 때 어느 쪽이 맞는지 알 수 없다.

insert into public.capability_roles (capability, role) values
  ('ops_admin.access', 'owner'::organization_role),
  ('ops_admin.access', 'senior_managing_director'::organization_role)
on conflict (capability, role) do nothing;

-- individual_grant = true  → 사무실 직원 중 지정된 사람에게 개인 부여로 연다.
-- individual_deny  = false → 역할로 받는 사람이 대표·전무뿐인데 그 둘은 차단 면역이라 뺄 대상이 없다.
-- platform_bypass  = true  → 개발자는 부여 목록이 비어도 들어갈 수 있다(잠금 방지).
insert into public.capability_policies (capability, individual_grant, individual_deny, platform_bypass)
values ('ops_admin.access', true, false, true)
on conflict (capability) do update set
  individual_grant = excluded.individual_grant,
  individual_deny = excluded.individual_deny,
  platform_bypass = excluded.platform_bypass;
