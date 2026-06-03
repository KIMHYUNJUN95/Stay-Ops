const MAX_URL_LENGTH = 2048;

/**
 * Validates and sanitizes a URL received via Web Share Target.
 * Returns null for malformed input, non-http(s) schemes, or oversized strings.
 * This runs on both the route handler (server) and the RSC page (double validation).
 */
export function sanitizeSharedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_URL_LENGTH);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
