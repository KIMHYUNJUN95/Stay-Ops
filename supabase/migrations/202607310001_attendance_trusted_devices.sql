-- 근태 기기 기억 (Attendance Trusted Devices) — 2026-07-31
--
-- 문제: 휴대폰 기본 카메라로 건물 QR 을 찍으면 아이폰은 Safari 로 열린다. Safari 는 설치된 PWA 와
-- 저장소가 분리돼 있어 로그인 세션을 공유하지 않는다. 그래서 현장 직원이 QR 을 찍을 때마다
-- 재로그인을 요구받는 상황이 생긴다.
--
-- 해결: 한 번 로그인해 실제로 打刻에 성공한 기기에, **근태 打刻 전용** 장기 자격증명을 심는다.
-- 이후 인증 세션이 만료돼도 그 기기에서는 출근/퇴근만 바로 가능하다.
--
-- ── 권한 경계 (반드시 유지할 것) ──────────────────────────────────────────────
--   이 자격증명이 허용하는 것은 **출근/퇴근 打刻 두 가지뿐**이다.
--   근무 이력 · 급여 · 정정 · 프로필 · 다른 모듈 · 어드민은 전부 불가이며, 그 화면들은 여전히
--   정상 인증 세션을 요구한다. middleware 의 보호 경로는 이 기능으로 넓히지 않는다.
--   신원 대체는 오직 근태 打刻 서버 액션 안에서만 일어난다.
--   GPS 필수 + 사이트 반경 검증은 그대로이므로, 자격증명만으로 현장 밖에서 打刻할 수 없다.
--
-- 원문 토큰은 저장하지 않는다 — sha256 해시만 보관한다(DB 유출 시 재사용 방지).
-- See docs/product/24-attendance-workflow.md → "QR Deep Link" / "Trusted Device"
-- and docs/engineering/05-rls-permissions.md.

create table public.attendance_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- sha256(원문 토큰) hex. 원문은 쿠키에만 존재한다.
  token_hash text not null,
  -- 관리자 목록에 보여줄 기기 설명 ("iPhone · Safari" 수준). 원본 UA 는 보관하지 않는다.
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint attendance_trusted_devices_token_hash_key unique (token_hash)
);

-- 관리자 화면: 조직의 활성 기기를 최근 사용순으로 나열한다.
create index attendance_trusted_devices_org_idx
  on public.attendance_trusted_devices(organization_id, last_used_at desc);
-- 사용자별 기기 정리 / 재바인딩.
create index attendance_trusted_devices_user_idx
  on public.attendance_trusted_devices(user_id, last_used_at desc);

alter table public.attendance_trusted_devices enable row level security;

-- 본인 기기는 본인이 볼 수 있다(모바일에서 "이 기기 해제" 를 붙일 때를 위해).
create policy "users can read own trusted devices"
on public.attendance_trusted_devices
for select
using (
  auth.uid() is not null
  and (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'senior_managing_director', 'office_admin']::public.organization_role[]
    )
  )
);

-- 해지(폐기)는 본인 또는 조직 상위 관리자만. 발급/갱신은 서버 액션이 service-role 로 수행한다
-- (쿠키 원문을 다루는 경로라 클라이언트에서 직접 쓰게 두지 않는다).
create policy "users or org admins can revoke trusted devices"
on public.attendance_trusted_devices
for update
using (
  auth.uid() is not null
  and (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_org_role(
      organization_id,
      array['owner', 'senior_managing_director', 'office_admin']::public.organization_role[]
    )
  )
);

grant select, update on public.attendance_trusted_devices to authenticated;
grant all on public.attendance_trusted_devices to service_role;
