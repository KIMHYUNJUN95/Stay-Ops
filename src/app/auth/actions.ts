"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { getDeviceSurfaceFromHeaders, type DeviceSurface } from "@/lib/mobile-device";
import { getOnboardingState } from "@/lib/onboarding";
import {
  defaultPathForSurface,
  normalizeNextPathForSurface,
  normalizePathForSurface,
} from "@/lib/surface-routing";
import { forgetTrustedDevice } from "@/lib/attendance-trusted-device";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const LOCALE_COOKIE = "stayops_locale";

/**
 * Origin used to build OAuth / email callback URLs. Derived from the actual
 * request host (so it matches whatever domain the user is on — production,
 * preview, or local LAN IP) instead of a static env var. Falls back to
 * NEXT_PUBLIC_APP_URL, then localhost. Supabase's redirect allow-list remains the
 * security boundary — a spoofed host can't redirect anywhere not on the list.
 */
async function getAppUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ??
      (/^(localhost|127\.|192\.168\.|10\.|172\.)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function getCurrentSurface() {
  return getDeviceSurfaceFromHeaders(await headers());
}

function sanitizeNextForSurface(
  value: unknown,
  surface: DeviceSurface,
  fallback = defaultPathForSurface(surface),
) {
  return normalizeNextPathForSurface(value, surface, fallback);
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
 * 비밀번호 정책 (2026-08-03 강화).
 *
 * 예전 규칙은 "8자 이상 + 영문자 + 숫자" 였는데, 그 조건은 `password1` / `stayops1` 같은 **유출
 * 목록 상위 문자열을 전부 통과**시킨다. 실제로 iOS 키체인이 "이 암호는 데이터 유출에 노출되었다"고
 * 경고하는 상황이 나왔다.
 *
 * 정책은 **두 겹**이다.
 *  1) 여기(앱) — 길이·구성·뻔한 문자열을 막고 **사용자 언어로 즉시 안내**한다.
 *  2) Supabase Auth 의 유출 비밀번호 차단(HaveIBeenPwned) — 대시보드 설정. 앱이 못 잡는
 *     "구성은 멀쩡한데 이미 유출된" 문자열을 막는다. 둘 중 하나만으로는 부족하다.
 *
 * 최소 길이를 10 으로 올린 이유: 8자는 구성 요건을 붙여도 사전 공격 범위 안이고, 이 제품은 급여·
 * 개인정보를 다룬다. 특수문자는 계속 선택 사항 — 강제하면 오히려 `Password1!` 류로 수렴한다.
 */
const MIN_PASSWORD_LENGTH = 10;

/** 제품·도메인에서 곧바로 유추되는 문자열. 부분 일치로 막는다(대소문자 무시). */
const BANNED_PASSWORD_FRAGMENTS = ["stayops", "password", "qwerty", "123456", "admin", "letmein"];

function isValidPassword(password: string, email?: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) return false;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return false;

  const lower = password.toLowerCase();
  if (BANNED_PASSWORD_FRAGMENTS.some((f) => lower.includes(f))) return false;

  // 같은 문자만 반복하거나(aaaaaaaaaa) 연속 숫자만(1234567890) 인 경우.
  if (/^(.)\1+$/.test(password)) return false;

  // 이메일 로컬파트를 그대로 쓰는 경우 — 가장 흔한 실패 패턴이라 따로 막는다.
  const local = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && lower.includes(local)) return false;

  return true;
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
  const surface = await getCurrentSurface();
  const next = sanitizeNextForSurface(formData.get("next"), surface);
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
  redirect(next || normalizePathForSurface(state.redirectTo, surface));
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
  const surface = await getCurrentSurface();
  const next = sanitizeNextForSurface(formData.get("next"), surface);
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const errorBase = `/auth/login?view=email&mode=signup&next=${encodeURIComponent(next)}${langParam}`;

  if (!email) redirect(`${errorBase}&error=missing_email`);
  if (!password) redirect(`${errorBase}&error=missing_password`);
  if (!isValidPassword(password, email)) redirect(`${errorBase}&error=weak_password`);

  const callbackNext = preserveOnboardingLang(next, lang);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await getAppUrl()}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
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
  const surface = await getCurrentSurface();
  const next = sanitizeNextForSurface(formData.get("next"), surface);
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const errorBase = `/auth/login?view=email&mode=reset&next=${encodeURIComponent(next)}${langParam}`;

  if (!email) redirect(`${errorBase}&error=missing_email`);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getAppUrl()}/auth/callback?next=${encodeURIComponent(
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
  const surface = await getCurrentSurface();
  const next = sanitizeNextForSurface(formData.get("next"), surface);
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const errorBase = `/auth/login?view=email&mode=new_password&next=${encodeURIComponent(next)}${langParam}`;

  if (!password || !confirm) redirect(`${errorBase}&error=missing_password`);
  if (password !== confirm) redirect(`${errorBase}&error=password_mismatch`);
  // 재설정 링크로 들어온 경로라 이메일이 폼에 없다 — 이메일 유사도 검사만 건너뛴다.
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
  const surface = await getCurrentSurface();
  const next = sanitizeNextForSurface(formData.get("next"), surface);
  const lang = String(formData.get("lang") ?? "").trim();
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  const callbackNext = preserveOnboardingLang(next, lang);

  const appUrl = await getAppUrl();
  const oauthRedirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(callbackNext)}`;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: oauthRedirectTo,
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
  // 명시적 로그아웃은 "이 기기에서 나가겠다" 는 뜻이다 — 근태 기기 기억도 함께 폐기한다.
  // (기억을 남겨두면 로그아웃한 사람이 계속 打刻할 수 있어 의도와 어긋난다.)
  await forgetTrustedDevice();
  const surface = await getCurrentSurface();
  const next = normalizeNextPathForSurface(formData?.get("next"), surface, "/auth/login");
  redirect(next);
}
