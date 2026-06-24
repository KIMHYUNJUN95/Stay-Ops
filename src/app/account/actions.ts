"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sanitizeBottomNavTabIds } from "@/config/navigation";
import { isLocale } from "@/lib/i18n";
import { isValidBirthDate, isValidPhone } from "@/lib/onboarding";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function deleteAccount(): Promise<never> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const service = getSupabaseServiceClient();

  // Tombstone the profile: clear PII, mark as deleted.
  // The row is kept so operational records (attendance, cleaning, tasks)
  // retain their user_id FK and display "탈퇴한 사용자" instead of breaking.
  await service
    .from("profiles")
    .update({
      name: "",
      phone_number: "",
      profile_photo_url: null,
      birth_date: null,
      deleted_at: new Date().toISOString(),
    } as never)
    .eq("id", user.id);

  // Remove from all org memberships so the user no longer appears in rosters.
  await service
    .from("memberships")
    .update({ status: "removed" } as never)
    .eq("user_id", user.id);

  // Hard-delete the auth user — this frees the email for re-registration.
  // The profiles row survives because we removed the ON DELETE CASCADE FK.
  await service.auth.admin.deleteUser(user.id);

  redirect("/auth/login");
}

function toAccountRedirect(mode: string, query: string): never {
  const nextMode = mode === "mobile" ? "mobile" : "admin";
  redirect(`/account?mode=${nextMode}&${query}`);
}

export async function updateAccountProfile(formData: FormData) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/account");
  }

  const mode = String(formData.get("mode") ?? "admin");
  const name = String(formData.get("name") ?? "").trim();
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "");

  if (!name || !isLocale(preferredLanguage)) {
    toAccountRedirect(mode, "error=missing_profile_fields");
  }

  if (!phoneNumber) {
    toAccountRedirect(mode, "error=missing_profile_fields");
  }

  if (!isValidPhone(phoneNumber)) {
    toAccountRedirect(mode, "error=phone_invalid");
  }

  if (birthDate && !isValidBirthDate(birthDate)) {
    toAccountRedirect(mode, "error=missing_birth_date");
  }

  const { error } = await getSupabaseServiceClient()
    .from("profiles")
    .update({
      name,
      ...(birthDate ? { birth_date: birthDate } : {}),
      phone_number: phoneNumber,
      preferred_language: preferredLanguage,
    } as never)
    .eq("id", user.id);

  if (error) {
    if (
      error.code === "23505" ||
      error.message.toLowerCase().includes("profiles_phone_number_unique")
    ) {
      toAccountRedirect(mode, "error=phone_duplicate");
    }
    toAccountRedirect(mode, "error=profile_failed");
  }

  revalidatePath("/", "layout");
  toAccountRedirect(mode, "saved=1");
}

/**
 * Persist the user's customized mobile bottom-bar tabs.
 * Called from the mobile shell's "edit bottom bar" sheet. Returns a small
 * result object instead of redirecting, so the client can update optimistically.
 */
export async function updateBottomNavTabs(
  tabIds: string[],
): Promise<{ ok: boolean; tabs: string[] }> {
  const sanitized = sanitizeBottomNavTabIds(tabIds ?? []);

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, tabs: sanitized };
  }

  const { error } = await getSupabaseServiceClient()
    .from("profiles")
    .update({ bottom_nav_tabs: sanitized } as never)
    .eq("id", user.id);

  if (error) {
    return { ok: false, tabs: sanitized };
  }

  revalidatePath("/", "layout");
  return { ok: true, tabs: sanitized };
}
