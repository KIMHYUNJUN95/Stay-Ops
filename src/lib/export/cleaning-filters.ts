import { getCleaningOperatingDateKey } from "@/lib/cleaning";
import { getCanonicalPropertyName } from "@/lib/room-label-normalization";
import type { Database } from "@/types/database";

export type CleaningStatus = Database["public"]["Enums"]["cleaning_status"];

export const cleaningExportStatuses: readonly CleaningStatus[] = [
  "in_progress",
  "completed",
  "cancelled",
];

export type CleaningExportFilters = {
  startDate: string;
  endDate: string;
  status?: CleaningStatus;
  staffUserId?: string;
  /** Canonical property name (e.g. 아라키초A). */
  propertyName?: string;
};

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseCleaningExportFilters(params: {
  date?: string;
  endDate?: string;
  startDate?: string;
  status?: string;
  staff?: string;
  property?: string;
}): CleaningExportFilters {
  const today = getCleaningOperatingDateKey();
  const singleDate = isIsoDate(params.date) ? params.date : undefined;
  const rangeStart = isIsoDate(params.startDate) ? params.startDate : singleDate ?? today;
  const rangeEnd = isIsoDate(params.endDate)
    ? params.endDate
    : isIsoDate(params.startDate)
      ? params.startDate
      : singleDate ?? today;

  const startDate = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const endDate = rangeStart <= rangeEnd ? rangeEnd : rangeStart;

  const status = cleaningExportStatuses.includes(params.status as CleaningStatus)
    ? (params.status as CleaningStatus)
    : undefined;

  const staffUserId = params.staff?.trim() || undefined;

  const rawProperty = params.property?.trim();
  const propertyName = rawProperty
    ? getCanonicalPropertyName(rawProperty) || undefined
    : undefined;

  return {
    startDate,
    endDate,
    status,
    staffUserId,
    propertyName: propertyName && propertyName.length > 0 ? propertyName : undefined,
  };
}
