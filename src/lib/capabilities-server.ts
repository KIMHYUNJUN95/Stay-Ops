import "server-only";
import { cache } from "react";
import {
  CAPABILITY_KEYS,
  evaluateCapability,
  type Capability,
  type CapabilityEffect,
} from "@/config/capabilities";
import type { Role } from "@/config/roles";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * 권한 판정 — 서버 쪽 리졸버.
 *
 * 설계: `docs/engineering/14-permission-architecture.md` §5
 *
 * 규칙 자체는 `evaluateCapability`(순수 함수)가 갖고 있고, 여기서는 **개인 부여·차단을 읽어와**
 * 그 함수에 넘긴다. SQL 쪽 `has_capability()` 도 같은 규칙을 담는다 — 세 경로(서버·클라이언트·RLS)가
 * 한 규칙을 공유하는 것이 이 설계의 핵심이다.
 *
 * **요청당 1회만 조회한다.** `react.cache` 로 감싸 같은 요청 안에서 여러 게이트가 물어도 DB 는 한
 * 번만 간다. 이 저장소는 세션 워터폴로 첫 바이트가 늦어지는 문제를 이미 겪었다.
 */

type ActiveOverride = { permission_key: string; effect: CapabilityEffect };

/** 한 사용자의 활성 개인 부여·차단(회수 안 됐고, 기한이 있으면 아직 안 지난 것). */
const loadActiveOverrides = cache(
  async (organizationId: string, userId: string): Promise<ActiveOverride[]> => {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("membership_permission_overrides")
      .select("permission_key, effect, expires_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .is("revoked_at", null);

    if (error) {
      // 조회 실패를 「권한 없음」으로 흘린다. 부여를 못 읽어 막히는 것이 잘못 열어 주는 것보다 낫다.
      // 조용하면 안 된다 — 사람이 「어제까지 되던 게 안 된다」를 겪게 된다.
      console.error("[capabilities] override read failed:", error.message);
      return [];
    }

    const now = Date.now();
    return (data ?? [])
      .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
      .map((row) => ({
        permission_key: row.permission_key,
        effect: (row.effect === "deny" ? "deny" : "grant") as CapabilityEffect,
      }));
  },
);

type CapabilityInput = {
  organizationId: string;
  userId: string;
  role: Role;
};

/**
 * 이 사용자가 **지금 실제로 가진** 권한 키 전체.
 *
 * 세션에 실어 클라이언트로 보낸다. 클라이언트가 스스로 계산하지 않게 하는 것이 목적이다 —
 * 계산이 두 벌이면 반드시 갈라진다.
 */
export const resolveCapabilities = cache(
  async (input: CapabilityInput): Promise<Capability[]> => {
    const overrides = await loadActiveOverrides(input.organizationId, input.userId);
    const granted = new Set(
      overrides.filter((o) => o.effect === "grant").map((o) => o.permission_key),
    );
    const denied = new Set(
      overrides.filter((o) => o.effect === "deny").map((o) => o.permission_key),
    );

    return CAPABILITY_KEYS.filter((capability) =>
      evaluateCapability({
        capability,
        role: input.role,
        granted: granted.has(capability),
        denied: denied.has(capability),
      }),
    );
  },
);

/** 단건 판정. 내부적으로 같은 캐시를 타므로 여러 번 불러도 조회는 1회다. */
export async function can(input: CapabilityInput, capability: Capability): Promise<boolean> {
  const capabilities = await resolveCapabilities(input);
  return capabilities.includes(capability);
}
