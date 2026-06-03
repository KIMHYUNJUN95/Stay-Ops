const SOURCE_CANONICAL_MAP = new Map<string, string>([
  ["booking", "Booking.com"],
  ["booking.com", "Booking.com"],
  ["airbnb", "Airbnb"],
  ["api", "API"],
  ["direct", "Direct"],
  ["agoda", "Agoda"],
]);

function toCanonicalUnknownSource(value: string) {
  const normalizedWhitespace = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalizedWhitespace.replace(/(^|[\s/_-])([a-z])/g, (_, prefix: string, char: string) => {
    return `${prefix}${char.toUpperCase()}`;
  });
}

// Canonicalization policy:
// - Known channels map to fixed display/dedupe names.
// - Unknown channels are case-normalized so foo/FOO/Foo do not split dedupe keys.
// - Reservation identity for cancel/update matching uses the original Beds24 booking id
//   (`toOriginalReservationId`), not the normalized source string.
export function normalizeReservationSource(rawSource: string | null | undefined) {
  const trimmed = rawSource?.trim();
  if (!trimmed) return "beds24";

  const normalizedKey = trimmed.toLowerCase();
  return SOURCE_CANONICAL_MAP.get(normalizedKey) ?? toCanonicalUnknownSource(trimmed);
}
