"use server";

import type { OrganizationRole } from "@/config/roles";
import type { Database } from "@/types/database";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// service.rpc() is not typed because database.ts omits Relationships.
// This provides just enough typing for the invite code join RPC.
type JoinRpcRow = {
  organization_id: string;
  role: Database["public"]["Enums"]["organization_role"];
  status: string;
};
type RpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: JoinRpcRow[] | null; error: { message: string } | null }>;
};

export type InviteValidationResult =
  | { ok: true; organizationId: string; defaultRole: OrganizationRole }
  | { ok: false; error: "invalid" | "expired" | "inactive" | "maxed_out" };

/**
 * Validates an invite code without consuming it.
 * Returns the target organization and default role if the code is usable.
 */
export async function validateInviteCode(
  code: string,
): Promise<InviteValidationResult> {
  if (!code?.trim()) return { ok: false, error: "invalid" };

  type InviteRow = {
    organization_id: string;
    default_role: string;
    expires_at: string;
    max_uses: number;
    used_count: number;
    is_active: boolean;
  };

  const service = getSupabaseServiceClient();
  const { data: rawData, error } = await service
    .from("invite_codes")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (error || !rawData) return { ok: false, error: "invalid" };
  const data = rawData as unknown as InviteRow;
  if (!data.is_active) return { ok: false, error: "inactive" };
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { ok: false, error: "expired" };
  }
  if (data.max_uses !== null && data.used_count >= data.max_uses) {
    return { ok: false, error: "maxed_out" };
  }

  return {
    ok: true,
    organizationId: data.organization_id as string,
    defaultRole: data.default_role as OrganizationRole,
  };
}

export type JoinResult =
  | { ok: true; organizationId: string; role: OrganizationRole }
  | {
      ok: false;
      error:
        | "invalid"
        | "expired"
        | "inactive"
        | "maxed_out"
        | "already_member"
        | "rpc_error";
    };

/**
 * Joins an organization using an invite code.
 * Validates the code first, then calls the join_organization_with_invite_code RPC.
 * The RPC atomically increments used_count and creates the membership row.
 */
export async function joinOrganizationWithInviteCode(
  userId: string,
  code: string,
): Promise<JoinResult> {
  const validation = await validateInviteCode(code);
  if (!validation.ok) return validation;

  const service = getSupabaseServiceClient();
  const { data, error } = await (service as unknown as RpcClient).rpc(
    "join_organization_with_invite_code",
    { p_user_id: userId, p_code: code.trim().toUpperCase() },
  );

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return { ok: false, error: "already_member" };
    }
    return { ok: false, error: "rpc_error" };
  }

  const row = data?.[0];
  if (!row) return { ok: false, error: "rpc_error" as const };

  return {
    ok: true,
    organizationId: row.organization_id,
    role: row.role as OrganizationRole,
  };
}
