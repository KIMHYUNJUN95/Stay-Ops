import type {
  LeaveDurationUnit,
  LeaveRequestType,
} from "@/lib/annual-leave-requests-server";

export const BEREAVEMENT_DAYS = 3;

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function addDaysIso(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export type NormalizedLeavePeriod = {
  startDate: string;
  endDate: string;
  durationUnit: LeaveDurationUnit;
  daysCount: number;
};

/** Server-side source of truth for leave request dates and deducted day counts. */
export function normalizeLeaveRequestPeriod(input: {
  leaveType: LeaveRequestType;
  startDate: string;
  endDate: string;
  durationUnit: LeaveDurationUnit;
}): NormalizedLeavePeriod | null {
  const start = parseIsoDate(input.startDate);
  if (!start) return null;

  if (input.leaveType === "annual") {
    return {
      startDate: input.startDate,
      endDate: addDaysIso(start, BEREAVEMENT_DAYS - 1),
      durationUnit: "full",
      daysCount: BEREAVEMENT_DAYS,
    };
  }

  if (input.durationUnit === "am" || input.durationUnit === "pm") {
    return {
      startDate: input.startDate,
      endDate: input.startDate,
      durationUnit: input.durationUnit,
      daysCount: 0.5,
    };
  }

  const end = parseIsoDate(input.endDate);
  if (!end || end < start) return null;
  const daysCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    durationUnit: "full",
    daysCount,
  };
}
