import type { ActiveRoomCatalogItem } from "@/lib/rooms";

const CANONICAL_TO_BUILDING_KEY: Record<string, string> = {
  아라키초A: "arakicho_a",
  아라키초B: "arakicho_b",
  가부키초: "kabukicho",
  다카다노바바: "takadanobaba",
  오쿠보A: "okubo_a",
  오쿠보B: "okubo_b",
  오쿠보C: "okubo_c",
};

export type RequestLocationDisplay = {
  buildingLabel: string | null;
  roomLabel: string;
};

export type RequestCatalogLocation = {
  buildingLabel: string | null;
  buildingName: string | null;
  canonicalRoomLabel: string;
  item: ActiveRoomCatalogItem | null;
  roomLabel: string;
};

function localizePropertyName(
  propertyName: string,
  buildingLabels: Record<string, string>,
) {
  const buildingKey = CANONICAL_TO_BUILDING_KEY[propertyName] ?? propertyName;
  return buildingLabels[buildingKey] ?? propertyName;
}

function fromCatalogItem(
  item: ActiveRoomCatalogItem,
  buildingLabels: Record<string, string>,
): RequestLocationDisplay {
  return {
    buildingLabel: localizePropertyName(item.propertyName, buildingLabels),
    // Display the collapsed room (Arakicho 201_2 → 201), never the raw sub-unit.
    roomLabel: item.displayRoomLabel,
  };
}

function isSessionLabelMatch(item: ActiveRoomCatalogItem, trimmed: string) {
  const combos = [item.canonicalRoomLabel, item.roomLabel, item.displayRoomLabel].map((room) =>
    room === item.propertyName ? item.propertyName : `${item.propertyName} ${room}`,
  );
  return combos.includes(trimmed);
}

export function resolveRequestCatalogLocation(
  roomLabel: string,
  catalog: readonly ActiveRoomCatalogItem[] | undefined,
  buildingLabels: Record<string, string>,
): RequestCatalogLocation {
  const trimmed = roomLabel.trim();
  if (!trimmed || !catalog || catalog.length === 0) {
    return {
      buildingLabel: null,
      buildingName: null,
      canonicalRoomLabel: trimmed,
      item: null,
      roomLabel: trimmed,
    };
  }

  const combinedMatch = catalog.find((item) => isSessionLabelMatch(item, trimmed));
  if (combinedMatch) {
    return {
      buildingLabel: localizePropertyName(combinedMatch.propertyName, buildingLabels),
      buildingName: combinedMatch.propertyName,
      canonicalRoomLabel: combinedMatch.canonicalRoomLabel,
      item: combinedMatch,
      roomLabel: combinedMatch.displayRoomLabel,
    };
  }

  const exactMatches = catalog.filter(
    (item) =>
      item.canonicalRoomLabel === trimmed ||
      item.roomLabel === trimmed ||
      item.displayRoomLabel === trimmed,
  );
  // Sub-units (201, 201_2) map to one physical room, so 1+ matches that all resolve to the same
  // building+display room is unambiguous — take the first. (displayRoomLabel matching also recovers
  // the building for newer records stored as the collapsed "201".)
  const samePhysical = new Set(exactMatches.map((m) => `${m.propertyName}::${m.displayRoomLabel}`));
  if (exactMatches.length >= 1 && samePhysical.size === 1) {
    const match = exactMatches[0];
    return {
      buildingLabel: localizePropertyName(match.propertyName, buildingLabels),
      buildingName: match.propertyName,
      canonicalRoomLabel: match.canonicalRoomLabel,
      item: match,
      roomLabel: match.displayRoomLabel,
    };
  }

  return {
    buildingLabel: null,
    buildingName: null,
    canonicalRoomLabel: trimmed,
    item: null,
    roomLabel: trimmed,
  };
}

export function resolveRequestLocation(
  roomLabel: string,
  catalog: readonly ActiveRoomCatalogItem[] | undefined,
  buildingLabels: Record<string, string>,
  propertyName?: string | null,
): RequestLocationDisplay {
  const trimmed = roomLabel.trim();

  // When property_name is stored directly, use it — no catalog lookup needed.
  if (propertyName) {
    return {
      buildingLabel: localizePropertyName(propertyName, buildingLabels),
      roomLabel: trimmed,
    };
  }

  if (!trimmed || !catalog || catalog.length === 0) {
    return { buildingLabel: null, roomLabel: trimmed };
  }

  const combinedMatch = catalog.find((item) => isSessionLabelMatch(item, trimmed));
  if (combinedMatch) {
    return fromCatalogItem(combinedMatch, buildingLabels);
  }

  const exactMatches = catalog.filter(
    (item) =>
      item.canonicalRoomLabel === trimmed ||
      item.roomLabel === trimmed ||
      item.displayRoomLabel === trimmed,
  );
  const samePhysical = new Set(exactMatches.map((m) => `${m.propertyName}::${m.displayRoomLabel}`));
  if (exactMatches.length >= 1 && samePhysical.size === 1) {
    return fromCatalogItem(exactMatches[0], buildingLabels);
  }

  return { buildingLabel: null, roomLabel: trimmed };
}
