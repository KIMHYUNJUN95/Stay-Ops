-- 분실물 관리 콘솔 (admin) — 스키마 + 자동 생애주기 (2026-07-16)
--
-- 수리·점검(202607160001) / 분실물 반환(202607170001)에 이어, 어드민 분실물 콘솔이 쓰는
-- 품목 분류·반환 방식·보관 연장 필드를 스키마에 반영하고, 도쿄 기준 자동 생애주기(14일 자동
-- 폐기 → 90일 자동 삭제)를 pg_cron 잡으로 예약한다.
-- See docs/product/09-lost-found-workflow.md → "2026-07-16 어드민 분실물 콘솔".
--
-- 이 마이그레이션이 하는 일:
--   1. 신규 enum: lost_item_category(9종) · lost_return_method(2종)
--   2. lost_items 컬럼: category · return_method · return_tracking_no · hold_until · hold_reason
--   3. 자동 생애주기 함수 2종 (SECURITY DEFINER):
--        lostfound_auto_dispose() — 보관기간 임박→폐기예정, 만료→자동 폐기
--        lostfound_auto_purge()   — 폐기 후 90일 경과분 하드 삭제
--   4. pg_cron 스케줄 등록 (매일 1회, 도쿄 자정 ≈ UTC 15:xx)
--
-- ⚠️ 시각은 전부 "Asia/Tokyo" 기준으로 계산한다. UTC current_date/now()::date 를 그대로 쓰지 말 것.
-- ⚠️ lostfound_auto_purge() 는 하드 삭제(DELETE)다. 반드시 status='disposed' 가드가 있어야 하며,
--    다른 상태의 행은 절대 건드리지 않는다.
-- ⚠️ pg_cron 확장이 프로젝트에 활성화돼 있어야 한다 — Supabase 대시보드(Database → Extensions)에서
--    pg_cron 이 켜져 있는지 확인할 것. 미활성 환경에서는 아래 create extension / cron.schedule 이
--    실패할 수 있다(그 경우 대시보드에서 확장 활성화 후 재적용).

-- ── 1. 신규 enum ──────────────────────────────────────────────────────────
-- create type 은 `if not exists` 문법이 없으므로 duplicate_object 가드로 감싼다(재적용 안전).
do $$ begin
  create type public.lost_item_category as enum (
    'electronics',
    'wallet',
    'accessory',
    'clothing',
    'document',
    'bag',
    'umbrella',
    'toiletry',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.lost_return_method as enum ('delivery', 'pickup');
exception
  when duplicate_object then null;
end $$;

-- ── 2. lost_items 컬럼 추가 ───────────────────────────────────────────────
-- category    : 품목 분류. 기존 행 호환을 위해 not null default 'other'.
-- return_method / return_tracking_no : 반환완료(returned) 시 기록. 배송이면 송장번호.
-- hold_until   : 보관 연장 시의 새 폐기 예정일(도쿄 date). null이면 found_at+14 로 계산.
-- hold_reason  : 보관 연장 사유.
alter table public.lost_items
  add column if not exists category public.lost_item_category not null default 'other',
  add column if not exists return_method public.lost_return_method,
  add column if not exists return_tracking_no text,
  add column if not exists hold_until date,
  add column if not exists hold_reason text;

comment on column public.lost_items.category is
  '품목 분류(9종). 현장 등록 폼에서 선택, 기본 other.';
comment on column public.lost_items.return_method is
  '반환완료(returned) 시 반환 방식. delivery(배송) 또는 pickup(방문 수령).';
comment on column public.lost_items.return_tracking_no is
  '반환 방식이 배송일 때의 송장번호. pickup이면 비어 있음.';
comment on column public.lost_items.hold_until is
  '보관 연장 시 새 폐기 예정일(도쿄 date). null이면 found_at+14일로 파생 계산.';
comment on column public.lost_items.hold_reason is
  '보관 연장 사유(관리자 입력).';

-- ── 3. 자동 생애주기 함수 ─────────────────────────────────────────────────
-- 도쿄 기준 파생값:
--   due   = coalesce(hold_until, (found_at at time zone 'Asia/Tokyo')::date + 14)
--   today = (now() at time zone 'Asia/Tokyo')::date
--
-- 정책:
--   · active(registered/stored) & due>=today & due-today<=3  → disposal_scheduled (폐기 임박)
--   · active(registered/stored/disposal_scheduled) & due<today → disposed (자동 폐기)
--       handled_at=now(), handled_by=null(=시스템 자동), handled_by_admin=false
--       handling_memo가 비어 있을 때만 시스템 자동 폐기 메모로 채움.
--
-- storage 에 남는 이미지(orphan)는 이번 범위 밖 — 이후 별도 정리 잡에서 다룬다.
create or replace function public.lostfound_auto_dispose()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  -- 3-1. 임박: 진행중(registered/stored) & 폐기 예정일이 3일 이내로 다가옴(아직 도래 전/당일)
  update public.lost_items
  set status = 'disposal_scheduled',
      updated_at = now()
  where status in ('registered', 'stored')
    and (coalesce(hold_until, ((found_at at time zone 'Asia/Tokyo')::date + 14)) - v_today) between 0 and 3;

  -- 3-2. 만료: 진행중(registered/stored/disposal_scheduled) & 폐기 예정일이 이미 지남 → 자동 폐기
  update public.lost_items
  set status = 'disposed',
      handled_at = now(),
      handled_by = null,           -- 시스템 자동 폐기(수동 폐기는 handled_by=관리자)
      handled_by_admin = false,
      handling_memo = case
        when handling_memo is null or btrim(handling_memo) = '' then '보관기간 만료 자동 폐기'
        else handling_memo
      end,
      updated_at = now()
  where status in ('registered', 'stored', 'disposal_scheduled')
    and coalesce(hold_until, ((found_at at time zone 'Asia/Tokyo')::date + 14)) < v_today;
end;
$$;

comment on function public.lostfound_auto_dispose() is
  '도쿄 기준 분실물 자동 생애주기: 폐기 예정일 3일 이내 → disposal_scheduled, 경과 → disposed(자동, handled_by=null). 매일 1회 cron 실행.';

-- 3-3. 자동 삭제(퍼지): 폐기 후 90일 경과분 하드 삭제.
--   반드시 status='disposed' 가드. 다른 상태의 행은 절대 삭제하지 않는다.
--   storage orphan(이미지)은 이번 범위 밖 — 이후 별도 정리 잡에서.
create or replace function public.lostfound_auto_purge()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.lost_items
  where status = 'disposed'
    and ((handled_at at time zone 'Asia/Tokyo')::date + 90) < ((now() at time zone 'Asia/Tokyo')::date);
end;
$$;

comment on function public.lostfound_auto_purge() is
  '폐기(disposed) 후 90일(도쿄 기준) 경과한 분실물을 하드 삭제. status=disposed 한정. 매일 1회 cron 실행.';

-- ── 4. pg_cron 스케줄 ─────────────────────────────────────────────────────
-- pg_cron 확장이 없으면 아래는 실패할 수 있다(상단 주석 참고).
create extension if not exists pg_cron;

-- 재적용 시 중복 등록되지 않도록 기존 잡을 먼저 해제(없으면 무시)한다.
do $$ begin
  perform cron.unschedule('lostfound-auto-dispose');
exception
  when others then null;
end $$;

do $$ begin
  perform cron.unschedule('lostfound-auto-purge');
exception
  when others then null;
end $$;

-- 매일 1회 실행. 도쿄 자정 근처(UTC 15:xx). 폐기 판정과 삭제 판정을 몇 분 간격으로 분리한다.
select cron.schedule(
  'lostfound-auto-dispose',
  '5 15 * * *',
  $$ select public.lostfound_auto_dispose(); $$
);

select cron.schedule(
  'lostfound-auto-purge',
  '15 15 * * *',
  $$ select public.lostfound_auto_purge(); $$
);
