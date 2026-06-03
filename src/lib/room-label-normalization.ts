function normalizeKey(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/[_()\-]/g, "")
    .toLowerCase();
}

function hasAny(value: string, candidates: string[]) {
  return candidates.some((candidate) => value.includes(candidate));
}

function isArakichoA(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["아라키초a", "arakichoa", "荒木町a"]);
}

function isArakichoB(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["아라키초b", "arakichob", "荒木町b"]);
}

function isKabukicho(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["가부키초", "kabukicho", "歌舞伎町"]);
}

function isTakadanobaba(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["다카다노바바", "takadanobaba", "高田馬場"]);
}

function isSano(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["사노", "sano", "佐野"]);
}

function isOkuboA(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["오쿠보a", "okuboa", "okuboab棟", "okuboab동", "大久保a"]);
}

function isOkuboB(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["오쿠보b", "okubob", "okuboba棟", "okuboba동", "大久保b"]);
}

function isOkuboC(propertyName: string) {
  const key = normalizeKey(propertyName);
  return hasAny(key, ["오쿠보c", "okuboc", "okubockr", "大久保c"]);
}

/** Maps canonical Korean property names to stable i18n building keys. */
export const CANONICAL_TO_BUILDING_KEY: Record<string, string> = {
  // Note: values must match keys in dictionary.cleaning.buildingLabels
  아라키초A: "arakicho_a",
  아라키초B: "arakicho_b",
  가부키초: "kabukicho",
  다카다노바바: "takadanobaba",
  오쿠보A: "okubo_a",
  오쿠보B: "okubo_b",
  오쿠보C: "okubo_c",
};

/** Converts a canonical property name to its locale-appropriate display label. */
export function localizePropertyName(
  canonicalPropertyName: string,
  buildingLabels: Record<string, string>,
): string {
  const key = CANONICAL_TO_BUILDING_KEY[canonicalPropertyName];
  return (key ? buildingLabels[key] : undefined) ?? canonicalPropertyName;
}

export function getCanonicalPropertyName(propertyName: string) {
  if (isArakichoA(propertyName)) return "아라키초A";
  if (isArakichoB(propertyName)) return "아라키초B";
  if (isKabukicho(propertyName)) return "가부키초";
  if (isTakadanobaba(propertyName)) return "다카다노바바";
  if (isOkuboA(propertyName)) return "오쿠보A";
  if (isOkuboB(propertyName)) return "오쿠보B";
  if (isOkuboC(propertyName)) return "오쿠보C";
  if (isSano(propertyName)) return "사노";
  return propertyName.trim();
}

function isAnyOkubo(propertyName: string) {
  return isOkuboA(propertyName) || isOkuboB(propertyName) || isOkuboC(propertyName);
}

function isArakichoProperty(canonicalPropertyName: string) {
  return isArakichoA(canonicalPropertyName) || isArakichoB(canonicalPropertyName);
}

/**
 * Preserves distinct Arakicho unit identities (e.g. A301, 301, 301_2, A301_2).
 * Do not collapse to digits-only — that merges different Beds24 / room-master rows.
 */
export function normalizeArakichoRoomKey(raw: string) {
  const compact = raw.trim().replace(/\s+/g, "");
  if (!compact) return compact;

  const withoutPrefix = compact
    .replace(/^(?:荒木町\s*[abAB]?|아라키초\s*[abAB]?|arakicho\s*[abAB]?)/iu, "")
    .replace(/^(?:room|unit|호|号室)/iu, "");

  return (withoutPrefix || compact).replace(/-/g, "_").replace(/[()]/g, "");
}

/**
 * Operational room key used for calendar rows, cleaning targets, and reservation grouping.
 * Must stay aligned with room master catalog `canonicalRoomLabel`.
 */
export function getCanonicalRoomLabel(propertyName: string, roomLabel: string) {
  const canonicalPropertyName = getCanonicalPropertyName(propertyName);
  const raw = roomLabel.trim();
  if (raw.length === 0) return raw;

  if (isAnyOkubo(canonicalPropertyName)) {
    return canonicalPropertyName;
  }

  if (isArakichoProperty(canonicalPropertyName)) {
    return normalizeArakichoRoomKey(raw);
  }

  if (isKabukicho(canonicalPropertyName)) {
    const digits = raw.match(/\d+/)?.[0];
    if (digits) return digits;
  }

  return raw;
}

/**
 * Strips numeric _N suffix from an Arakicho internal room key for display.
 * "402_2" → "402", "A301_2" → "A301", "402" → "402".
 * Lettered prefixes (A, B…) are preserved so A301 and 301 remain distinct rows.
 */
function stripArakichoDisplaySuffix(internalKey: string): string {
  return internalKey.replace(/_\d+$/, "");
}

/**
 * Display-facing label for calendar rows and operational UI.
 *
 * For Arakicho: strips _N numeric suffix so sub-units share one calendar row
 * (internal keys 402 / 402_2 both display as 402, A301 / A301_2 as A301,
 *  but A301 and 301 remain separate because the lettered prefix differs).
 *
 * For all other properties: returns the internal room key unchanged.
 */
export function getDisplayRoomLabel(propertyName: string, internalRoomKey: string): string {
  const canonical = getCanonicalPropertyName(propertyName);
  if (isArakichoProperty(canonical)) {
    return stripArakichoDisplaySuffix(internalRoomKey);
  }
  return internalRoomKey;
}

export function isExcludedOperationalProperty(propertyName: string) {
  const canonical = getCanonicalPropertyName(propertyName);
  return canonical === "사노";
}

export function isExcludedOperationalRoom(propertyName: string, roomLabel: string) {
  const canonicalPropertyName = getCanonicalPropertyName(propertyName);
  const raw = roomLabel.trim();
  if (canonicalPropertyName === "다카다노바바" && /^401[_-]2$/i.test(raw)) {
    return true;
  }
  return false;
}
