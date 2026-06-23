import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getOnboardingState } from "@/lib/onboarding";
import { sanitizeNextPath } from "@/lib/safe-redirect";
import { getDeviceSurfaceFromHeaders } from "@/lib/mobile-device";
import { normalizePathForSurface } from "@/lib/surface-routing";

function buildBlockedUrl(
  origin: string,
  mode: "suspended" | "removed" | "disabled",
  next: string,
  email: string,
) {
  const blockedUrl = new URL("/auth/login", origin);
  blockedUrl.searchParams.set("view", "blocked");
  blockedUrl.searchParams.set("mode", mode);
  if (next) blockedUrl.searchParams.set("next", next);
  if (email) blockedUrl.searchParams.set("email", email);
  return blockedUrl;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const surface = getDeviceSurfaceFromHeaders(request.headers);
  const code = url.searchParams.get("code");
  const errorDesc = url.searchParams.get("error_description");
  const rawNext = url.searchParams.get("next") || "";
  const safeNext =
    rawNext === "/" ? "" : normalizePathForSurface(sanitizeNextPath(rawNext), surface);

  // ── OAuth provider returned an error ──────────────────────────────────────
  if (errorDesc) {
    const loginUrl = new URL("/auth/login", url.origin);
    loginUrl.searchParams.set("error", errorDesc);
    if (safeNext) loginUrl.searchParams.set("next", safeNext);
    return NextResponse.redirect(loginUrl);
  }

  // ── Exchange PKCE / magic-link code for a session ─────────────────────────
  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      const loginUrl = new URL("/auth/login", url.origin);
      loginUrl.searchParams.set("error", exchangeError.message);
      if (safeNext) loginUrl.searchParams.set("next", safeNext);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Resolve onboarding state server-side ──────────────────────────────────
  // This is the primary gate for Google OAuth new-user flows: after a successful
  // Google sign-in the browser lands here with no prior StayOps profile or team
  // membership.  We check the state using the session that was just established
  // (the Supabase SSR helper writes the session into the mutable cookie store
  // that subsequent helpers in the same request cycle can read).
  const state = await getOnboardingState();

  if (state.status === "unauthenticated") {
    // Should not happen after a successful code exchange, but guard defensively.
    const loginUrl = new URL("/auth/login", url.origin);
    if (safeNext) loginUrl.searchParams.set("next", safeNext);
    return NextResponse.redirect(loginUrl);
  }

  if (
    state.status === "needs_profile" ||
    state.status === "needs_membership"
  ) {
    // Redirect to onboarding, preserving the original destination so the user
    // lands in the right place after completing their profile and joining a team.
    const onboardingUrl = new URL("/onboarding", url.origin);
    if (safeNext) onboardingUrl.searchParams.set("next", safeNext);
    return NextResponse.redirect(onboardingUrl);
  }

  if (
    state.status === "suspended" ||
    state.status === "removed" ||
    state.status === "disabled"
  ) {
    const email =
      state.status === "disabled" ? state.email : state.user.email ?? "";
    return NextResponse.redirect(
      buildBlockedUrl(url.origin, state.status, safeNext, email),
    );
  }

  // state.status === "ready" — profile and membership are complete.
  // Honour the original `next` destination if present, otherwise use the
  // role-appropriate default route provided by `getOnboardingState`.
  const dest = safeNext || normalizePathForSurface(state.redirectTo, surface);
  return NextResponse.redirect(new URL(dest, url.origin));
}
