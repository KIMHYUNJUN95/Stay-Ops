/**
 * Pure recurrence date math — **no server imports**, so this is safe to use from client components
 * (e.g. the calendar in `tasks-workspace.tsx`). The TaskRecord-bound recurrence helpers (rollover,
 * next/previous instance) live in `@/lib/tasks`, which pulls in server-only modules.
 *
 * Todoist-style recurrence (2026-06-16): a recurring task is a single live row; future occurrences
 * are computed on the fly (here) for calendar previews rather than stored as rows.
 */

export const STANDARD_RECURRENCE_RULES = [
  "daily",
  "weekly",
  "monthly",
  "weekdays",
  "weekends",
] as const;
type StandardRecurrenceRule = (typeof STANDARD_RECURRENCE_RULES)[number];

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ymdShift(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonthlyYmd(ymd: string, months: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (((targetMonthIndex % 12) + 12) % 12) + 1;
  return formatYmd(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

function isStd(value: string | null): value is StandardRecurrenceRule {
  return !!value && (STANDARD_RECURRENCE_RULES as readonly string[]).includes(value);
}

/** True when the rule is one of the supported standard recurrence rules. */
export function isStandardRecurrence(value: string | null): boolean {
  return isStd(value);
}

function nextOccurrence(rule: StandardRecurrenceRule, fromDate: string): string {
  if (rule === "daily") return ymdShift(fromDate, 1);
  if (rule === "weekly") return ymdShift(fromDate, 7);
  if (rule === "monthly") return shiftMonthlyYmd(fromDate, 1);

  let cursor = ymdShift(fromDate, 1);
  while (true) {
    const [year, month, day] = cursor.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const matches =
      rule === "weekdays" ? weekday >= 1 && weekday <= 5 : weekday === 0 || weekday === 6;
    if (matches) return cursor;
    cursor = ymdShift(cursor, 1);
  }
}

/**
 * All occurrence dates of a recurring task within [start, end] (inclusive), for calendar previews.
 * Generated forward from `anchor`; dates before `start` are skipped (no past previews).
 */
export function recurringOccurrencesInRange(
  rule: string | null,
  anchor: string,
  start: string,
  end: string,
): string[] {
  if (!isStd(rule)) return [];
  const out: string[] = [];
  let cursor = anchor;
  let guard = 0;
  while (cursor < start && guard++ < 1500) cursor = nextOccurrence(rule, cursor);
  while (cursor <= end && guard++ < 3000) {
    if (cursor >= start) out.push(cursor);
    cursor = nextOccurrence(rule, cursor);
  }
  return out;
}
