"use server";

import { redirect } from "next/navigation";
import { isDevSeedLoginEnabled } from "@/lib/dev-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function preserveOnboardingLang(next: string, lang: string) {
  if (!lang || !next.startsWith("/onboarding")) {
    return next;
  }

  const [pathWithSearch, hash = ""] = next.split("#");
  const [pathname, search = ""] = pathWithSearch.split("?");

  if (pathname !== "/onboarding") {
    return next;
  }

  const params = new URLSearchParams(search);
  if (!params.has("lang")) {
    params.set("lang", lang);
  }

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/").trim() || "/";
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const callbackNext = preserveOnboardingLang(next, lang);

  if (!email) {
    redirect(
      `/auth/login?error=missing_email&next=${encodeURIComponent(next)}${langParam}`,
    );
  }

  if (isDevSeedLoginEnabled()) {
    redirect(
      `/auth/login?error=${encodeURIComponent("rate_limit_dev")}&next=${encodeURIComponent(next)}${langParam}`,
    );
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(
        callbackNext,
      )}`,
    },
  });

  if (error) {
    redirect(
      `/auth/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}${langParam}`,
    );
  }

  redirect(`/auth/login?sent=1&next=${encodeURIComponent(next)}${langParam}`);
}

export async function signInWithGoogle(formData: FormData) {
  const next = String(formData.get("next") ?? "/").trim() || "/";
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const callbackNext = preserveOnboardingLang(next, lang);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
      // Force account selection so users can choose which Google account to use.
      // This is important for shared or multi-account devices.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    redirect(
      `/auth/login?error=google_signin_failed&next=${encodeURIComponent(next)}${langParam}`,
    );
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
