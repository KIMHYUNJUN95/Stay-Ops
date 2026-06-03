import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") || "/";

  if (error) {
    const loginUrl = new URL("/auth/login", requestUrl.origin);
    loginUrl.searchParams.set("error", error);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      const loginUrl = new URL("/auth/login", requestUrl.origin);
      loginUrl.searchParams.set("error", exchangeError.message);
      loginUrl.searchParams.set("next", next);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
