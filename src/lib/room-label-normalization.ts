import type { ActiveRoomCatalogItem } from "@/lib/rooms";

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

  const cleaned = (withoutPrefix || compact).replace(/-/g, "_").replace(/[()]/g, "");
  // Arakicho B rooms are stored as "Ab101" — uppercase the leading alpha prefix so it reads "AB101".
  // (Arakicho A rooms are numeric, so this only affects the Arakicho B "Ab" prefix.)
  return cleaned.replace(/^[A-Za-z]+/, (match) => match.toUpperCase());
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

/**
 * Collapses a stored cleaning **session** room label ("아라키초A 201_2") to its display form
 * ("아라키초A 201"), keeping the canonical property prefix. Okubo single-token labels (property ===
 * room) and non-Arakicho labels are returned unchanged. Use for USER-FACING display of session
 * labels (home feed, transport statement, dashboard cards); session↔reservation MATCHING keeps the
 * raw canonical value.
 */
export function getDisplaySessionRoomLabel(sessionRoomLabel: string): string {
  const trimmed = sessionRoomLabel.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return trimmed;
  const property = trimmed.slice(0, spaceIndex);
  const room = trimmed.slice(spaceIndex + 1);
  return `${property} ${getDisplayRoomLabel(property, room)}`;
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

/* ============================================================
   Session room-label ↔ roomKey resolution — shared by the mobile cleaning queue
   (src/app/mobile/cleaning/page.tsx) and the admin cleaning console
   (src/lib/admin-cleaning.ts). Previously duplicated privately in the mobile page; extracted here
   so there's a single implementation. See docs/product/07-cleaning-workflow.md → roomKey resolution
   priority.
   ============================================================ */

/** Room key = canonical property + "_" + canonical room — used for dedup/turnover/session matching. */
export function buildRoomKey(canonicalPropertyName: string, canonicalRoomLabel: string): string {
  return `${canonicalPropertyName}_${canonicalRoomLabel}`;
}

/**
 * Label stored in `cleaning_sessions.room_label`. Okubo buildings return the property name as the
 * canonical room (single-unit buildings), so no room suffix is appended.
 */
export function buildSessionRoomLabel(canonicalPropertyName: string, canonicalRoomLabel: string): string {
  return canonicalRoomLabel === canonicalPropertyName
    ? canonicalRoomLabel
    : `${canonicalPropertyName} ${canonicalRoomLabel}`;
}

function normalizeRoomLabelInput(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** sessionRoomLabel → roomKey, built from the active room catalog (primary lookup). */
export function buildSessionLabelToRoomKeyMap(
  catalog: readonly ActiveRoomCatalogItem[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of catalog) {
    const sessionLabel = buildSessionRoomLabel(item.propertyName, item.canonicalRoomLabel);
    map.set(sessionLabel, buildRoomKey(item.propertyName, item.canonicalRoomLabel));
  }
  return map;
}

/** Normalized (NFKC/whitespace/lowercase) alias → roomKey, covering historical ko/ja/en label variants. */
export function buildLegacyAliasToRoomKeyMap(
  catalog: readonly ActiveRoomCatalogItem[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of catalog) {
    const roomKey = buildRoomKey(item.propertyName, item.canonicalRoomLabel);
    const aliases = [
      item.propertyName,
      item.canonicalRoomLabel,
      item.roomLabel,
      buildSessionRoomLabel(item.propertyName, item.canonicalRoomLabel),
      item.roomLabel === item.propertyName ? item.roomLabel : `${item.propertyName} ${item.roomLabel}`,
    ];
    for (const raw of aliases) {
      const key = normalizeRoomLabelInput(raw);
      if (!key) continue;
      if (!map.has(key)) map.set(key, roomKey);
    }
  }
  return map;
}

export type ResolveRoomKeyResult = {
  roomKey: string | null;
  matchedBy: "catalog_exact" | "canonical_prefix" | "legacy_alias" | "unknown";
};

/**
 * Resolves a `cleaning_sessions.room_label` to the canonical roomKey used by
 * CleaningTarget/SettingTarget. Returns null for unrecognised labels so callers can exclude them
 * rather than produce a spurious match. Three-stage fallback: catalog exact → canonical prefix
 * parse → legacy alias map.
 */
export function resolveRoomKey(
  roomLabel: string,
  catalogMap: Map<string, string>,
  legacyAliasMap: Map<string, string>,
): ResolveRoomKeyResult {
  const fromCatalog = catalogMap.get(roomLabel);
  if (fromCatalog !== undefined) return { roomKey: fromCatalog, matchedBy: "catalog_exact" };

  for (const cp of Object.keys(CANONICAL_TO_BUILDING_KEY)) {
    if (roomLabel === cp) return { roomKey: `${cp}_${cp}`, matchedBy: "canonical_prefix" };
    if (roomLabel.startsWith(`${cp} `)) {
      return { roomKey: `${cp}_${roomLabel.slice(cp.length + 1)}`, matchedBy: "canonical_prefix" };
    }
  }

  const fromAlias = legacyAliasMap.get(normalizeRoomLabelInput(roomLabel));
  if (fromAlias !== undefined) return { roomKey: fromAlias, matchedBy: "legacy_alias" };

  return { roomKey: null, matchedBy: "unknown" };
}
