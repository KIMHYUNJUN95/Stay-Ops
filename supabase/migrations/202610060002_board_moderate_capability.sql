-- 게시판 신고 처리 권한 키 `board.moderate` (2026-10-06, 앱 출시 준비 B4).
--
-- 설계: docs/product/23-board-workflow.md §12-C · docs/engineering/14-permission-architecture.md
--
-- 역할표 생성 구간은 202609100001 에만 있다(`capability-registry.test.ts` 가 검사). 그 파일은 이미 적용돼 기존 DB 에서
-- 다시 돌지 않으므로, 새 키의 행만 여기서 넣는다(202609170001 과 같은 방식).

insert into public.capability_roles (capability, role) values
  ('board.moderate', 'owner'::organization_role),
  ('board.moderate', 'office_admin'::organization_role)
on conflict (capability, role) do nothing;

-- individual_grant = true → 신고 처리를 다른 사람에게 맡길 수 있다.
-- individual_deny  = true → office_admin 중 특정인을 뺄 수 있다(owner 는 차단 면역).
-- platform_bypass  = true → 개발자는 부여 없이도 들어간다(잠금 방지).
insert into public.capability_policies (capability, individual_grant, individual_deny, platform_bypass)
values ('board.moderate', true, true, true)
on conflict (capability) do update set
  individual_grant = excluded.individual_grant,
  individual_deny = excluded.individual_deny,
  platform_bypass = excluded.platform_bypass;

-- 신고 취소(2026-10-06): 신고자가 스스로 거둔 신고는 `withdrawn` 으로 남긴다(기록 보존, 숨김 해제).
alter table public.board_reports drop constraint if exists board_reports_status_check;
alter table public.board_reports
  add constraint board_reports_status_check check (status in ('pending', 'removed', 'dismissed', 'withdrawn'));
