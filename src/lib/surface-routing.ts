import type { DeviceSurface } from "@/lib/mobile-device";
import { sanitizeNextPath } from "@/lib/safe-redirect";

export function isAdminSurfacePath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isMobileSurfacePath(pathname: string) {
  return pathname === "/mobile" || pathname.startsWith("/mobile/");
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
