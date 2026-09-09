-- 심사 상태에서 합격·불합격 제거 (2026-09-09, 사용자 결정) — 콘솔은 **분류까지만** 한다.
--
-- `pending | screening | interview | hired | rejected` → **`pending | screening | interview`**
--
-- 왜. 채용 확정은 전화·면접으로 오프라인에서 이뤄진다. 그 결과를 콘솔에도 적게 하면 **두 곳에
-- 기록이 생기고 한쪽은 반드시 낡는다** — 실제로는 아무도 「합격」을 누르지 않고, 화면만 「면접」에
-- 멈춰 있는 지원자가 쌓인다. 콘솔이 실제로 하는 일(들어온 지원서를 훑고 분류한다)만 남긴다.
--
-- 함께 지우는 세 컬럼(`invite_code_id` / `hired_user_id` / `hired_at`)은 「합격 → 초대코드 발급」
-- 연동을 위한 자리였다. `hired` 상태가 없으면 **영원히 채워지지 않는다.** 194건 전부 null 이라
-- 손실은 없다. 나중에 입사 연동을 하기로 하면 그때 다시 세운다 — 쓰이지 않는 컬럼을 남겨 두면
-- 다음 사람이 「이건 왜 항상 비어 있지」로 시간을 쓴다.
--
-- enum 값은 제거할 수 없으므로 새 타입으로 갈아 끼운다. **부분 인덱스를 먼저 내려야 한다** —
-- `where status = 'pending'` 술어가 타입 변경 중에 재해석되지 못해 실패한다(실제로 겪음).
--
-- 도메인 계약: docs/product/30-recruit-workflow.md

drop index if exists public.job_applications_pending_idx;
drop index if exists public.job_applications_org_status_idx;

alter table public.job_applications alter column status drop default;

create type public.job_application_status_new as enum ('pending', 'screening', 'interview');

alter table public.job_applications
  alter column status type public.job_application_status_new
  using status::text::public.job_application_status_new;

alter table public.job_applications alter column status set default 'pending';

drop type public.job_application_status;
alter type public.job_application_status_new rename to job_application_status;

create index job_applications_org_status_idx
  on public.job_applications (organization_id, status, applied_at desc nulls last);
create index job_applications_pending_idx
  on public.job_applications (organization_id, applied_at desc)
  where status = 'pending';

alter table public.job_applications
  drop column invite_code_id,
  drop column hired_user_id,
  drop column hired_at;
