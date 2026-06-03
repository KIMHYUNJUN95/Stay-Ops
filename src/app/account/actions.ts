"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { isTheme } from "@/lib/theme";
import { isValidPhone } from "@/lib/onboarding";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

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
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "");
  const themePreference = String(formData.get("themePreference") ?? "");

  if (!name || !isLocale(preferredLanguage) || !isTheme(themePreference)) {
    toAccountRedirect(mode, "error=missing_profile_fields");
  }

  if (!phoneNumber) {
    toAccountRedirect(mode, "error=missing_profile_fields");
  }

  if (!isValidPhone(phoneNumber)) {
    toAccountRedirect(mode, "error=phone_invalid");
  }

  const { error } = await getSupabaseServiceClient()
    .from("profiles")
    .update({
      name,
      phone_number: phoneNumber,
      preferred_language: preferredLanguage,
      theme_preference: themePreference,
    } as never)
    .eq("id", user.id);

  if (error) {
    toAccountRedirect(mode, "error=profile_failed");
  }

  revalidatePath("/", "layout");
  toAccountRedirect(mode, "saved=1");
}
