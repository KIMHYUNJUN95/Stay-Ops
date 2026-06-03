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

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDateToStart(value: string) {
  return new Date(`${value}T00:00:00`);
}

function isoDateToExclusiveEnd(value: string) {
  return addDays(isoDateToStart(value), 1);
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
  const now = new Date();
  if (filter.startDate || filter.endDate) {
    return {
      from: filter.startDate ? isoDateToStart(filter.startDate).toISOString() : undefined,
      to: filter.endDate ? isoDateToExclusiveEnd(filter.endDate).toISOString() : undefined,
    };
  }

  switch (filter.datePreset) {
    case "today": {
      const start = startOfLocalDay(now);
      return { from: start.toISOString(), to: addDays(start, 1).toISOString() };
    }
    case "7d":
      return { from: addDays(now, -7).toISOString() };
    case "30d":
      return { from: addDays(now, -30).toISOString() };
    case "all":
    default:
      return {};
  }
}
