import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getDeviceSurfaceFromHeaders } from "@/lib/mobile-device";
import {
  defaultPathForSurface,
  isAdminSurfacePath,
  normalizeNextPathForSurface,
} from "@/lib/surface-routing";
import type { Database } from "@/types/database";

const authRoutePrefixes = ["/admin", "/mobile", "/account"];
const supabaseCallbackParams = [
  "code",
  "error",
  "error_code",
  "error_description",
];

function isProtectedPath(pathname: string) {
  return authRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPage(pathname: string) {
  return pathname === "/auth/login" || pathname.startsWith("/auth/login/");
}

function isBlockedAuthState(request: NextRequest) {
  return request.nextUrl.searchParams.get("view") === "blocked";
}

/**
 * Password-reset links land on /auth/login with a recovery SESSION (authenticated),
 * so the user must NOT be bounced to /onboarding before they can set a new password.
 * The login page renders this state; the middleware must let it through too.
 */
function isPasswordRecoveryState(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return params.get("view") === "email" && params.get("mode") === "new_password";
}

function buildLoginRedirect(request: NextRequest) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/auth/login";
  redirectUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return redirectUrl;
}

function hasSupabaseCallbackParams(request: NextRequest) {
  return supabaseCallbackParams.some((param) =>
    request.nextUrl.searchParams.has(param),
  );
}

function buildAuthCallbackRedirect(request: NextRequest) {
  const callbackUrl = request.nextUrl.clone();
  const nextUrl = request.nextUrl.clone();

  callbackUrl.pathname = "/auth/callback";
  supabaseCallbackParams.forEach((param) => nextUrl.searchParams.delete(param));

  if (!callbackUrl.searchParams.has("next")) {
    callbackUrl.searchParams.set(
      "next",
      `${nextUrl.pathname}${nextUrl.search}` || "/",
    );
  }

  return callbackUrl;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const surface = getDeviceSurfaceFromHeaders(request.headers);

  if (pathname !== "/auth/callback" && hasSupabaseCallbackParams(request)) {
    return NextResponse.redirect(buildAuthCallbackRedirect(request));
  }

  if (surface === "mobile" && isAdminSurfacePath(pathname)) {
    const mobileUrl = request.nextUrl.clone();
    mobileUrl.pathname = "/mobile";
    mobileUrl.search = "";
    return NextResponse.redirect(mobileUrl);
  }

  let response = NextResponse.next({
    request,
  });

  if (!isProtectedPath(pathname) && !isAuthPage(pathname)) {
    return response;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, options, value }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedPath(pathname) && !user) {
    return NextResponse.redirect(buildLoginRedirect(request));
  }

  if (isAuthPage(pathname) && user) {
    if (isBlockedAuthState(request) || isPasswordRecoveryState(request)) {
      return response;
    }
    // Preserve `next` and `lang` so the onboarding page (or login page's own
    // server-side check) can redirect to the correct destination once the user
    // is confirmed to be fully onboarded.
    const next = normalizeNextPathForSurface(
      request.nextUrl.searchParams.get("next"),
      surface,
      surface === "mobile" ? defaultPathForSurface(surface) : "",
    );
    const lang = request.nextUrl.searchParams.get("lang") || "";
    const onboardingUrl = request.nextUrl.clone();
    onboardingUrl.pathname = "/onboarding";
    onboardingUrl.search = "";
    if (next) onboardingUrl.searchParams.set("next", next);
    if (lang) onboardingUrl.searchParams.set("lang", lang);
    return NextResponse.redirect(onboardingUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
