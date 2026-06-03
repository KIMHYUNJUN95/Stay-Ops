import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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

  if (pathname !== "/auth/callback" && hasSupabaseCallbackParams(request)) {
    return NextResponse.redirect(buildAuthCallbackRedirect(request));
  }

  let response = NextResponse.next({
    request,
  });

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
    const onboardingUrl = request.nextUrl.clone();
    onboardingUrl.pathname = "/onboarding";
    onboardingUrl.search = "";
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
