import type { OrganizationRole, Role } from "@/config/roles";

/**
 * 권한 레지스트리 — 「누가 이 기능을 쓸 수 있는가」의 **유일한 정의처**.
 *
 * 설계 문서: `docs/engineering/14-permission-architecture.md`
 *
 * ## 왜 있는가
 *
 * 지금까지는 기능마다 역할 배열을 직접 적었다. 그래서 같은 규칙이 페이지 게이트 · 서버 액션 ·
 * RLS 정책(SQL) · 사이드바 **네 곳에 복사**됐고, 한쪽만 고쳐지는 사고가 반복됐다. 여기서는 기능이
 * 역할을 모른다 — 권한 키만 묻는다. 역할표는 이 파일에만 있다.
 *
 * ## 두 가지 부여 방식이 같은 장치 위에 있다
 *
 * - **역할별로 묶어 쓰는 기능**: `roles` 를 채운다.
 * - **지정된 사람만 쓰는 기능**: `roles: []` 로 두고 개인에게 부여한다.
 *
 * 나중에 방식을 바꿔도(역할 부여 → 개인 지정, 또는 그 반대) **기능 코드는 한 줄도 바뀌지 않는다.**
 *
 * ## 이 파일을 고치면
 *
 * `capability_roles` 시드 마이그레이션도 함께 갱신해야 한다. 손으로 맞추지 않는다 —
 * `src/lib/__tests__/capability-registry.test.ts` 가 불일치를 잡고, **붙여넣을 SQL 을 그대로
 * 출력해 준다**(생성은 `src/lib/capability-seed.ts`).
 */

/** 개인 부여·차단이 저장되는 방향. 차단이 부여를 이긴다(`evaluateCapability`). */
export type CapabilityEffect = "grant" | "deny";

export type CapabilityPolicy = {
  /**
   * 이 역할이면 기본으로 받는다.
   *
   * **빈 배열이면 「지정된 개인만」**이 된다 — 역할로는 아무도 받지 못하고 개인 부여로만 열린다.
   */
  roles: readonly OrganizationRole[];
  /** 개인에게 추가로 부여할 수 있는가. */
  individualGrant: boolean;
  /**
   * 역할로 받은 것을 개인에게서 뺄 수 있는가.
   *
   * `roles` 가 비어 있으면 뺄 대상이 없으므로 의미가 없다(테스트가 그 조합을 막는다).
   */
  individualDeny: boolean;
  /**
   * 부여에 기한이 반드시 필요한가.
   *
   * `27-permission-override-workflow.md` 의 「모든 부여는 시한부」 결정을 **키별 정책으로
   * 일반화**한 것이다. 일시적 예외는 `true` 로 두어 그 결정을 그대로 지키고, 상시 업무 지정
   * (채용 담당자처럼 계속 그 일을 하는 사람)만 `false` 로 무기한을 허용한다. 상시 업무에 기한을
   * 걸면 어느 날 조용히 만료돼 담당자가 일을 못 하게 된다.
   */
  requiresExpiry: boolean;
  /** 플랫폼 개발자(`developer_super_admin`)가 역할·부여와 무관하게 통과하는가. */
  platformBypass: boolean;
  /**
   * 개인 부여·차단의 대상이 아님을 넘어, **관리 화면에 노출조차 하지 않는다.**
   *
   * 권한 관리 자체가 이런 키다. 개인 지정으로 뺏고 줄 수 있게 두면 「아무도 권한을 관리할 수 없는」
   * 잠금 상태가 만들어진다.
   */
  systemOnly: boolean;
};

/**
 * 권한 키는 `도메인.동작` 이다.
 *
 * 읽기와 쓰기를 나누는 이유: 「보기만 되는 사람」과 「처리까지 되는 사람」이 실제로 다르다. 나눠 두면
 * 나중에 쓸 수 있고, 안 나누면 나중에 나눌 때 이미 부여된 권한을 다시 배분해야 한다. 구분이 필요
 * 없는 기능은 키 하나만 두면 된다.
 */
export const CAPABILITIES = {
  /**
   * 권한 관리 — 개인 부여·차단을 다루는 권한.
   *
   * **개인 지정 대상이 아니다.** 역할로만 결정한다(§3-4 잠금 방지).
   */
  "permission.manage": {
    roles: ["owner", "senior_managing_director"],
    individualGrant: false,
    individualDeny: false,
    requiresExpiry: true,
    platformBypass: true,
    systemOnly: true,
  },

  /**
   * 채용 지원서 — **지정된 개인만**(2026-09-10 사용자 요구: 「사무직이든 현장직이든 지정된 소수」).
   *
   * `roles` 의 최종 값은 전환 시점(5단계)에 확정한다 — 지금은 아무도 이 키를 쓰지 않으므로
   * 실제 권한에 영향이 없다. 현재 채용 콘솔은 여전히 `canReadJobApplications(role)` 로 돈다.
   */
  "job_application.read": {
    roles: [],
    individualGrant: true,
    individualDeny: false,
    requiresExpiry: false,
    platformBypass: true,
    systemOnly: false,
  },
  "job_application.triage": {
    roles: [],
    individualGrant: true,
    individualDeny: false,
    requiresExpiry: false,
    platformBypass: true,
    systemOnly: false,
  },
  "job_application.delete": {
    roles: [],
    individualGrant: true,
    individualDeny: false,
    requiresExpiry: false,
    platformBypass: true,
    systemOnly: false,
  },

  /**
   * ## 기존 오버라이드 키 4개
   *
   * **이름을 바꾸지 않는다.** RLS 정책과 앱 코드가 이 문자열 그대로를 검사하고 있어
   * (`has_permission_override(org, uid, 'order_processor')` 등), 이름을 바꾸면 그 정책들을 함께
   * 고쳐야 한다. 5단계에서 기능을 옮길 때 정리한다.
   *
   * `roles` 는 **각 기능의 현재 RLS 정책에서 그대로 옮겨 적은 값**이다(2026-09-10 실측). 관리
   * 화면이 「역할로 받은 권한」을 보여줄 때 사실과 달라지면 안 되기 때문이다.
   */

  /** `order_requests` UPDATE 정책. 본인이 올린 건은 역할과 무관하게 수정 가능(행 단위라 여기 없다). */
  order_processor: {
    roles: ["owner", "senior_managing_director", "office_admin", "cs_staff", "field_manager"],
    individualGrant: true,
    individualDeny: true,
    requiresExpiry: true,
    platformBypass: true,
    systemOnly: false,
  },

  /** `maintenance_reports` UPDATE 정책. */
  maintenance_status_change: {
    roles: [
      "owner",
      "senior_managing_director",
      "office_admin",
      "cs_staff",
      "field_manager",
      "staff",
    ],
    individualGrant: true,
    individualDeny: true,
    requiresExpiry: true,
    platformBypass: true,
    systemOnly: false,
  },

  /**
   * `properties` / `rooms` 쓰기.
   *
   * 역할로는 아무도 받지 않는다 — 현재 정책이 **오버라이드 보유자와 플랫폼 관리자에게만** 쓰기를
   * 연다. 원래부터 「지정된 개인만」인 권한이다.
   */
  property_room_manage: {
    roles: [],
    individualGrant: true,
    individualDeny: false,
    requiresExpiry: true,
    platformBypass: true,
    systemOnly: false,
  },

  /**
   * 일일 업무일지 생성. RLS 가 아니라 앱 게이트다(`canGenerateDailyReport`).
   *
   * 파트타임을 제외한 전 역할이 기본으로 갖고, 관리 업무를 겸하는 파트타이머에게 개인 부여한다.
   */
  can_generate_report: {
    roles: [
      "owner",
      "senior_managing_director",
      "office_admin",
      "cs_staff",
      "field_manager",
      "staff",
    ],
    individualGrant: true,
    individualDeny: true,
    requiresExpiry: true,
    platformBypass: true,
    systemOnly: false,
  },
} as const satisfies Record<string, CapabilityPolicy>;

export type Capability = keyof typeof CAPABILITIES;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as Capability[];

export function isCapability(value: string): value is Capability {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, value);
}

export function capabilityPolicy(capability: Capability): CapabilityPolicy {
  return CAPABILITIES[capability];
}

/** 관리 화면에서 개인 부여·차단을 다룰 수 있는 키. */
export function assignableCapabilities(): Capability[] {
  return CAPABILITY_KEYS.filter((key) => {
    const policy = capabilityPolicy(key);
    return !policy.systemOnly && (policy.individualGrant || policy.individualDeny);
  });
}

/**
 * 차단을 걸 수 없는 역할.
 *
 * 소유자를 잠그면 되돌릴 사람이 없다. 전무는 owner 동등(`isOrgTopAdmin`)이고, 플랫폼 개발자는
 * 마지막 복구 수단이다.
 */
const DENY_IMMUNE_ROLES: readonly Role[] = [
  "owner",
  "senior_managing_director",
  "developer_super_admin",
];

export function canBeDenied(role: Role): boolean {
  return !DENY_IMMUNE_ROLES.includes(role);
}

/**
 * 판정식 — 앱과 SQL(`has_capability`)이 **같은 규칙**을 쓴다.
 *
 * ```txt
 * can = NOT denied
 *   AND ( granted OR role ∈ roles OR (platform_admin AND platformBypass) )
 * ```
 *
 * **차단이 최우선이다.** 개인 부여보다도 앞선다 — 「빼라」가 「줘라」보다 강해야 판단이 갈릴 때
 * 안전한 쪽으로 실패한다. 단, 차단 면역 역할에는 적용되지 않는다(잠금 방지).
 *
 * 순수 함수다. 활성 여부(회수·만료) 판단은 부르는 쪽이 이미 걸러서 넘긴다.
 */
export function evaluateCapability(args: {
  capability: Capability;
  role: Role;
  /** 활성 개인 부여를 보유하는가. */
  granted: boolean;
  /** 활성 개인 차단을 보유하는가. */
  denied: boolean;
}): boolean {
  const policy = capabilityPolicy(args.capability);

  if (args.denied && policy.individualDeny && canBeDenied(args.role)) return false;

  if (args.role === "developer_super_admin") return policy.platformBypass;

  if (args.granted && policy.individualGrant) return true;

  return roleHasCapability(args.role, policy.roles);
}

/**
 * 역할이 이 권한을 기본으로 갖는가.
 *
 * **전무(`senior_managing_director`)는 `owner` 와 동등**하다(`isOrgTopAdmin`, 마이그레이션
 * 202607130003). DB 헬퍼 `has_org_role` 이 이미 「목록에 owner 가 있으면 전무도 통과」로 동작하므로,
 * 여기서도 같아야 한다 — 다르면 같은 권한이 앱에서는 열리고 RLS 에서는 막히는(또는 그 반대) 상태가
 * 된다. 레지스트리에 owner 만 적고 전무를 빠뜨려도 전무가 조용히 권한을 잃지 않는다.
 */
function roleHasCapability(role: Role, roles: readonly OrganizationRole[]): boolean {
  const list = roles as readonly string[];
  if (list.includes(role)) return true;
  return role === "senior_managing_director" && list.includes("owner");
}
