"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { sanitizeNextPath } from "@/lib/safe-redirect";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const LOCALE_COOKIE = "stayops_locale";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function preserveOnboardingLang(next: string, lang: string) {
  if (!lang || !next.startsWith("/onboarding")) {
    return next;
  }
  const [pathWithSearch, hash = ""] = next.split("#");
  const [pathname, search = ""] = pathWithSearch.split("?");
  if (pathname !== "/onboarding") return next;
  const params = new URLSearchParams(search);
  if (!params.has("lang")) {
    params.set("lang", lang);
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * Password policy: minimum 8 chars, at least one letter and one digit.
 * Special characters are optional.
 */
function isValidPassword(password: string): boolean {
  if (password.length < 8) return false;
  return /[a-zA-Z]/.test(password) && /\d/.test(password);
}

function mapSupabaseError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "invalid_credentials";
  }
  if (m.includes("email not confirmed")) {
    return "email_not_confirmed";
  }
  if (m.includes("already registered") || m.includes("user already registered") || m.includes("already exists")) {
    return "email_already_exists";
  }
  if (m.includes("rate limit") || m.includes("security purposes")) {
    return "rate_limit";
  }
  return encodeURIComponent(message);
}

function buildBlockedRedirect(
  mode: "suspended" | "removed" | "disabled",
  email: string,
  next: string,
  lang: string,
): never {
  const params = new URLSearchParams({
    view: "blocked",
    mode,
    next,
  });
  if (lang) params.set("lang", lang);
  if (email) params.set("email", email);
  redirect(`/auth/login?${params.toString()}`);
}

/**
 * Persists the selected locale in a first-party cookie so it survives
 * redirects through the full auth/onboarding flow.
 */
export async function setLocaleCookie(locale: Locale) {
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Sign in with email + password.
 * Replaces the old magic-link (OTP) flow entirely.
 */
export async function signInWithEmailPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNextPath(formData.get("next"), "/mobile");
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const errorBase = `/auth/login?view=email&next=${encodeURIComponent(next)}${langParam}`;

  if (!email) redirect(`${errorBase}&error=missing_email`);
  if (!password) redirect(`${errorBase}&error=missing_password`);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`${errorBase}&error=${mapSupabaseError(error.message)}`);
  }

  // Session is set — check onboarding state and route accordingly.
  const state = await getOnboardingState();

  if (state.status === "unauthenticated") {
    redirect(`${errorBase}&error=generic`);
  }

  if (
    state.status === "needs_profile" ||
    state.status === "needs_membership"
  ) {
    const onboardingUrl = `/onboarding?lang=${encodeURIComponent(lang)}&next=${encodeURIComponent(next)}`;
    redirect(onboardingUrl);
  }

  if (
    state.status === "suspended" ||
    state.status === "removed" ||
    state.status === "disabled"
  ) {
    const email =
      state.status === "disabled" ? state.email : state.user.email ?? "";
    buildBlockedRedirect(state.status, email, next, lang);
  }

  // state.status === "ready"
  redirect(next || state.redirectTo);
}

/**
 * Sign up with email + password.
 * Sends a verification email. Does not auto-login until verified.
 * If the email is already registered (even with incomplete onboarding),
 * directs to login instead of creating a duplicate account.
 */
export async function signUpWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNextPath(formData.get("next"), "/mobile");
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const errorBase = `/auth/login?view=email&mode=signup&next=${encodeURIComponent(next)}${langParam}`;

  if (!email) redirect(`${errorBase}&error=missing_email`);
  if (!password) redirect(`${errorBase}&error=missing_password`);
  if (!isValidPassword(password)) redirect(`${errorBase}&error=weak_password`);

  const callbackNext = preserveOnboardingLang(next, lang);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
    },
  });

  if (error) {
    redirect(`${errorBase}&error=${mapSupabaseError(error.message)}`);
  }

  // identities array empty → email already registered (Supabase deduplication).
  // Redirect to login so the user can sign in or reset their password instead
  // of ending up with a duplicate account.
  if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
    redirect(
      `/auth/login?view=email&next=${encodeURIComponent(next)}${langParam}&email=${encodeURIComponent(email)}&error=resume_existing_account`,
    );
  }

  // Verification email sent — show the "check your inbox" state.
  redirect(
    `/auth/login?view=email&mode=signup&next=${encodeURIComponent(next)}${langParam}&sent=verify`,
  );
}

/**
 * Request a password reset email.
 * Always shows success (does not reveal whether the email exists).
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = sanitizeNextPath(formData.get("next"), "/mobile");
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const errorBase = `/auth/login?view=email&mode=reset&next=${encodeURIComponent(next)}${langParam}`;

  if (!email) redirect(`${errorBase}&error=missing_email`);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(
      `/auth/login?view=email&mode=new_password&next=${encodeURIComponent(next)}${langParam}`,
    )}`,
  });

  if (error) {
    const code =
      error.message.toLowerCase().includes("rate limit") ||
      error.message.toLowerCase().includes("security purposes")
        ? "rate_limit"
        : encodeURIComponent(error.message);
    redirect(`${errorBase}&error=${code}`);
  }

  // Always redirect to success regardless of whether the email exists.
  redirect(`${errorBase}&sent=reset&email=${encodeURIComponent(email)}`);
}

/**
 * Update password after the user has clicked the email reset link.
 * Supabase has already validated the recovery token via the callback route
 * (which exchanged the code for a session), so the user is authenticated
 * by the time this action runs.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const next = sanitizeNextPath(formData.get("next"), "/mobile");
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const errorBase = `/auth/login?view=email&mode=new_password&next=${encodeURIComponent(next)}${langParam}`;

  if (!password || !confirm) redirect(`${errorBase}&error=missing_password`);
  if (password !== confirm) redirect(`${errorBase}&error=password_mismatch`);
  if (!isValidPassword(password)) redirect(`${errorBase}&error=weak_password`);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    const code = error.message.toLowerCase().includes("same password")
      ? "same_password"
      : encodeURIComponent(error.message);
    redirect(`${errorBase}&error=${code}`);
  }

  redirect(
    `/auth/login?view=email&next=${encodeURIComponent(next)}${langParam}&sent=password_updated`,
  );
}

/**
 * Sign in with Google (OAuth).
 *
 * "Same email = same account" policy: this relies on Supabase's automatic
 * identity linking — when the Google email matches an existing user's CONFIRMED
 * email, Supabase links the Google identity to that user instead of creating a
 * duplicate (verified in this project: the owner account carries both `email` and
 * `google` identities). This holds ONLY while the Supabase project keeps:
 *   - email confirmations required (so emails are verified), and
 *   - automatic account linking enabled (Auth settings).
 * If those change, a same-email Google sign-in could diverge into a separate
 * account. The email-signup path already handles the reverse collision
 * (`identities.length === 0` → resume existing account). A manual link-identity
 * flow (the "계정 연결" design screen) is intentionally NOT wired yet — Supabase
 * enforces uniqueness today, so it would be premature. See
 * docs/engineering/05-rls-permissions.md (auth/identity policy).
 */
export async function signInWithGoogle(formData: FormData) {
  const next = sanitizeNextPath(formData.get("next"), "/mobile");
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const callbackNext = preserveOnboardingLang(next, lang);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
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

export async function signOut(formData?: FormData) {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  const next = sanitizeNextPath(formData?.get("next"), "/auth/login");
  redirect(next);
}
