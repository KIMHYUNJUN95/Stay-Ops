/**
 * Pure recurrence date math — **no server imports**, so this is safe to use from client components
 * (e.g. the calendar in `tasks-workspace.tsx`). The TaskRecord-bound recurrence helpers (rollover,
 * next/previous instance) live in `@/lib/tasks`, which pulls in server-only modules.
 *
 * Todoist-style recurrence (2026-06-16): a recurring task is a single live row; future occurrences
 * are computed on the fly (here) for calendar previews rather than stored as rows.
 */

import { ymdShift } from "@/lib/tokyo-date";

// MUST stay in sync with `STANDARD_RECURRENCE_RULES` in `@/lib/tasks` (the server-only twin).
// A rule present in one but not the other silently diverges the two code paths — e.g. an overdue
// `yearly` task would roll forward via tasks.ts but be **hard-deleted** by the dismiss/reschedule
// branch that gates on this file's `isStandardRecurrence`.
export const STANDARD_RECURRENCE_RULES = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "weekdays",
  "weekends",
] as const;
type StandardRecurrenceRule = (typeof STANDARD_RECURRENCE_RULES)[number];

/* ============================================================
   사용자 지정 요일 반복 (2026-07-29)
   Stored in the same `tasks.recurrence_rule` text column as `custom:<d>,<d>,…` where each digit is
   a JS weekday (0=Sun … 6=Sat), deduped and ascending — e.g. `custom:1,3,5` = 매주 월·수·금.
   No schema change: the column was already free-form text.

   This is the ONE parser for the format; the server twin (`@/lib/tasks`) imports it from here
   rather than re-implementing, because the two files' recurrence tables drifting apart is exactly
   the failure the header warning above describes.
   ============================================================ */
export const CUSTOM_RECURRENCE_PREFIX = "custom:";

/** 0=일 … 6=토. Admin and mobile weekday pickers share this order so the two read identically. */
export const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

/** One weekday's short name in `locale` ("월"/"月"/"Mon"). 1970-01-04 was a Sunday. */
export function formatWeekday(weekday: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: locale.startsWith("en") ? "short" : "narrow",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(1970, 0, 4 + weekday)));
}

/** `custom:1,3,5` → `[1,3,5]`. Returns null for anything that isn't a well-formed custom rule. */
export function parseCustomWeekdays(rule: string | null): number[] | null {
  if (!rule || !rule.startsWith(CUSTOM_RECURRENCE_PREFIX)) return null;
  const body = rule.slice(CUSTOM_RECURRENCE_PREFIX.length);
  if (!body) return null;
  const days: number[] = [];
  for (const part of body.split(",")) {
    if (!/^[0-6]$/.test(part)) return null;
    const day = Number(part);
    if (!days.includes(day)) days.push(day);
  }
  if (!days.length) return null;
  return days.sort((a, b) => a - b);
}

/** `[5,1,3]` → `custom:1,3,5`. Returns null for an empty/invalid set (never store an empty rule). */
export function buildCustomRecurrenceRule(weekdays: readonly number[]): string | null {
  const days = [...new Set(weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
  return days.length ? `${CUSTOM_RECURRENCE_PREFIX}${days.join(",")}` : null;
}

/** True for a custom weekday rule specifically (bare legacy `"custom"` is NOT one — see below). */
export function isCustomWeekdayRecurrence(rule: string | null): boolean {
  return parseCustomWeekdays(rule) !== null;
}

/**
 * `custom:1,3,5` → "월·수·금" (en: "Mon, Wed, Fri"); "" when the rule isn't a custom one.
 *
 * Weekday names are locale data, not product copy, so this uses `Intl` like the rest of the task
 * date rendering rather than dictionary keys. `locale` is any BCP-47 tag ("ko", "ja-JP", …).
 * 1970-01-04 was a Sunday, which is why it anchors the weekday-0 lookup.
 */
export function formatCustomWeekdays(rule: string | null, locale: string): string {
  const days = parseCustomWeekdays(rule);
  if (!days) return "";
  const names = days.map((day) => formatWeekday(day, locale));
  return locale.startsWith("en") ? names.join(", ") : names.join("·");
}

/** Next date strictly after `fromDate` whose weekday is in `weekdays`. */
function nextWeekdayOccurrence(weekdays: readonly number[], fromDate: string, step: 1 | -1): string {
  let cursor = ymdShift(fromDate, step);
  for (let guard = 0; guard < 7; guard++) {
    const [year, month, day] = cursor.split("-").map(Number);
    if (weekdays.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay())) return cursor;
    cursor = ymdShift(cursor, step);
  }
  return cursor; // unreachable for a non-empty set; keeps the return type total
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function shiftYearlyYmd(ymd: string, years: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const targetYear = year + years;
  return formatYmd(targetYear, month, Math.min(day, daysInMonth(targetYear, month)));
}

function isStd(value: string | null): value is StandardRecurrenceRule {
  return !!value && (STANDARD_RECURRENCE_RULES as readonly string[]).includes(value);
}

/**
 * True when this module can compute the rule's occurrences — the six standard rules plus a custom
 * weekday rule (`custom:1,3,5`). Bare legacy `"custom"` carries no weekday set, so it stays false
 * and keeps its existing display-only behavior.
 *
 * Callers use this as the "is this a live recurring task?" gate, so it MUST agree with the server
 * twin. See the header warning: a rule that rolls forward there but returns false here is hard-
 * deleted by the dismiss/reschedule branch.
 */
export function isStandardRecurrence(value: string | null): boolean {
  return isStd(value) || isCustomWeekdayRecurrence(value);
}

function nextOccurrence(rule: string, fromDate: string): string {
  const customDays = parseCustomWeekdays(rule);
  if (customDays) return nextWeekdayOccurrence(customDays, fromDate, 1);
  if (rule === "daily") return ymdShift(fromDate, 1);
  if (rule === "weekly") return ymdShift(fromDate, 7);
  if (rule === "monthly") return shiftMonthlyYmd(fromDate, 1);
  if (rule === "yearly") return shiftYearlyYmd(fromDate, 1);

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
 * 반복 작업을 `targetDate` 로 옮겨도 되는가 — **이미 그 날짜에 회차가 있으면 false**.
 *
 * 단일 행 모델이라 옮겨도 행이 늘지는 않지만, 사용자 눈에는 "내일에도 이미 있는 그 작업"을 또 내일로
 * 미는 것이라 의미가 없다(2026-07-30 요구). 비반복 작업이나 앵커가 없는 작업은 항상 허용한다.
 *
 * `anchor` 는 그 작업의 현재 회차 날짜다. 앵커 자신과 같은 날짜로 옮기는 것은 애초에 no-op 이라
 * 여기서 막지 않는다(호출부의 메뉴가 반대 방향만 노출한다).
 */
export function canMoveRecurringTo(
  rule: string | null,
  anchor: string | null,
  targetDate: string,
): boolean {
  if (!anchor || !isStandardRecurrence(rule)) return true;
  if (anchor === targetDate) return true;
  return recurringOccurrencesInRange(rule, anchor, targetDate, targetDate).length === 0;
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
  if (!isStandardRecurrence(rule) || rule === null) return [];
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

/**
 * True only when `occurrenceDate` is a real occurrence generated by `rule` from `anchor`.
 *
 * Detail routes receive the date through the URL, so callers must treat it as an untrusted
 * candidate. Keeping this check in the pure recurrence module makes the page and server actions
 * use the same validation rule.
 */
export function isRecurringOccurrenceDate(
  rule: string | null,
  anchor: string | null,
  occurrenceDate: string,
): boolean {
  if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate) || !isStandardRecurrence(rule)) {
    return false;
  }
  return recurringOccurrencesInRange(rule, anchor, occurrenceDate, occurrenceDate).length === 1;
}

/* ============================================================
   회차 상태 (2026-07-30, 롤포워드 폐지)
   반복 업무는 완료해도 행이 안 넘어간다(고정 앵커). 각 회차(occurrence_date)의 완료/스킵/이동
   상태는 `task_occurrence_state` 테이블이 정본이고, 클라/서버가 이 순수 헬퍼로 판정한다.
   두 코드 경로(server tasks.ts / client 컴포넌트)가 어긋나면 안 되므로 여기 한 곳에 둔다.
   ============================================================ */
export type OccurrenceState = "completed" | "skipped" | "moved";

/** True when a state resolves an occurrence (removes it from "open"/overdue). All three do. */
export function isResolvedOccurrenceState(state: OccurrenceState | undefined): boolean {
  return state === "completed" || state === "skipped" || state === "moved";
}

/**
 * Outstanding (still-open) OVERDUE occurrence dates of a recurring task: rule occurrences in
 * `[anchor, today)` that have no recorded state. `resolvedDates` is the set of occurrence_date
 * strings that already carry a `task_occurrence_state` row (completed/skipped/moved) for this task.
 * Empty for non-standard rules or when nothing is overdue. Never auto-expires — a date stays here
 * until it is completed, skipped, or moved (see decision log 2026-07-30).
 */
/**
 * `from`(포함) 이후 첫 회차. 반복이 아니거나 앵커가 없으면 null.
 *
 * **반복 업무의 `dueAt` 은 마감일이 아니라 앵커다** — 「7/30부터 평일마다」의 시작점이라 고정된
 * 채로 과거에 남는다. 이걸 마감일처럼 오늘과 비교하면 반복 업무가 전부 «지연»으로 보인다
 * (2026-08-07 관리함에서 실제로 그랬다). 목록에서 반복 업무에 날짜를 보여줄 거라면 앵커가 아니라
 * **다음 회차**여야 한다.
 *
 * 창을 400일로 끊는다: 「평일」이면 첫 회차가 며칠 안에 나오고, 그보다 성긴 규칙(연 단위)이라도
 * 400일이면 반드시 하나는 걸린다. 무한 루프 대신 명시적 상한을 두는 것이 안전하다.
 */
export function nextRecurringOccurrence(
  rule: string | null,
  anchor: string | null,
  from: string,
): string | null {
  if (!anchor || !isStandardRecurrence(rule)) return null;
  const [occurrence] = recurringOccurrencesInRange(rule, anchor, from, ymdShift(from, 400));
  return occurrence ?? null;
}

export function outstandingOverdueOccurrences(
  rule: string | null,
  anchor: string | null,
  today: string,
  resolvedDates: ReadonlySet<string>,
): string[] {
  if (!anchor || !isStandardRecurrence(rule)) return [];
  const yesterday = ymdShift(today, -1);
  if (yesterday < anchor) return [];
  return recurringOccurrencesInRange(rule, anchor, anchor, yesterday).filter(
    (d) => !resolvedDates.has(d),
  );
}
