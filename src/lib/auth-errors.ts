import type { Dictionary } from "@/lib/i18n";

export function resolveAuthErrorMessage(
  rawError: string | undefined,
  dictionary: Dictionary,
) {
  if (!rawError) {
    return null;
  }

  const normalized = rawError.trim().toLowerCase();

  if (
    normalized.includes("rate limit") ||
    normalized.includes("security purposes")
  ) {
    return dictionary.auth.errors.rate_limit;
  }

  return dictionary.auth.errors[rawError] ?? dictionary.auth.errors.generic;
}
