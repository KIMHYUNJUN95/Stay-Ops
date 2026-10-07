import type { DeviceSurface } from "@/lib/mobile-device";
import { sanitizeNextPath } from "@/lib/safe-redirect";

export function isAdminSurfacePath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isMobileSurfacePath(pathname: string) {
  return pathname === "/mobile" || pathname.startsWith("/mobile/");
}

/**
 * 기기와 상관없는 경로 — 예약 바로가기(`/go/...`)처럼 **스스로 기기를 보고** 갈 곳을 고르는 문.
 * 로그인 뒤 `next` 로 돌아올 때 폰이라고 `/mobile` 로 덮어쓰면 링크가 사라진다.
 */
export function isSurfaceNeutralPath(pathname: string) {
  return pathname.startsWith("/go/");
}

export function defaultPathForSurface(surface: DeviceSurface) {
  return surface === "desktop" ? "/admin" : "/mobile";
}

export function normalizePathForSurface(pathname: string, surface: DeviceSurface) {
  if (surface === "mobile" && isAdminSurfacePath(pathname)) {
    return "/mobile";
  }
  return pathname;
}

export function normalizeNextPathForSurface(
  value: unknown,
  surface: DeviceSurface,
  fallback = "",
) {
  const safe = sanitizeNextPath(value, fallback);
  return normalizePathForSurface(safe, surface);
}
