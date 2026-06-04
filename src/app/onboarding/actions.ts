"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getDefaultRouteForRole, isValidPhone } from "@/lib/onboarding";
import { isLocale } from "@/lib/i18n";
import { resolveInviteRpcError } from "@/lib/invite-errors";
import { sanitizeNextPath } from "@/lib/safe-redirect";
import type { Database } from "@/types/database";

type PlatformAdminInsert =
  Database["public"]["Tables"]["platform_admins"]["Insert"];
type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

// The project's database.ts omits Relationships on all tables, which prevents
// Database["public"] from satisfying GenericSchema. service.from() has an untyped
// fallback overload so it works anyway, but service.rpc() does not. This interface
// provides just enough typing for the one RPC call we make.
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

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function sanitizeNext(value: FormDataEntryValue | null): string {
  return sanitizeNextPath(cleanText(value));
}

function normalizeInviteCode(value: FormDataEntryValue | null) {
  return cleanText(value).toUpperCase();
}

/** Redirects to /onboarding with an error key, preserving a safe `next` path if present. */
function onboardingError(errorKey: string, next: string): never {
  const nextSuffix = next ? `&next=${encodeURIComponent(next)}` : "";
  redirect(`/onboarding?error=${errorKey}${nextSuffix}`);
}

async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return user;
}

async function joinInviteCode(userId: string, code: string, next: string) {
  if (!code) {
    return null;
  }

  const service = getSupabaseServiceClient();
  const { data, error } = await (service as unknown as RpcClient).rpc(
    "join_organization_with_invite_code",
    { p_user_id: userId, p_code: code },
  );

  if (error) {
    onboardingError(resolveInviteRpcError(error.message), next);
  }

  const row = data?.[0];
  if (!row) onboardingError("invite_join_failed", next);

  return row.role;
}

export async function completeProfile(formData: FormData) {
  const user = await requireUser();
  const next = sanitizeNext(formData.get("next"));
  const name = cleanText(formData.get("name"));
  const phoneNumber = cleanText(formData.get("phoneNumber"));
  const preferredLanguage = cleanText(formData.get("preferredLanguage"));
  const inviteCode = normalizeInviteCode(formData.get("inviteCode"));

  if (!name || !phoneNumber) {
    onboardingError("missing_profile_fields", next);
  }

  if (!isValidPhone(phoneNumber)) {
    onboardingError("phone_invalid", next);
  }

  if (!isLocale(preferredLanguage)) {
    onboardingError("invalid_language", next);
  }

  const service = getSupabaseServiceClient();
  const profile: ProfileInsert = {
    id: user.id,
    name,
    phone_number: phoneNumber,
    preferred_language: preferredLanguage,
  };

  const { error } = await service.from("profiles").upsert(profile as never);

  if (error) {
    onboardingError("profile_failed", next);
  }

  const role = await joinInviteCode(user.id, inviteCode, next);

  if (role) {
    redirect(next || getDefaultRouteForRole(role));
  }

  // No invite code submitted — needs membership step. Preserve next for the join form.
  redirect(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding");
}

export async function joinOrganizationWithInviteCode(formData: FormData) {
  const user = await requireUser();
  const next = sanitizeNext(formData.get("next"));
  const inviteCode = normalizeInviteCode(formData.get("inviteCode"));

  if (!inviteCode) {
    onboardingError("missing_invite", next);
  }

  const role = await joinInviteCode(user.id, inviteCode, next);
  redirect(next || getDefaultRouteForRole(role ?? "staff"));
}

export async function claimFirstPlatformAdmin() {
  const user = await requireUser();
  const service = getSupabaseServiceClient();

  const [{ data: profile }, { count }] = await Promise.all([
    service.from("profiles").select("id").eq("id", user.id).maybeSingle(),
    service
      .from("platform_admins")
      .select("id", { count: "exact", head: true }),
  ]);

  if (!profile) {
    redirect("/onboarding?error=profile_required");
  }

  if ((count ?? 0) > 0) {
    redirect("/onboarding?error=platform_admin_exists");
  }

  const platformAdmin: PlatformAdminInsert = {
    is_active: true,
    role: "developer_super_admin",
    user_id: user.id,
  };

  const { error } = await service
    .from("platform_admins")
    .insert(platformAdmin as never);

  if (error) {
    redirect("/onboarding?error=platform_admin_failed");
  }

  redirect("/admin");
}
