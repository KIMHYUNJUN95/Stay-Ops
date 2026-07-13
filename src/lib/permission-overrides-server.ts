// Permission override data layer — service-role reads/writes for the per-user, time-bound feature
// exceptions granted from /admin/users/[id]. The table has NO write RLS policies (service-role only);
// authorization (owner/developer, org scope, self-grant block) is enforced by the calling server
// action. See migration 202607090002 and docs/product/27-permission-override-workflow.md.

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { isPermissionOverrideKey } from "@/config/permission-overrides";

export type MemberOverride = {
  id: string;
  key: string;
  reason: string;
  expires: string; // ISO
  granted: string; // ISO (created_at)
  by: string; // granter display name ("—" if unknown)
};

type OverrideRow = {
  id: string;
  permission_key: string;
  reason: string;
  expires_at: string;
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
    .select("id, permission_key, reason, expires_at, created_at, granted_by_user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as OverrideRow[];

  const granterIds = [...new Set(rows.map((r) => r.granted_by_user_id).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (granterIds.length > 0) {
    const { data: profs } = await service.from("profiles").select("id, name").in("id", granterIds);
    for (const p of (profs ?? []) as { id: string; name: string }[]) nameById.set(p.id, p.name);
  }

  return rows.map((r) => ({
    id: r.id,
    key: r.permission_key,
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

/** Insert a new override. Validates the whitelist, required reason, and future expiry. */
export async function grantMemberOverride(input: {
  organizationId: string;
  userId: string;
  permissionKey: string;
  grantedByUserId: string;
  reason: string;
  expiresAt: string; // ISO / datetime-local
}): Promise<{ ok: true; override: MemberOverride } | { ok: false; error: string }> {
  if (!isPermissionOverrideKey(input.permissionKey)) return { ok: false, error: "invalid_key" };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "reason_required" };
  const expiresMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresMs)) return { ok: false, error: "invalid_expiry" };
  if (expiresMs <= Date.now()) return { ok: false, error: "expiry_in_past" };
  // DB constraint also blocks self-grant, but reject early for a clean error.
  if (input.grantedByUserId === input.userId) return { ok: false, error: "self_grant_blocked" };

  const service = getSupabaseServiceClient();
  const expiresIso = new Date(expiresMs).toISOString();
  const { data, error } = await service
    .from("membership_permission_overrides")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      permission_key: input.permissionKey,
      granted_by_user_id: input.grantedByUserId,
      reason,
      expires_at: expiresIso,
    } as never)
    .select("id, created_at")
    .single();
  if (error || !data) return { ok: false, error: "insert_failed" };
  const row = data as { id: string; created_at: string };

  return {
    ok: true,
    override: {
      id: row.id,
      key: input.permissionKey,
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
    } as never)
    .eq("id", input.overrideId)
    .eq("organization_id", input.organizationId)
    .is("revoked_at", null);
  if (error) return { ok: false, error: "revoke_failed" };
  return { ok: true };
}
