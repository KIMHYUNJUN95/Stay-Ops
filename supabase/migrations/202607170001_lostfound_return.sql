-- 분실물 "반환 처리" — 모바일 현장 처리 백엔드 (2026-07-15)
--
-- 수리·점검(202607160001)과 동일한 매커니즘을 분실물에 이식한다:
--   현장이 모바일에서 직접 상태를 바꾸고(특히 "반환완료") 처리 메모·증빙 사진을 남긴다.
--   대시보드는 감시·이력·예외 개입만. 배정 개념 없음.
--
-- 이 마이그레이션이 하는 것:
--   1. lost_item_status enum에 'returned'(반환완료) 추가
--   2. 처리 기록 컬럼: handling_memo · handling_image_urls · handled_at · handled_by · handled_by_admin
--   3. storage 폴더 화이트리스트에 'lost-found-handling' 추가 (증빙 사진)
--   4. lost_items UPDATE RLS에 staff 추가 + with check (수리·점검과 동일한 누락/보강)
--
-- ⚠️ 'returned'는 enum에 "값을 추가"만 한다(제거가 아님). 같은 트랜잭션 안에서 이 리터럴을
--    사용하지 않으므로(백필/기본값이 참조하지 않는다) add value가 안전하다.

-- ── 1. 상태값 추가: 반환완료 ──────────────────────────────────────────────
alter type public.lost_item_status add value if not exists 'returned';

-- ── 2. 처리 기록 컬럼 ─────────────────────────────────────────────────────
-- registration용 memo/image_urls와 별개다. handling_*는 "현장이 처리하며 남긴 기록"이다.
alter table public.lost_items
  add column if not exists handling_memo text,
  add column if not exists handling_image_urls text[] not null default '{}'::text[],
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid references public.profiles(id) on delete set null,
  add column if not exists handled_by_admin boolean not null default false;

-- ── 3. storage 폴더 화이트리스트 += lost-found-handling ────────────────────
-- 증빙 사진은 {orgId}/lost-found-handling/{itemId}/{file} 경로에 올라간다.
-- 나머지 조건(4세그먼트, UUID 형태, part_time_staff 제외)은 request_images 정책 그대로.
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
      'lost-items', 'lost-found-handling', 'maintenance-reports', 'maintenance-resolutions', 'order-images'
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
      'lost-items', 'lost-found-handling', 'maintenance-reports', 'maintenance-resolutions', 'order-images'
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

-- ── 4. UPDATE RLS — 상태 변경 = part_time_staff 제외 전원 ──────────────────
-- 기존 정책은 owner/office_admin/cs_staff/field_manager만 허용해 `staff`가 빠져 있었다
-- (수리·점검에서 고친 것과 같은 누락). "반환은 등록자와 무관하게 누구나 가능"이 요구사항이므로
-- staff를 추가한다. part_time_staff는 계속 제외(앱 액션이 먼저 끊고 RLS가 backstop).
-- USING만 있던 정책은 업데이트로 행을 다른 조직으로 옮기는 걸 못 막으므로 with check도 추가한다.
drop policy if exists "reporter or manager can update lost items" on public.lost_items;
create policy "reporter or manager can update lost items"
on public.lost_items
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
  )
)
with check (
  auth.uid() is not null
  and public.has_active_membership(organization_id)
);
