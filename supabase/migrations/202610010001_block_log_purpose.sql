-- 차단 사유 (2026-10-01).
--
-- 도메인 계약: docs/product/33-calendar-write-features.md 「차단 사유」
--
-- 차단을 걸 때 왜 막았는지(수리 · 청소 · 오너 사용 · 기타)와 짧은 메모를 남긴다. BLOCK 막대가 사유를
-- 보여 줘서 「이 방 왜 막혀 있지?」를 묻지 않게 한다. 기존 `reason` 은 **전송 실패 코드**라 섞지 않는다.
-- Beds24 차단(인벤토리 오버라이드)에는 메모 칸이 없어서 우리 쪽에만 남는다.
alter table public.beds24_block_logs
  add column if not exists purpose text
    check (purpose is null or purpose in ('repair', 'cleaning', 'owner', 'other')),
  add column if not exists memo text
    check (memo is null or char_length(memo) <= 200);

comment on column public.beds24_block_logs.purpose is '차단 사유 코드(repair·cleaning·owner·other). 걸 때만. 화면이 번역한다.';
comment on column public.beds24_block_logs.memo is '차단 메모(200자). 걸 때만.';
