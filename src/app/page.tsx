import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDeviceSurfaceFromHeaders } from "@/lib/mobile-device";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const supabaseCallbackParams = [
  "code",
  "error",
  "error_code",
  "error_description",
] as const;

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildAuthCallbackPath(params: Record<string, string | string[] | undefined>) {
  const callbackParams = new URLSearchParams();

  supabaseCallbackParams.forEach((param) => {
    const value = getFirstParam(params[param]);
    if (value) {
      callbackParams.set(param, value);
    }
  });

  callbackParams.set("next", getFirstParam(params.next) || "/");
  return `/auth/callback?${callbackParams.toString()}`;
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};

  if (getFirstParam(params.code) || getFirstParam(params.error)) {
    redirect(buildAuthCallbackPath(params));
  }

  // 아이패드(「터치 되는 Mac」 쿠키)도 모바일로 — `getDeviceSurfaceFromHeaders` 가 함께 본다.
  const surface = getDeviceSurfaceFromHeaders(await headers());
  if (surface === "mobile") {
    redirect("/mobile");
  }
  if (surface === "desktop") {
    redirect("/auth/login");
  }

  redirect("/mobile");
}
