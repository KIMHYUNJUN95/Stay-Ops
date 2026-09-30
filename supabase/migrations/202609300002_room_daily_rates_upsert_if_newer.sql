-- 요금 동기화가 **더 새 값을 옛 값으로 덮지 않게** (2026-09-30).
--
-- 도메인 계약: docs/product/33-calendar-write-features.md
-- 표: 202609170002_room_daily_rates.sql
--
-- 요금 동기화는 Beds24 를 읽은 뒤 이력 대조 · 이전 값 읽기 · 1,000행씩 upsert 로 여러 번 왕복한다.
-- 그 사이 가격 작업 워커가 검증까지 끝낸 값을 우리 표에 쓰면, 뒤이은 upsert 가 **읽기 전 시점의
-- Beds24 값**으로 그 칸을 되돌렸다.
--
-- 규칙: 동기화는 Beds24 를 읽기 **전에** `synced_at` 을 잡는다. 그 뒤에 누가 그 칸을 썼다면
-- (`room_daily_rates.synced_at` 이 더 크면) 그 칸은 건너뛴다. 실제로 쓴 칸만 돌려준다 —
-- 호출부가 「Beds24 쪽 변경」 이력을 쓴 칸으로만 판정하게.
--
-- 호출자는 서비스 롤뿐이다(SECURITY INVOKER). anon/authenticated 실행 권한은 뺀다.

create or replace function public.upsert_room_daily_rates_if_newer(p_rows jsonb)
returns table (written_room_id uuid, written_stay_date date)
language sql
set search_path = public
as $$
  insert into public.room_daily_rates as r (
    organization_id, room_id, stay_date,
    price1, price2, price3, min_stay, max_stay, num_avail, override_kind, synced_at
  )
  select distinct on (x.room_id, x.stay_date)
    x.organization_id, x.room_id, x.stay_date,
    x.price1, x.price2, x.price3, x.min_stay, x.max_stay, x.num_avail, x.override_kind, x.synced_at
  from jsonb_to_recordset(p_rows) as x (
    organization_id uuid,
    room_id uuid,
    stay_date date,
    price1 integer,
    price2 integer,
    price3 integer,
    min_stay integer,
    max_stay integer,
    num_avail integer,
    override_kind text,
    synced_at timestamptz
  )
  order by x.room_id, x.stay_date
  on conflict (room_id, stay_date) do update
    set price1 = excluded.price1,
        price2 = excluded.price2,
        price3 = excluded.price3,
        min_stay = excluded.min_stay,
        max_stay = excluded.max_stay,
        num_avail = excluded.num_avail,
        override_kind = excluded.override_kind,
        synced_at = excluded.synced_at
    where r.synced_at < excluded.synced_at
      and r.organization_id = excluded.organization_id
  returning r.room_id, r.stay_date;
$$;

revoke all on function public.upsert_room_daily_rates_if_newer(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_room_daily_rates_if_newer(jsonb) to service_role;
