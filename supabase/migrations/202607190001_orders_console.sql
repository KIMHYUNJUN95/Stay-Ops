-- 주문·비품 어드민 운영 콘솔 (구현: 2026-07-16)
-- 파일명 번호(202607190001)는 lostfound 마이그레이션 뒤를 잇는 순차 스탬프이며, 실제 구현일은 2026-07-16.
-- 어드민이 주문을 거절/종결할 때 남긴 사유(및 상태 정정 시 참고 메모)를 저장할 컬럼.
-- 현재 order_requests에는 요청자용 reason/description만 있고 관리자 메모 컬럼이 없어,
-- 콘솔 상세의 "거절 사유" 표시가 유지되도록 nullable 컬럼 1개만 추가한다(RLS 정책 불변).
alter table public.order_requests
  add column if not exists admin_memo text;

comment on column public.order_requests.admin_memo is
  '관리자 예외 개입 메모(거절 사유 등). 요청자용 reason/description과 구분. 콘솔 재구축 2026-07-16.';
