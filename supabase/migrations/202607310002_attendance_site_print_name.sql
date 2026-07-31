-- 출퇴근 현장의 인쇄용 이름 (2026-07-31)
--
-- 벽에 붙이는 QR 인쇄물에는 현장 이름이 영문으로 나가야 한다. 그런데 `attendance_sites.name` 은
-- 한글이고(아라키초A, 가부키초…), 이 조직의 현장은 전부 `property_id` 가 비어 있어
-- `properties.display_name_en` 을 끌어올 수도 없다.
--
-- 한글 이름을 영문으로 바꾸는 대신 **인쇄용 이름을 따로 둔다.** 어드민 화면·근태 기록은 계속
-- 한글 이름을 쓰고, 인쇄물만 이 값을 쓴다. 비어 있으면 `name` 으로 폴백한다.
-- See docs/product/24-attendance-workflow.md → "QR 인쇄".

alter table public.attendance_sites
  add column print_name text;

comment on column public.attendance_sites.print_name is
  'QR 인쇄물에 표기할 이름(주로 영문). 비어 있으면 name 을 쓴다. 화면/기록 표기에는 쓰지 않는다.';
