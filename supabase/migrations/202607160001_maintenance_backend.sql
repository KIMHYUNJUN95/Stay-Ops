-- 수리·점검(maintenance) 백엔드 연동 (2026-07-14).
-- 어드민 콘솔(Claude Design 이식)과 모바일 현장 처리 UI가 실제로 쓰는 필드를 스키마에 반영한다.
-- See docs/product/08-maintenance-workflow.md → "2026-07-14 어드민 수리·점검 대시보드".
--
-- 이 마이그레이션이 하는 일:
--   0. property_name 따라잡기 (마이그레이션 없이 원격에만 존재하던 컬럼)
--   1. priority / category enum + 컬럼
--   2. 상태 enum 재정의: resolved 폐기(→ closed 병합) + cancelled 추가
--   3. 처리 결과 컬럼: resolution_memo · resolution_image_urls · completed_at · completed_by
--   4. is_building_only (로케일별로 다른 문자열이 저장되던 "건물 전체" 신고를 정규화)
--   5. RLS UPDATE 정책에 staff 추가 (문서상 "상태 변경 = part_time 제외 전원")

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. property_name 따라잡기
--
-- src/types/database.ts와 모바일 create 액션(src/app/mobile/maintenance/new/actions.ts)은 이 컬럼을
-- 이미 쓰고 있는데 마이그레이션 파일이 없다 — 원격 DB에 대시보드로 직접 추가된 것으로 보인다.
-- 로컬 `supabase db reset`이 깨지지 않도록 여기서 따라잡는다. 원격에는 이미 있으므로 if not exists.
alter table public.maintenance_reports
  add column if not exists property_name text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 우선순위 · 카테고리
create type public.maintenance_priority as enum ('low', 'normal', 'high', 'urgent');

-- 10종 확정. 모바일 폼의 기존 8종(hvac/lock/internet/amenities …)은 UI에만 있었고 저장된 적이 없어
-- (서버 액션이 formData의 category를 읽지 않았다) 데이터 마이그레이션이 필요 없다.
create type public.maintenance_category as enum (
  'electric',
  'water',
  'air_conditioning_heating',
  'wifi',
  'furniture',
  'appliance',
  'cleaning_condition',
  'supplies',
  'damage',
  'other'
);

alter table public.maintenance_reports
  add column priority public.maintenance_priority not null default 'normal',
  add column category public.maintenance_category not null default 'other';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 상태 enum 재정의 — resolved 폐기, cancelled 추가
--
-- "해결"과 "완료"의 차이를 현장이 구분할 수 없어 4상태(접수/처리중/완료/무효)로 확정했다.
-- Postgres는 enum 값을 지울 수 없으므로 타입을 새로 만들어 갈아끼운다.
-- 기존 resolved 행은 closed로 병합된다 (되돌릴 수 없음).
update public.maintenance_reports set status = 'closed' where status = 'resolved';

alter table public.maintenance_reports alter column status drop default;

create type public.maintenance_status_new as enum ('open', 'in_progress', 'closed', 'cancelled');

alter table public.maintenance_reports
  alter column status type public.maintenance_status_new
  using status::text::public.maintenance_status_new;

drop type public.maintenance_status;
alter type public.maintenance_status_new rename to maintenance_status;

alter table public.maintenance_reports alter column status set default 'open';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 처리 결과
alter table public.maintenance_reports
  add column resolution_memo text,
  add column resolution_image_urls text[] not null default '{}',
  add column completed_at timestamptz,
  -- 완료/무효 처리를 실제로 수행한 사람 (현장 담당자 또는 관리자). 신고자와 다를 수 있다.
  add column completed_by uuid references public.profiles(id) on delete set null,
  -- 관리자 예외 개입(강제 완료 / 무효 처리)으로 종료된 건인지. 일반 현장 처리는 false.
  add column completed_by_admin boolean not null default false;

create index maintenance_reports_status_idx
  on public.maintenance_reports(organization_id, status, created_at desc);
create index maintenance_reports_completed_idx
  on public.maintenance_reports(organization_id, completed_at desc)
  where completed_at is not null;

comment on column public.maintenance_reports.resolution_memo is
  '현장/관리자가 남긴 처리 메모. 신고 시 설명(description)과 별개.';
comment on column public.maintenance_reports.resolution_image_urls is
  '완료(수리 후) 사진. 신고 사진(image_urls)과 분리. 최대 5장, 선택 사항(강제 아님).';
comment on column public.maintenance_reports.completed_by_admin is
  '관리자 예외 개입(강제 완료/무효 처리)으로 종료된 경우 true. 현장이 정상 처리하면 false.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 건물 전체(공용부) 신고 정규화
--
-- 지금까지 "건물 전체" 신고는 신고자의 언어로 번역된 문자열('건물 전체' / '建物全体' /
-- 'Whole building')이 room_label에 그대로 저장됐다. 조회하는 사람의 언어와 다르면 그대로 노출된다.
-- 불리언으로 정규화하고 기존 행을 backfill한다. room_label은 NOT NULL이라 비울 수 없어 그대로 둔다
-- (읽기 경로는 is_building_only가 true면 room_label을 무시하고 로케일 라벨을 렌더한다).
alter table public.maintenance_reports
  add column is_building_only boolean not null default false;

update public.maintenance_reports
set is_building_only = true
where btrim(room_label) in ('건물 전체', '建物全体', 'Whole building');

comment on column public.maintenance_reports.is_building_only is
  '객실 없는 건물 단위(공용부) 신고. true면 읽기 경로가 room_label 대신 로케일 라벨을 렌더한다.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. Storage — 완료 사진 폴더 화이트리스트 추가
--
-- 완료 사진은 신고 사진과 같은 `request-images` 버킷을 쓰되 폴더를 분리한다:
--   {orgId}/maintenance-resolutions/{reportId}/{file}
-- 기존 정책(마이그레이션 202605210008)의 2번째 세그먼트 화이트리스트에 이 폴더를 더해야 업로드/삭제가
-- 통과한다. 나머지 조건(4세그먼트, UUID 형태, part_time_staff 제외)은 그대로.
drop policy if exists "org members can upload request images" on storage.objects;
create policy "org members can upload request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in (
      'lost-items', 'maintenance-reports', 'maintenance-resolutions', 'order-images'
    )
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(split_part(name, '/', 4)) between 3 and 160
    and split_part(name, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$'
    and (
      exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.is_active = true
      )
      or exists (
        select 1
        from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role <> 'part_time_staff'
      )
    )
  );

drop policy if exists "org members can delete request images" on storage.objects;
create policy "org members can delete request images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and array_length(string_to_array(name, '/'), 1) = 4
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) in (
      'lost-items', 'maintenance-reports', 'maintenance-resolutions', 'order-images'
    )
    and split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.is_active = true
      )
      or exists (
        select 1
        from public.memberships m
        where m.organization_id::text = split_part(name, '/', 1)
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role <> 'part_time_staff'
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — 상태 변경 = part_time_staff 제외 전원
--
-- 기존 UPDATE 정책은 owner/office_admin/cs_staff/field_manager만 허용해 `staff`가 빠져 있었다.
-- 문서(08-maintenance-workflow.md → Status Change Permission)는 staff도 상태 변경 가능하다고 못박고
-- 있으므로 정책을 문서에 맞춘다. part_time_staff는 계속 제외된다.
-- `has_org_role`은 senior_managing_director를 owner-equivalent로 처리한다(마이그레이션 202607130003).
-- `maintenance_status_change` 권한 예외(override)도 그대로 유지(마이그레이션 202607130004).
drop policy if exists "reporter or manager can update maintenance reports" on public.maintenance_reports;
create policy "reporter or manager can update maintenance reports"
on public.maintenance_reports
for update
using (
  auth.uid() is not null
  and (
    reported_by_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'office_admin', 'cs_staff', 'field_manager', 'staff']::public.organization_role[]
    )
    or public.has_permission_override(organization_id, auth.uid(), 'maintenance_status_change')
  )
)
with check (
  -- USING만 있던 기존 정책은 업데이트로 행을 다른 조직에 옮기는 걸 DB 레벨에서 막지 못했다.
  auth.uid() is not null
  and public.has_active_membership(organization_id)
);
