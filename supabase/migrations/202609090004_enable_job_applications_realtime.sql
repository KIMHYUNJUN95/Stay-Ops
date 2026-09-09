-- 채용 지원서 실시간 신호 (2026-09-09).
--
-- 채용 사이트에서 지원서가 들어오면 웹훅이 `job_applications` 에 행을 넣는다. 콘솔을 열어 둔
-- 담당자가 새로고침해야만 그 행을 보는 건 「실시간 연동」이 아니다. 이 테이블을 realtime
-- publication 에 넣어 브라우저가 변경 신호를 받게 한다.
--
-- 신호만 쓴다. 지원서 본문은 개인정보라 웹소켓으로 흘리지 않고, 신호를 받으면 서버 렌더를 다시
-- 받는다(`recruit-live-refresh.tsx`). 구독 자체도 select RLS 를 그대로 통과해야 하므로
-- owner / 전무 / office_admin / platform_admin 이 아닌 세션은 아무 신호도 받지 못한다.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_applications'
  ) then
    alter publication supabase_realtime add table public.job_applications;
  end if;
end
$$;
