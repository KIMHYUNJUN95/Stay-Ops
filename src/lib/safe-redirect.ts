/**
 * Validates that a redirect target is a safe relative path within this app.
 * Rejects absolute URLs, protocol-relative paths, backslash-based bypasses,
 * and any value that does not start with a single forward slash.
 */
export function sanitizeNextPath(value: unknown, fallback = ""): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("://")) return fallback;
  // Backslashes can be normalised to "/" by browsers, turning /\evil.com into //evil.com.
  if (raw.includes("\\")) return fallback;
  return raw;
}
