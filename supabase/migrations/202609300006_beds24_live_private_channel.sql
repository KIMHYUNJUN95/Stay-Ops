-- Beds24 실시간 신호 채널 `beds24-live:<organization_id>` 를 private 로.
--
-- 문서: docs/product/33-calendar-write-features.md → 「화면도 웹훅 기준으로」
--       docs/engineering/05-rls-permissions.md → Realtime
--
-- 받기(SELECT)만 허용한다: 로그인한 사용자가 **그 조직의 active 멤버**일 때만 그 조직 토픽을 구독할 수 있다.
-- 보내기(INSERT) 정책은 두지 않는다 — 신호는 서버가 service role 로만 보낸다(RLS 우회).
--
-- 배포 순서: 이 마이그레이션을 **먼저** 적용한 뒤 클라이언트(private 구독) 코드를 배포한다.
-- 순서가 뒤집히면 private 구독이 거부돼 실시간 새로고침이 끊긴다(데이터는 영향 없음).
-- 프로젝트의 Realtime 「Allow public access」 설정은 바꾸지 않는다 — 다른 public 채널이 그대로 쓴다.
--
-- 토픽 문자열을 uuid 로 캐스팅하지 않는다: 다른 private 토픽이 생기면 이 정책도 같이 평가되는데,
-- 캐스팅 실패는 그 구독까지 에러로 만든다. 그래서 문자열로 비교한다.

drop policy if exists "beds24_live_members_receive" on realtime.messages;

create policy "beds24_live_members_receive"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'beds24-live:%'
  and exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and 'beds24-live:' || m.organization_id::text = (select realtime.topic())
  )
);
