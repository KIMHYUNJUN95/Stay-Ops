# 권한 아키텍처 — 역할과 개인 지정을 하나의 모델로

- 상태: **3단계(관리 UI)까지 구현 완료** — 2026-09-10. 권한은 아직 하나도 바뀌지 않았다(§8).
  다음은 4단계(사이드바).
- 구현된 것: `src/config/capabilities.ts`(레지스트리·판정식) · `src/lib/capabilities-server.ts`
  (서버 리졸버) · `src/lib/capability-seed.ts`(시드 생성) ·
  `supabase/migrations/202609100001_capability_foundation.sql`(원격 적용 완료) ·
  `AppSession.capabilities` · `/admin/users/[id]` 권한 카드 ·
  `src/lib/__tests__/capability-registry.test.ts`(13건)
- 사용자 방향 지시(2026-09-10): 「앞으로도 모든 기능은 역할 기반으로 나눠 쓰는 기능도 필요하지만,
  개개인을 특정해 권한을 세분화할 수 있도록도 설계해야 한다. 채용 기능만 중요한 게 아니라 설계
  자체를 그렇게 해야 한다. 차단 모델도 넣고, 사용자 기능에서 관리할 수 있어야 한다.」
- 관련 코드: `src/config/roles.ts`, `src/config/permission-overrides.ts`,
  `src/lib/permission-overrides-server.ts`, `src/lib/admin-session.ts`, `src/config/navigation.ts`
- 관련 문서: `docs/product/01-user-roles.md`, `docs/engineering/05-rls-permissions.md`,
  `docs/product/27-permission-override-workflow.md`

---

## 0. 한 줄 요약

기능 코드는 **역할을 모른다.** 「권한 키(capability)」만 묻는다. 그 키를 누가 갖는지는 **역할표 +
개인 부여/차단**이 정하고, 그 정의는 **한 곳에만** 있다.

```txt
       역할 ──┐
               ├──→ 권한 키 ──→ 기능 게이트 / RLS 정책 / 사이드바
개인 부여 ──┤
개인 차단 ──┘
```

판정식:

```txt
can(user, cap) =
      NOT denied(user, cap)                       -- 차단이 최우선
  AND ( granted(user, cap)                        -- 개인 부여
        OR role(user) ∈ cap.roles                 -- 역할 기본 부여
        OR (is_platform_admin AND cap.platformBypass) )
```

---

## 1. 왜 다시 세우는가

### 1-1. 같은 규칙이 네 곳에 복사된다

「누가 이 기능을 쓸 수 있는가」가 지금은 **역할 배열을 직접 적는 방식**이다. 그래서 같은 규칙이
서로 다른 언어와 파일에 흩어진다.

| 자리 | 예 |
| --- | --- |
| 페이지 게이트 | `if (!canReadJobApplications(session.user.role)) redirect("/admin")` |
| 서버 액션 | `requireRecruitSession()` 안에서 같은 술어 재호출 |
| RLS 정책 (SQL) | `has_org_role(organization_id, ARRAY['owner','senior_managing_director','office_admin'])` |
| 사이드바 | (아무 검사도 없음 — §1-4) |

실측(2026-09-10): 정책 **145개** 중 **31개**가 `has_org_role` 로 역할 배열을 직접 들고 있고,
개인 예외를 반영하는 정책은 **4개**뿐이다.

TypeScript 쪽 역할표를 고쳐도 SQL 쪽은 따라오지 않는다. **이 저장소는 이 실패를 반복해서 겪었다** —
「같은 판정식이 세 곳에 복사돼 있었고 그중 하나만 조건을 빠뜨렸다」는 수정이 결정 로그에 여러 건
남아 있다. 권한에서 같은 일이 나면 결과는 「보면 안 되는 사람이 본다」다.

### 1-2. 개인 단위 권한 장치가 네 종류로 갈라져 있다

같은 목적(개인에게 예외를 준다)에 네 가지 서로 다른 구현이 있다.

| 장치 | 저장 위치 | 기한 | 감사 기록 |
| --- | --- | --- | --- |
| `membership_permission_overrides` | 전용 표 | 필수 | 있음(부여자·사유·회수) |
| `memberships.attendance_payroll_admin` | 불리언 컬럼 | 없음 | 없음 |
| `memberships.leave_approver_role` | 컬럼 | 없음 | 없음 |
| `profiles.can_generate_report` | 불리언 컬럼 | 없음 | 없음 |

새 기능마다 「컬럼을 팔까, 오버라이드를 쓸까」를 다시 고민하게 되고, 관리 화면도 장치마다 다르다.

### 1-3. 차단(deny)이 아예 없다

지금 모델은 **더하기만** 된다. 「사무직인데 이 사람만 발주 처리 제외」를 표현할 방법이 없다.
역할을 강등하는 수밖에 없는데, 그러면 그 사람의 다른 권한까지 함께 사라진다.

### 1-4. 사이드바가 권한을 모른다

`admin-shell.tsx` 는 14개 메뉴를 **모두에게 무조건** 렌더한다. `NavigationItem.allowedRoles` 필드가
선언되어 있으나 **어떤 항목에도 설정되지 않았고 읽는 코드도 없다** — 배선되지 않은 죽은 필드다.
결과적으로 `field_manager`·`staff` 에게 「채용」 메뉴가 보이고, 누르면 `/admin` 으로 튕긴다.

데이터가 새지는 않는다(서버 게이트가 막는다). 그러나 죽은 링크이고, 기능의 존재가 전원에게
노출된다.

### 1-5. 지금이 적기다

실측(2026-09-10): `membership_permission_overrides` **0행**, `can_generate_report` **0명**,
`attendance_payroll_admin` **0명**.

**이전할 데이터가 없다.** 키 이름·스키마·기한 정책을 원하는 대로 정할 수 있다. 사용자가 늘고
부여 이력이 쌓인 뒤에 하면 같은 작업이 몇 배로 커진다.

---

## 2. 설계 원칙

1. **정의는 한 곳.** 역할↔권한 매핑은 한 파일에서만 선언한다. 기능 코드·RLS·사이드바는 그것을
   참조만 한다. 배열을 복사하는 순간 이 설계는 실패한 것이다.
2. **기능 코드는 역할을 모른다.** `can(session, "job_application.read")` 만 안다. 나중에 그 권한을
   가진 역할이 바뀌어도 기능 코드는 한 글자도 안 바뀐다.
3. **서버가 유일한 집행자.** 사이드바 필터는 UX다. `AdminShell` 은 클라이언트 컴포넌트이므로
   메뉴 목록은 어차피 번들에 있다. 페이지·서버 액션·RLS 3중 게이트는 그대로 유지한다
   (CLAUDE.md §6).
4. **잠기지 않는다.** 어떤 설정 조합으로도 「아무도 권한을 관리할 수 없는」 상태가 되면 안 된다.
   §3-4 의 보호 규칙이 이것을 보장한다.
5. **한 번에 하나씩 옮긴다.** 토대를 놓는 단계에서는 **어떤 권한도 바뀌지 않는다.** 기능별 전환은
   그 기능의 실제 게이트를 읽고 하나씩 한다.

---

## 3. 모델

### 3-0. 기존 오버라이드 키 4개는 이름을 유지한다

`order_processor` · `maintenance_status_change` · `property_room_manage` · `can_generate_report` 는
RLS 정책과 앱 코드가 **그 문자열 그대로**를 검사하고 있다. 이름을 바꾸면 그 정책들을 함께 고쳐야
하므로 레지스트리에 원래 이름으로 넣었다. 5단계에서 기능을 옮길 때 정리한다.

이 키들의 `roles` 는 **각 기능의 현재 RLS 정책에서 그대로 옮겨 적은 값**이다(2026-09-10 실측).
관리 화면이 「역할로 받은 권한」을 보여줄 때 사실과 달라지면 안 되기 때문이다.
`property_room_manage` 만 `roles: []` 인데, 현재 정책이 오버라이드 보유자와 플랫폼 관리자에게만
쓰기를 열어 원래부터 「지정된 개인만」인 권한이기 때문이다.

### 3-0-1. 전무는 owner 와 동등하다

DB 헬퍼 `has_org_role` 이 「목록에 `owner` 가 있으면 `senior_managing_director` 도 통과」로 동작한다
(마이그레이션 202607130003). **판정식도 같아야 한다** — 다르면 같은 권한이 앱에서는 열리고 RLS
에서는 막히는 상태가 된다. `evaluateCapability`(앱)와 `has_capability`(SQL) 양쪽에 같은 동등 규칙을
넣었고, 테스트가 「전무는 owner 가 가진 것을 모두 가진다」를 전 키에 대해 검증한다.

### 3-1. 권한 키(capability)

권한의 단위. `도메인.동작` 형태의 문자열이다.

현재 레지스트리(2026-09-10):

```txt
permission.manage           권한 관리 (systemOnly — 개인 지정 불가)
job_application.read        지원서 열람
job_application.triage      지원서 심사 상태 변경
job_application.delete      지원서 삭제
order_processor             발주 상태 처리          ← 기존 키, 이름 유지(§3-0)
maintenance_status_change   수리 상태 변경          ← 기존 키
property_room_manage        건물·객실 관리          ← 기존 키
can_generate_report         일일 업무일지 생성      ← 기존 키
```

앞으로 추가될 것(5단계에서 해당 기능을 옮길 때): `user.manage` · `payroll.view` 등.

읽기와 쓰기를 나누는 이유: 「보기만 되는 사람」과 「처리까지 되는 사람」이 실제로 다르다. 지금은
채용에서 볼 수 있으면 삭제까지 된다.

### 3-2. 키마다 정책을 갖는다

```ts
"job_application.read": {
  roles: [],                  // 역할로는 아무도 안 받는다 → 지정된 개인만
  individualGrant: true,
  individualDeny: false,      // 역할 부여가 없으므로 차단할 대상이 없다
  requiresExpiry: false,      // 상시 업무 → 무기한 지정 허용
  platformBypass: true,
},
order_processor: {
  roles: ["owner", "senior_managing_director", "office_admin", "cs_staff", "field_manager"],
  individualGrant: true,
  individualDeny: true,       // 「사무직인데 이 사람만 제외」
  requiresExpiry: true,       // 기존 시한부 정책 유지
  platformBypass: true,
},
```

| 필드 | 뜻 |
| --- | --- |
| `roles` | 이 역할이면 기본으로 받는다. **빈 배열이면 「지정된 개인만」**이 된다 |
| `individualGrant` | 개인에게 추가 부여할 수 있는가 |
| `individualDeny` | 역할로 받은 것을 개인에게서 뺄 수 있는가 |
| `requiresExpiry` | 부여에 기한이 반드시 필요한가 |
| `platformBypass` | 플랫폼 개발자(`developer_super_admin`)가 통과하는가 |
| `systemOnly` | 관리 화면에 **노출조차 하지 않는다**(권한 관리 자체) |

**기존 결정과의 관계.** `27-permission-override-workflow.md` 는 「모든 부여에 기한 필수, 무기한
없음」을 확정 결정으로 적고 있다. 이 설계는 그것을 **키별 정책으로 일반화**한다 — 기존 예외성
권한은 `requiresExpiry: true` 로 그대로 두고, 상시 업무 지정(채용 담당자 등)만 무기한을 허용한다.
결정이 뒤집히는 것이 아니라 적용 범위가 명시된다.

### 3-3. 판정식

```txt
can(user, cap) =
      NOT denied(user, cap)
  AND ( granted(user, cap)
        OR role(user) ∈ cap.roles
        OR (is_platform_admin(user) AND cap.platformBypass) )
```

- **차단이 최우선이다.** 개인 부여보다도 앞선다. 「빼라」는 지시가 「줘라」보다 강해야 사고가
  안전한 쪽으로 난다.
- 부여·차단은 모두 **활성인 것만** 센다(회수되지 않았고, 기한이 있으면 아직 지나지 않은 것).

### 3-4. 잠기지 않기 위한 보호 규칙

| 규칙 | 이유 |
| --- | --- |
| `owner` · `senior_managing_director` · `developer_super_admin` 에게는 **차단을 걸 수 없다** | 소유자를 잠그면 되돌릴 사람이 없다 |
| **자기 자신에게 부여·차단 불가** | 이미 DB 제약으로 존재(`no_self_grant`). 차단에도 같이 적용 |
| 권한 관리 자체(`permission.manage`)는 **개인 부여·차단 대상이 아니다** | 관리 권한을 개인 지정으로 뺏고 주면 잠금 사고가 난다. 역할로만 결정 |

---

## 4. 데이터 모델

### 4-1. `capability_roles` (신설)

역할↔권한 매핑을 **DB 에도 둔다.** RLS 가 그것을 읽어야 하기 때문이다.

```sql
create table public.capability_roles (
  capability text not null,
  role organization_role not null,
  primary key (capability, role)
);
```

**시드는 마이그레이션이 TypeScript 정의로부터 만든다.** 사람이 SQL 에 다시 적지 않는다 — 다시
적는 순간 §1-1 의 문제가 재발한다. 일치는 테스트가 검증한다(§6).

### 4-2. `membership_permission_overrides` (변경)

기존 표를 재사용한다. 부여자·사유·회수·조직 격리가 이미 있다.

| 변경 | 내용 |
| --- | --- |
| `effect` 컬럼 추가 | `'grant' | 'deny'`, 기본 `'grant'` |
| `expires_at` NULL 허용 | NULL = 무기한. 키 정책이 `requiresExpiry: true` 면 서버가 거부 |
| 부분 유니크 인덱스 | 활성 행 기준 `(organization_id, user_id, permission_key, effect)` 중복 방지 |

행이 0건이므로 **데이터 이전이 없다.** 표 이름은 유지한다(참조가 여러 곳이고 의미는 그대로다).

### 4-3. `has_capability()` (신설 SQL 함수)

```sql
has_capability(target_organization_id uuid, target_user_id uuid, target_capability text)
  returns boolean
```

§3-3 의 판정식을 그대로 담는다. RLS 정책은 역할 배열을 **다시 적지 않고** 이 함수만 부른다.

```sql
-- 전: 정책마다 역할 배열을 복사
using (has_org_role(organization_id, ARRAY['owner','senior_managing_director','office_admin']))

-- 후: 권한 키 하나
using (has_capability(organization_id, (select auth.uid()), 'job_application.read'))
```

기존 `has_org_role` · `has_permission_override` 는 남긴다 — 아직 전환하지 않은 정책들이 쓴다.

---

## 5. 판정 경로

세 곳에서 묻지만 **규칙은 하나**다.

| 부르는 곳 | 방법 | 비고 |
| --- | --- | --- |
| 서버 컴포넌트 · 서버 액션 | `await can(session, cap)` | `react.cache` 로 요청당 1회 조회 |
| 클라이언트(사이드바 등) | 세션에 실린 **유효 권한 집합** | 서버가 계산한 결과를 그대로 받음 |
| RLS 정책 | `has_capability(...)` | DB 안에서 독립 판정 |

**클라이언트는 스스로 계산하지 않는다.** 서버가 세션을 만들 때 유효 권한 집합을 한 번 계산해
실어 보내고, 사이드바는 그 집합을 보기만 한다. 계산이 두 벌이 아니므로 어긋날 수 없다.

`AppSession` 에 `capabilities: readonly Capability[]` 가 추가된다(현재는 `organization` + `user`
뿐). 조회는 멤버십 1회 + 오버라이드 1회로 끝난다.

---

## 6. 드리프트 방지

권한 설계가 실패하는 방식은 언제나 「두 벌이 갈라지는 것」이다. 세 가지 장치를 둔다.

1. **TypeScript 레지스트리가 원본.** 역할표는 `src/config/capabilities.ts` 에만 있다.
2. **마이그레이션이 그것으로부터 `capability_roles` 를 채운다.** 손으로 SQL 을 적지 않는다.
3. **일치 테스트.** `capability_roles` 의 내용과 TypeScript 레지스트리가 같은지 검증한다.
   갈라지면 테스트가 깨진다. (이 저장소는 RLS InitPlan 전면 적용 때 「체크섬으로 무변경을 증명」한
   전례가 있다 — 같은 방식이다.)

추가로, 레지스트리에 없는 키를 쓰면 **타입 에러**가 난다(`Capability` 는 유니온 타입).

---

## 7. 사용자 관리 화면에서 관리한다

`/admin/users/[id]` 의 「권한 예외」 카드를 **「권한」 카드로 확장**한다. 새 화면을 만들지 않는다 —
역할 변경이 이미 그 화면에 있고, 권한은 그 옆에 있어야 한다.

카드가 보여줄 것:

| 구역 | 내용 |
| --- | --- |
| 역할로 받은 권한 | 읽기 전용 목록. 「역할(사무직)으로 부여됨」이라고 근거를 밝힌다 |
| 개인 부여 | 부여 버튼 · 사유 필수 · 기한(키 정책에 따라 필수/선택) · 회수 |
| 개인 차단 | 역할로 받은 권한 옆의 「제외」. 사유 필수 · 해제 가능 |
| 현재 유효 권한 | 위 셋을 합친 **최종 결과**. 「이 사람이 지금 실제로 무엇을 할 수 있는가」 |

**최종 결과를 같이 보여주는 것이 중요하다.** 부여와 차단이 겹치면 사람은 결과를 암산하지 못한다.
화면이 판정식을 대신 계산해 보여줘야 실수를 막는다.

관리 권한: `owner` · `senior_managing_director` · `developer_super_admin`(현재와 동일).

### 구현 메모 (2026-09-10)

- 부여 드롭다운은 **레지스트리가 정한 것만** 낸다. i18n 사전에 라벨이 남아 있어도 개인 부여가
  불가능한 키는 뜨지 않는다.
- 기한 필드의 필수 표시가 **키 정책을 따른다**(`requiresExpiry`). 비우면 무기한이고, 기한이 필요한
  키에서 비우면 서버가 거부한다.
- 차단 버튼은 「역할로 받은 권한」 칩 옆에 붙는다 — 뺄 대상이 눈앞에 있어야 조작이 자연스럽다.
  owner·전무·개발자에게는 버튼이 뜨지 않고, 서버도 같은 규칙으로 거부한다(이중 방어).
- 부여·차단·회수 후 `router.refresh()` 로 **최종 유효 권한을 서버가 다시 계산**한다. 클라이언트가
  판정식을 흉내 내면 그 순간 계산이 두 벌이 된다.
- 시각 품질(레이아웃·간격·칩 스타일)은 **전체 완료 후 조정**한다(사용자 지시 2026-09-10).

**다국어는 처음부터 셋 다.** 권한 키의 라벨·설명, 부여/차단/회수 문구, 사유 입력, 만료 표시,
빈 상태를 `ko`/`ja`/`en` 로 함께 만든다(CLAUDE.md §2). 라벨은 기존
`admin.users.console.keys` 네임스페이스를 확장한다.

---

## 8. 이행 단계

| 단계 | 내용 | 권한이 바뀌는가 |
| --- | --- | --- |
| ~~**1. 설계 문서**~~ | 완료 2026-09-10 | 아니오 |
| ~~**2. 토대**~~ | 완료 2026-09-10 — 레지스트리 · 서버 리졸버 · `has_capability` · `capability_roles` · 세션 적재 · 일치 테스트 | **아니오** |
| ~~**3. 관리 UI**~~ | 완료 2026-09-10 — `/admin/users/[id]` 권한 카드(부여·차단·유효 권한) + i18n 3개 국어 | 아니오 |
| **4. 사이드바** | `NavigationItem.capability` 배선 + 필터 | 메뉴 노출만 |
| **5. 기능 전환** | 채용 → 사용자 관리 → 설정 → 급여 → … **한 번에 하나씩** | 예 |

2단계는 **순수 배선**이다. 기존 술어(`canReadJobApplications` 등)는 레지스트리를 부르는 얇은
껍데기가 되고, 호출부는 한 줄도 바뀌지 않으며, 판정 결과도 같다.

5단계에서만 실제 권한이 움직인다. 기능마다 그 기능의 현재 게이트를 읽고, 바뀌는 사람을 확인하고,
결정 로그에 남긴다. **일괄 전환하지 않는다** — 추측으로 옮기면 「필요한 사람이 못 쓰게 되는」
방향으로 실패한다.

---

## 9. 흡수 대상 — 기존 개인 단위 장치 3종

`attendance_payroll_admin` · `leave_approver_role` · `can_generate_report` 는 각각 컬럼으로 박혀
있고 감사 기록이 없다. 모두 사용자가 0명이므로 **지금이면 비용 없이 흡수할 수 있다.**

다만 5단계(기능 전환)에 포함시키고, 토대 단계에서는 건드리지 않는다. 이 컬럼들은 RLS 정책과
서버 코드 여러 곳이 참조하고 있어 개별 확인이 필요하다.

---

## 10. 미결 사항

이 문서를 확정하기 전에 답이 필요한 것.

1. **채용 권한의 `roles` 를 어떻게 둘 것인가.** `[]`(지정된 개인만) 인지, `["owner",
   "senior_managing_director"]`(소유자는 항상 + 지정) 인지. 후자를 권한다 — 지정 목록이 비면
   아무도 못 보는 상태가 되고, 담당자를 지정할 사람도 그 화면을 봐야 하는 경우가 있다.
2. **현재 `office_admin` 1명의 처리.** 지금 역할로 자동 열람 중이다. 전환 시점에 지정 목록으로
   옮길지, 빠질지.
3. **읽기/쓰기 분리를 채용부터 적용할지.** `job_application.read` 와 `.triage`/`.delete` 를 나누면
   「보기만 되는 담당자」를 만들 수 있다. 나누지 않으면 지금처럼 보면 다 된다.

1·2번은 5단계(채용 전환)에서 필요하고, 3번은 3-1절 키 목록에 영향을 준다.
