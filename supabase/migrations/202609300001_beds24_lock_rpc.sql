-- Beds24 락을 원자적으로 잡고 놓는다 (2026-09-30).
--
-- 도메인 계약: docs/product/33-calendar-write-features.md
-- 표: 202609240002_beds24_sync_locks.sql
--
-- 예전 `acquireBeds24Lock` 은 「살아 있는 락이 있나 읽고 → upsert」 였다. 두 인스턴스가 같은
-- 순간 읽으면 둘 다 비어 있다고 보고, upsert RETURNING 은 **각자 자기가 쓴 행**을 돌려주므로
-- 둘 다 락을 잡았다고 믿었다. 이제 판정을 한 문장 안에서 DB 가 한다 — 만료된 행만 덮어쓴다.
--
-- 시각은 전부 DB `now()` 로 잰다. 잡는 쪽과 놓는 쪽이 서로 다른 서버 시계를 쓰면, 방금 놓은
-- 락이 몇 ms 차이로 「아직 살아 있음」이 된다.
--
-- 호출자는 서비스 롤뿐이다(SECURITY INVOKER). anon/authenticated 실행 권한은 뺀다.

create or replace function public.beds24_try_lock(
  p_name text,
  p_locked_by text,
  p_ttl_ms integer,
  p_lock_id text
) returns boolean
language sql
set search_path = public
as $$
  with claimed as (
    insert into public.beds24_sync_locks as l
      (name, locked_by, locked_at, expires_at, metadata, updated_at)
    values (
      p_name,
      p_locked_by,
      now(),
      now() + make_interval(secs => p_ttl_ms / 1000.0),
      jsonb_build_object('lockId', p_lock_id),
      now()
    )
    on conflict (name) do update
      set locked_by = excluded.locked_by,
          locked_at = excluded.locked_at,
          expires_at = excluded.expires_at,
          metadata = excluded.metadata,
          reason = null,
          updated_at = excluded.updated_at
      where l.expires_at <= now()
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- 내 lockId 일 때만 만료시킨다. 지우지 않는다 — 누가 언제 잡았었는지가 진단에 쓸모 있다.
create or replace function public.beds24_release_lock(
  p_name text,
  p_lock_id text
) returns boolean
language sql
set search_path = public
as $$
  with released as (
    update public.beds24_sync_locks
       set expires_at = now(),
           updated_at = now()
     where name = p_name
       and metadata ->> 'lockId' = p_lock_id
    returning 1
  )
  select exists (select 1 from released);
$$;

revoke all on function public.beds24_try_lock(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.beds24_release_lock(text, text) from public, anon, authenticated;
grant execute on function public.beds24_try_lock(text, text, integer, text) to service_role;
grant execute on function public.beds24_release_lock(text, text) to service_role;
