export type RequestDatePreset = "all" | "today" | "7d" | "30d";

export type RequestDateRangeFilter = {
  endDate?: string;
  startDate?: string;
};

export type RequestDatePresetFilter = {
  datePreset?: RequestDatePreset;
};

export type RequestDateFilter = RequestDateRangeFilter & RequestDatePresetFilter;

const PRESET_VALUES = new Set<RequestDatePreset>(["all", "today", "7d", "30d"]);

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ── Tokyo operating date (see docs/product/07-cleaning-workflow.md) ──────────
// These filters run on the server (mobile requests page + admin orders export), so any
// host-local date math would drift by 9 hours on a UTC runner. Day boundaries are therefore
// derived as Asia/Tokyo `YYYY-MM-DD` keys — the same pattern as `tokyoToday()` in
// src/lib/tasks.ts and the Today/Yesterday grouping in requests-filter-view.tsx — and only
// converted to an instant at the very end via the fixed +09:00 offset (Japan has no DST).
const TOKYO_TIME_ZONE = "Asia/Tokyo";
const TOKYO_UTC_OFFSET = "+09:00";

const tokyoDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TOKYO_TIME_ZONE,
  year: "numeric",
});

/** Tokyo calendar date (YYYY-MM-DD) of an instant. */
function tokyoDateKey(date: Date = new Date()) {
  return tokyoDateKeyFormatter.format(date);
}

/** Shift a YYYY-MM-DD key by whole days, staying in string space. */
function shiftDateKey(key: string, deltaDays: number) {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
  return shifted.toISOString().slice(0, 10);
}

/** Instant (UTC ISO) of 00:00 Asia/Tokyo on the given date key. */
function tokyoDayStartIso(key: string) {
  return new Date(`${key}T00:00:00${TOKYO_UTC_OFFSET}`).toISOString();
}

/** Exclusive upper bound: 00:00 Asia/Tokyo of the day after `key`. */
function tokyoDayEndExclusiveIso(key: string) {
  return tokyoDayStartIso(shiftDateKey(key, 1));
}

export function parseRequestDatePreset(
  value: string | null | undefined,
): RequestDatePreset {
  return PRESET_VALUES.has(value as RequestDatePreset)
    ? (value as RequestDatePreset)
    : "all";
}

export function parseRequestDateRange(params: {
  endDate?: string;
  startDate?: string;
}): RequestDateRangeFilter {
  return {
    endDate: isIsoDate(params.endDate) ? params.endDate : undefined,
    startDate: isIsoDate(params.startDate) ? params.startDate : undefined,
  };
}

export function getTimestampRange(filter: RequestDateFilter): {
  from?: string;
  to?: string;
} {
  if (filter.startDate || filter.endDate) {
    return {
      from: filter.startDate ? tokyoDayStartIso(filter.startDate) : undefined,
      to: filter.endDate ? tokyoDayEndExclusiveIso(filter.endDate) : undefined,
    };
  }

  const today = tokyoDateKey();

  switch (filter.datePreset) {
    case "today":
      return { from: tokyoDayStartIso(today), to: tokyoDayEndExclusiveIso(today) };
    // "7일" / "30일" mean whole Tokyo calendar days including today (today - 6 / today - 29),
    // matching the Today/Yesterday group headers instead of a rolling 7×24h window.
    case "7d":
      return { from: tokyoDayStartIso(shiftDateKey(today, -6)) };
    case "30d":
      return { from: tokyoDayStartIso(shiftDateKey(today, -29)) };
    case "all":
    default:
      return {};
  }
}
