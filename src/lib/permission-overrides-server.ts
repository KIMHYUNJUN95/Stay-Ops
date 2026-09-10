// Permission override data layer — service-role reads/writes for the per-user, time-bound feature
// exceptions granted from /admin/users/[id]. The table has NO write RLS policies (service-role only);
// authorization (owner/developer, org scope, self-grant block) is enforced by the calling server
// action. See migration 202607090002 and docs/product/27-permission-override-workflow.md.

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  canBeDenied,
  capabilityPolicy,
  isCapability,
  type Capability,
  type CapabilityEffect,
} from "@/config/capabilities";
import type { Role } from "@/config/roles";

export type MemberOverride = {
  id: string;
  key: string;
  /** 부여(grant) 인지 차단(deny) 인지. 차단이 부여를 이긴다. */
  effect: CapabilityEffect;
  reason: string;
  /** ISO. `null` 이면 무기한 — 상시 업무 지정에서만 허용된다(레지스트리의 requiresExpiry). */
  expires: string | null;
  granted: string; // ISO (created_at)
  by: string; // granter display name ("—" if unknown)
};

type OverrideRow = {
  id: string;
  permission_key: string;
  effect: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
  granted_by_user_id: string | null;
};

/** Active (not revoked, not expired) overrides for one member, newest first, with granter names. */
export async function listMemberOverrides(
  organizationId: string,
  userId: string,
): Promise<MemberOverride[]> {
  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("membership_permission_overrides")
    .select("id, permission_key, effect, reason, expires_at, created_at, granted_by_user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) return [];
  // 만료 필터를 SQL 이 아니라 여기서 한다. `gt("expires_at", …)` 는 NULL 행(무기한)을 제외해 버린다 —
  // 무기한을 허용한 뒤로는 그 필터가 곧 「상시 지정은 목록에 안 뜬다」가 된다.
  const now = Date.now();
  const rows = ((data ?? []) as OverrideRow[]).filter(
    (row) => !row.expires_at || new Date(row.expires_at).getTime() > now,
  );

  const granterIds = [...new Set(rows.map((r) => r.granted_by_user_id).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (granterIds.length > 0) {
    const { data: profs } = await service.from("profiles").select("id, name").in("id", granterIds);
    for (const p of (profs ?? []) as { id: string; name: string }[]) nameById.set(p.id, p.name);
  }

  return rows.map((r) => ({
    id: r.id,
    key: r.permission_key,
    effect: (r.effect === "deny" ? "deny" : "grant") as CapabilityEffect,
    reason: r.reason,
    expires: r.expires_at,
    granted: r.created_at,
    by: (r.granted_by_user_id && nameById.get(r.granted_by_user_id)) || "—",
  }));
}

/**
 * True if the user currently holds an ACTIVE (not revoked, not expired) override for `key` in the org.
 * App-side counterpart of the SQL `has_permission_override()` used in RLS — for features gated in
 * server code rather than RLS (e.g. the mobile daily-report action).
 */
export async function hasPermissionOverride(
  organizationId: string,
  userId: string,
  key: string,
): Promise<boolean> {
  const service = getSupabaseServiceClient();
  const { data } = await service
    .from("membership_permission_overrides")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("permission_key", key)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/**
 * 개인 부여·차단 한 건을 만든다.
 *
 * 검증은 전부 **레지스트리를 근거로** 한다(`src/config/capabilities.ts`) — 어떤 키가 개인 지정
 * 가능한지, 기한이 필수인지, 차단을 걸 수 있는지가 거기 한 곳에만 적혀 있다. 여기서 규칙을 다시
 * 적으면 그 순간 정의가 두 벌이 된다.
 */
export async function grantMemberOverride(input: {
  organizationId: string;
  userId: string;
  permissionKey: string;
  effect: CapabilityEffect;
  grantedByUserId: string;
  reason: string;
  /** 비우면 무기한. 키가 기한을 요구하면 거부한다. */
  expiresAt: string | null;
  /** 대상자의 역할 — 차단 면역 판정에 쓴다. */
  targetRole: Role;
}): Promise<{ ok: true; override: MemberOverride } | { ok: false; error: string }> {
  if (!isCapability(input.permissionKey)) return { ok: false, error: "invalid_key" };
  const capability = input.permissionKey as Capability;
  const policy = capabilityPolicy(capability);

  // 관리 화면에 뜨지 않는 키(권한 관리 자체)는 개인 지정 대상이 아니다 — 뺏고 줄 수 있으면
  // 「아무도 권한을 관리할 수 없는」 잠금 상태가 만들어진다.
  if (policy.systemOnly) return { ok: false, error: "not_assignable" };
  if (input.effect === "grant" && !policy.individualGrant) {
    return { ok: false, error: "grant_not_allowed" };
  }
  if (input.effect === "deny" && !policy.individualDeny) {
    return { ok: false, error: "deny_not_allowed" };
  }
  // 소유자를 잠그면 되돌릴 사람이 없다.
  if (input.effect === "deny" && !canBeDenied(input.targetRole)) {
    return { ok: false, error: "deny_immune_role" };
  }

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "reason_required" };

  let expiresIso: string | null = null;
  const raw = input.expiresAt?.trim();
  if (raw) {
    const expiresMs = Date.parse(raw);
    if (!Number.isFinite(expiresMs)) return { ok: false, error: "invalid_expiry" };
    if (expiresMs <= Date.now()) return { ok: false, error: "expiry_in_past" };
    expiresIso = new Date(expiresMs).toISOString();
  } else if (policy.requiresExpiry) {
    // 일시적 예외에는 기한이 필수다(27-permission-override-workflow.md 의 결정).
    return { ok: false, error: "expiry_required" };
  }

  // DB 제약도 자기부여를 막지만, 깔끔한 오류를 위해 먼저 거른다.
  if (input.grantedByUserId === input.userId) return { ok: false, error: "self_grant_blocked" };

  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("membership_permission_overrides")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      permission_key: capability,
      effect: input.effect,
      granted_by_user_id: input.grantedByUserId,
      reason,
      expires_at: expiresIso,
    })
    .select("id, created_at")
    .single();
  if (error || !data) {
    // 활성 행 부분 유니크 인덱스 위반 = 같은 방향의 지정이 이미 있다.
    if (error?.code === "23505") return { ok: false, error: "already_assigned" };
    return { ok: false, error: "insert_failed" };
  }
  const row = data as { id: string; created_at: string };

  return {
    ok: true,
    override: {
      id: row.id,
      key: capability,
      effect: input.effect,
      reason,
      expires: expiresIso,
      granted: row.created_at,
      by: "", // filled by the caller from the actor's name
    },
  };
}

/** Soft-revoke: set revoked_at + revoked_by. Org-scoped so an override can't be revoked cross-org. */
export async function revokeMemberOverride(input: {
  overrideId: string;
  organizationId: string;
  revokedByUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from("membership_permission_overrides")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: input.revokedByUserId,
    })
    .eq("id", input.overrideId)
    .eq("organization_id", input.organizationId)
    .is("revoked_at", null);
  if (error) return { ok: false, error: "revoke_failed" };
  return { ok: true };
}
