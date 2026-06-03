"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getDefaultRouteForRole, isValidPhone } from "@/lib/onboarding";
import type { Database } from "@/types/database";

type InviteCodeRow = {
  default_role: Database["public"]["Enums"]["organization_role"];
  id: string;
  max_uses: number;
  organization_id: string;
  used_count: number;
};

type MembershipInsert = Database["public"]["Tables"]["memberships"]["Insert"];
type PlatformAdminInsert =
  Database["public"]["Tables"]["platform_admins"]["Insert"];
type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function sanitizeNext(value: FormDataEntryValue | null): string {
  const s = cleanText(value);
  if (!s || !s.startsWith("/") || s.startsWith("//") || s.includes("://")) return "";
  return s;
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
  const now = new Date().toISOString();

  // Fetch without pre-filtering active/expiry so each failure gives a specific error message.
  const { data, error } = await service
    .from("invite_codes")
    .select("id, organization_id, default_role, used_count, max_uses, is_active, expires_at")
    .eq("code", code)
    .maybeSingle();

  const inviteCode = data as (InviteCodeRow & { is_active: boolean; expires_at: string }) | null;

  if (error || !inviteCode) onboardingError("invalid_invite", next);
  if (!inviteCode.is_active) onboardingError("invite_inactive", next);
  if (inviteCode.expires_at && inviteCode.expires_at < now) onboardingError("invite_expired", next);
  if (inviteCode.used_count >= inviteCode.max_uses) onboardingError("invite_maxed", next);

  const membership: MembershipInsert = {
    joined_at: new Date().toISOString(),
    organization_id: inviteCode.organization_id,
    role: inviteCode.default_role,
    status: "active",
    user_id: userId,
  };

  const { error: membershipError } = await service.from("memberships").upsert(
    membership as never,
    { onConflict: "organization_id,user_id" },
  );

  if (membershipError) onboardingError("membership_failed", next);

  const { error: updateError } = await service
    .from("invite_codes")
    .update({ used_count: inviteCode.used_count + 1 } as never)
    .eq("id", inviteCode.id);

  if (updateError) onboardingError("invite_update_failed", next);

  return inviteCode.default_role;
}

export async function completeProfile(formData: FormData) {
  const user = await requireUser();
  const next = sanitizeNext(formData.get("next"));
  const name = cleanText(formData.get("name"));
  const phoneNumber = cleanText(formData.get("phoneNumber"));
  const preferredLanguage = cleanText(formData.get("preferredLanguage")) || "ko";
  const inviteCode = normalizeInviteCode(formData.get("inviteCode"));

  if (!name || !phoneNumber) {
    onboardingError("missing_profile_fields", next);
  }

  if (!isValidPhone(phoneNumber)) {
    onboardingError("phone_invalid", next);
  }

  const service = getSupabaseServiceClient();
  const profile: ProfileInsert = {
    id: user.id,
    name,
    phone_number: phoneNumber,
    preferred_language:
      preferredLanguage as Database["public"]["Enums"]["app_language"],
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
