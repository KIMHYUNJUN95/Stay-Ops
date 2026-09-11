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
  // Arakicho B rooms are stored as "Ab101" — uppercase the leading alpha prefix so the internal key
  // is a stable "AB101" regardless of how Beds24 cased it. (Arakicho A rooms are numeric, so this
  // only affects the Arakicho B "Ab" prefix.) 사용자에게는 `getDisplayRoomLabel` 이 `101` 로 보여준다.
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
 *
 * 알파벳 접두어는 여기서 남긴다 — 이 단계는 아직 **내부 키**다(`A301` 과 `301` 은 서로 다른
 * Beds24 행이라 여기서 합치면 안 된다). 표시용으로 떼는 것은 `stripBuildingCodePrefix` 가 맡는다.
 */
function stripArakichoDisplaySuffix(internalKey: string): string {
  return internalKey.replace(/_\d+$/, "");
}

/**
 * 방 이름 앞의 건물 구분 알파벳을 뗀다 — **표시할 때만** (2026-09-11).
 *
 * `rooms` 에는 `UNIQUE (organization_id, room_label)` 이 걸려 있다. 방 이름이 건물별이 아니라
 * **조직 전체에서** 유일해야 한다는 뜻이다. 아라키초A 가 맨 번호(201, 302…)를 선점한 탓에 나중에
 * 붙은 건물들은 접두어로 피해 왔다 — 아라키초B `Ab101`, 가부키초 `K202`, 스테이아리 `O102`.
 *
 * 그 접두어는 **DB 제약을 피하려고 붙은 것이지 현장에서 부르는 이름이 아니다.** 청소도 주문도
 * 「101호」라고 부르지 「AB101호」라고 부르지 않는다. 그래서 저장값은 그대로 두고 여기서만 뗀다.
 *
 * **왜 저장값을 안 바꾸는가.** 바꾸면 (1) 스테이아리 `O201·O202·O302` 가 아라키초A 의 운영 중인
 * `201·202·302` 와 유니크 제약에서 정면 충돌하고, (2) 방 이름은 Beds24 가 내려주는 값이라 다음
 * 방 마스터 동기화가 `O102` 를 못 찾아 방을 하나 더 만든다(26 → 52). 표시 계층에서 떼면 둘 다
 * 일어나지 않는다.
 *
 * 가부키초는 이미 이렇게 돌고 있었다 — `getCanonicalRoomLabel` 이 숫자만 뽑아 `K202` 를 `202` 로
 * 보여준다. 이 함수는 그 방식을 나머지 건물로 넓힌 것이다.
 *
 * **뒤가 전부 숫자일 때만 뗀다.** `OkuboCC` 처럼 숫자로 끝나지 않는 이름은 접두어가 아니라 이름
 * 자체이므로 건드리지 않는다.
 *
 * 안전한 이유(2026-09-11 전수 확인): 건물 안에서 접두어를 떼도 겹치는 방이 없고
 * (아라키초B 101~402 · 스테이아리 26개 모두 고유), 묶음 키로 쓰는 자리는 전부 「건물+방」 쌍이라
 * 아라키초A `201` 과 스테이아리 `201` 이 한 칸으로 합쳐지지 않는다.
 */
function stripBuildingCodePrefix(label: string): string {
  const matched = label.match(/^[A-Za-z]+(\d+)$/);
  return matched ? matched[1] : label;
}

/**
 * Display-facing label for calendar rows and operational UI.
 *
 * For Arakicho: strips _N numeric suffix so sub-units share one calendar row
 * (internal keys 402 / 402_2 both display as 402).
 *
 * For every property: strips the building-disambiguating alpha prefix
 * (`AB101` → `101`, `O102` → `102`). See `stripBuildingCodePrefix`.
 */
export function getDisplayRoomLabel(propertyName: string, internalRoomKey: string): string {
  const canonical = getCanonicalPropertyName(propertyName);
  const withoutSuffix = isArakichoProperty(canonical)
    ? stripArakichoDisplaySuffix(internalRoomKey)
    : internalRoomKey;
  // 접미사를 먼저 떼야 `AB101_2` 가 `AB101` → `101` 로 이어진다.
  return stripBuildingCodePrefix(withoutSuffix);
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

/**
 * Canonical room-label ordering used wherever rooms are listed for operations staff
 * (청소 오늘 현황 / 기록, 셋팅 대상). Numeric collation so digit runs compare as numbers:
 * `202 < 302 < 402`, `AB201 < AB202 < AB301`, `8 < 9 < 10`. Purely lexical `localeCompare`
 * would put 402 before 8 and AB301 before AB202, which reads as random to the field team.
 */
export function compareRoomLabel(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true });
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
