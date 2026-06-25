import { getCleaningOperatingDateKey } from "@/lib/cleaning";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
} from "@/lib/room-label-normalization";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type ParticipantRow = Database["public"]["Tables"]["task_participants"]["Row"];
type UpdateRow = Database["public"]["Tables"]["task_updates"]["Row"];

const TASK_SELECT = [
  "id",
  "organization_id",
  "created_by_user_id",
  "title",
  "description",
  "scheduled_date",
  "due_at",
  "all_day",
  "time_label",
  "priority",
  "sort_order",
  "status",
  "project_id",
  "section_id",
  "is_inbox",
  "recurrence_rule",
  "recurrence_series_id",
  "recurrence_instance_date",
  "tags",
  "image_urls",
  "completed_at",
  "completed_by_user_id",
  "created_at",
  "updated_at",
  "property_id",
  "room_id",
  "reservation_id",
  "guest_name",
].join(", ");

export type TaskParticipant = {
  userId: string;
  name: string;
  role: string;
  isFirstRecipient: boolean;
};

/** Resolved display data for a task's linked context (property, room, reservation). */
export type LinkedTaskContext = {
  /** Raw saved UUIDs — passed back to the edit form so a link round-trips without re-picking. */
  propertyId: string | null;
  roomId: string | null;
  propertyName: string | null;
  roomLabel: string | null;
  guestName: string | null;
  channel: "airbnb" | "booking" | "direct" | null;
  checkinDate: string | null;
  checkoutDate: string | null;
  nightsCount: number | null;
  reservationId: string | null;
};

export type TaskUpdateEntry = {
  id: string;
  type: string;
  body: string | null;
  imageUrls: string[];
  createdAt: string;
  byUserId: string | null;
  byName: string;
};

export type TaskRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  authorName: string;
  title: string;
  description: string | null;
  scheduledDate: string | null;
  dueAt: string | null;
  allDay: boolean;
  timeLabel: string | null;
  priority: string;
  sortOrder: number | null;
  status: string;
  projectId: string | null;
  sectionId: string | null;
  isInbox: boolean;
  isShared: boolean;
  recurrenceRule: string | null;
  recurrenceSeriesId: string | null;
  recurrenceInstanceDate: string | null;
  tags: string[];
  imageUrls: string[];
  completedAt: string | null;
  completedByUserId: string | null;
  completedByName: string;
  createdAt: string;
  updatedAt: string;
  participants: TaskParticipant[];
  resolvedContext: LinkedTaskContext | null;
};

export type TaskDetail = TaskRecord & { updates: TaskUpdateEntry[] };

export type ShareableUser = { id: string; name: string; role: string };

function isMissingTable(message: string): boolean {
  return message.includes("does not exist") || message.includes("schema cache");
}

type ProfileName = { id: string; name: string };

/** Tokyo operating date (YYYY-MM-DD) used as "today" for task date logic. */
export function tokyoToday(): string {
  return getCleaningOperatingDateKey();
}

/** Tokyo calendar date (YYYY-MM-DD) of a timestamptz value. */
export function tokyoDateOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** The single date a task is anchored to for list/calendar grouping (due wins over scheduled). */
export function taskAnchorDate(task: TaskRecord): string | null {
  return tokyoDateOf(task.dueAt) ?? task.scheduledDate ?? null;
}

export type NormalizedTaskDateTime = {
  scheduledDate: string | null;
  dueAt: string | null;
  allDay: boolean;
  timeLabel: string | null;
};

/**
 * Single source of truth for how task date/time form inputs persist — shared by
 * `createTask` and `updateTaskCore` so the two never drift.
 *
 * Rule:
 * - `time_label` is the task's optional time-of-day ("HH:MM"); `all_day = no time-of-day`.
 * - a time is only kept when the task is anchored to a date (scheduled or due); with no
 *   date at all the time is dropped and the task stays all-day (no floating time).
 * - `due_at` carries the time only when a due date exists (Tokyo, +09:00); an all-day due
 *   date is stored at 00:00 local — the existing intentional pattern, since `anchor()`
 *   reads only the Tokyo calendar date. With no due date, `due_at` is null even if a time
 *   shows on the scheduled date (time_label drives display, not due_at).
 * - invalid/partial date or time strings are treated as unset.
 */
/** Recurrence rules a user may newly assign in this slice (lightweight, display-only). */
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

export function ymdShift(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function ymdDiffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonthlyYmd(ymd: string, months: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12 + 1;
  return formatYmd(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

function getRecurrenceWindow() {
  const today = tokyoToday();
  const [year, month] = today.split("-").map(Number);
  const start = formatYmd(year, month, 1);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const end = formatYmd(
    nextMonthYear,
    nextMonth,
    daysInMonth(nextMonthYear, nextMonth),
  );
  return { start, end };
}

export function taskAnchorDateInput(input: {
  scheduledDate: string | null;
  dueAt: string | null;
}): string | null {
  return tokyoDateOf(input.dueAt) ?? input.scheduledDate ?? null;
}

export function taskNeedsRecurrenceDate(
  recurrenceRule: string | null,
  anchorDate: string | null,
): boolean {
  return !!recurrenceRule && !anchorDate;
}

function isStandardRecurrenceRule(value: string | null): value is StandardRecurrenceRule {
  return !!value && (STANDARD_RECURRENCE_RULES as readonly string[]).includes(value);
}

function nextOccurrenceDate(rule: StandardRecurrenceRule, fromDate: string): string {
  if (rule === "daily") return ymdShift(fromDate, 1);
  if (rule === "weekly") return ymdShift(fromDate, 7);
  if (rule === "monthly") return shiftMonthlyYmd(fromDate, 1);

  let cursor = ymdShift(fromDate, 1);
  while (true) {
    const [year, month, day] = cursor.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const matches =
      rule === "weekdays"
        ? weekday >= 1 && weekday <= 5
        : weekday === 0 || weekday === 6;
    if (matches) return cursor;
    cursor = ymdShift(cursor, 1);
  }
}

function previousOccurrenceDate(rule: StandardRecurrenceRule, fromDate: string): string {
  if (rule === "daily") return ymdShift(fromDate, -1);
  if (rule === "weekly") return ymdShift(fromDate, -7);
  if (rule === "monthly") return shiftMonthlyYmd(fromDate, -1);

  let cursor = ymdShift(fromDate, -1);
  while (true) {
    const [year, month, day] = cursor.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const matches =
      rule === "weekdays" ? weekday >= 1 && weekday <= 5 : weekday === 0 || weekday === 6;
    if (matches) return cursor;
    cursor = ymdShift(cursor, -1);
  }
}

// ── Todoist-style recurrence (single live task, no pre-materialized instances) ────────────────
// A recurring task is ONE row carrying a `recurrence_rule` + its current occurrence date.
// Completing it rolls the same row forward to the next occurrence; the calendar expands future
// occurrences virtually (display-only). The pure, client-safe date math (isStandardRecurrence /
// recurringOccurrencesInRange) lives in `@/lib/tasks-recurrence`; the TaskRecord-bound helpers
// below are used by the server actions.

/** The task's current occurrence date (recurrence anchor), or null if not dated. */
function currentInstanceOf(task: TaskRecord): string | null {
  return task.recurrenceInstanceDate ?? taskAnchorDate(task);
}

/**
 * Next occurrence date for a recurring task, or null if it is not a standard recurring task.
 *
 * If the task was completed late (its current occurrence is already in the past), the next
 * occurrence is advanced past today so it lands in the future — Todoist's "don't pile up overdue"
 * behavior, rather than grinding through every missed day one completion at a time. The rule's
 * weekday / day-of-month anchor is preserved (we iterate the rule, never jump to a raw `today`).
 */
export function nextRecurringInstance(task: TaskRecord): string | null {
  if (!isStandardRecurrenceRule(task.recurrenceRule)) return null;
  const current = currentInstanceOf(task);
  if (!current) return null;
  const today = tokyoToday();
  let next = nextOccurrenceDate(task.recurrenceRule, current);
  let guard = 0;
  while (next <= today && guard++ < 1000) next = nextOccurrenceDate(task.recurrenceRule, next);
  return next;
}

/** Previous occurrence date (used to undo a roll-forward), or null if not standard recurring. */
export function previousRecurringInstance(task: TaskRecord): string | null {
  if (!isStandardRecurrenceRule(task.recurrenceRule)) return null;
  const current = currentInstanceOf(task);
  return current ? previousOccurrenceDate(task.recurrenceRule, current) : null;
}

/**
 * Date fields for moving a recurring task to `targetInstance`, preserving the scheduled/due offsets
 * and time-of-day. Returns null if the task has no current occurrence date.
 */
export function shiftRecurringTaskDates(
  task: TaskRecord,
  targetInstance: string,
): { scheduledDate: string | null; dueAt: string | null; recurrenceInstanceDate: string } | null {
  const current = currentInstanceOf(task);
  if (!current) return null;
  const delta = ymdDiffDays(current, targetInstance);
  const scheduledDate = task.scheduledDate ? ymdShift(task.scheduledDate, delta) : null;
  const dueDate = tokyoDateOf(task.dueAt);
  const dueAt = dueDate
    ? new Date(`${ymdShift(dueDate, delta)}T${task.timeLabel || "00:00"}:00+09:00`).toISOString()
    : null;
  return { scheduledDate, dueAt, recurrenceInstanceDate: targetInstance };
}

function fastForwardRecurrenceCursor(
  rule: StandardRecurrenceRule,
  fromDate: string,
  windowStart: string,
): string {
  if (fromDate >= windowStart) return fromDate;
  if (rule === "daily" || rule === "weekdays" || rule === "weekends") {
    return ymdShift(windowStart, -1);
  }
  if (rule === "weekly") {
    const diff = ymdDiffDays(fromDate, windowStart);
    const jumps = Math.max(0, Math.floor((diff - 1) / 7));
    return ymdShift(fromDate, jumps * 7);
  }
  const monthDiff =
    (Number(windowStart.slice(0, 4)) - Number(fromDate.slice(0, 4))) * 12 +
    (Number(windowStart.slice(5, 7)) - Number(fromDate.slice(5, 7)));
  return shiftMonthlyYmd(fromDate, Math.max(0, monthDiff - 1));
}

type RecurrenceTaskRow = Pick<
  TaskRow,
  | "all_day"
  | "created_by_user_id"
  | "description"
  | "due_at"
  | "guest_name"
  | "id"
  | "image_urls"
  | "is_inbox"
  | "is_shared"
  | "organization_id"
  | "priority"
  | "project_id"
  | "property_id"
  | "recurrence_instance_date"
  | "recurrence_rule"
  | "recurrence_series_id"
  | "reservation_id"
  | "room_id"
  | "scheduled_date"
  | "section_id"
  | "tags"
  | "time_label"
  | "title"
>;

type RecurrenceParticipantRow = Pick<
  ParticipantRow,
  "added_by_user_id" | "is_first_recipient" | "role" | "user_id"
>;

function buildRecurringTaskInsert(source: RecurrenceTaskRow, targetDate: string) {
  const sourceInstance = source.recurrence_instance_date;
  if (!sourceInstance || !source.recurrence_series_id) return null;

  const scheduledOffset = source.scheduled_date
    ? ymdDiffDays(sourceInstance, source.scheduled_date)
    : null;
  const sourceDueDate = tokyoDateOf(source.due_at);
  const dueOffset = sourceDueDate ? ymdDiffDays(sourceInstance, sourceDueDate) : null;
  const nextScheduledDate =
    scheduledOffset == null ? null : ymdShift(targetDate, scheduledOffset);
  const nextDueDate = dueOffset == null ? null : ymdShift(targetDate, dueOffset);
  const nextDueAt = nextDueDate
    ? new Date(`${nextDueDate}T${source.time_label || "00:00"}:00+09:00`).toISOString()
    : null;

  const insert: Database["public"]["Tables"]["tasks"]["Insert"] = {
    organization_id: source.organization_id,
    created_by_user_id: source.created_by_user_id,
    title: source.title,
    description: source.description,
    scheduled_date: nextScheduledDate,
    due_at: nextDueAt,
    all_day: source.all_day,
    time_label: source.time_label,
    priority: source.priority,
    status: "open",
    is_inbox: source.is_inbox,
    is_shared: source.is_shared,
    recurrence_rule: source.recurrence_rule,
    recurrence_series_id: source.recurrence_series_id,
    recurrence_instance_date: targetDate,
    tags: source.tags ?? [],
    image_urls: source.image_urls ?? [],
    property_id: source.property_id,
    room_id: source.room_id,
    reservation_id: source.reservation_id,
    guest_name: source.guest_name,
    project_id: source.project_id,
    section_id: source.section_id,
  };
  return insert;
}

/**
 * Resolve a submitted recurrence rule to its stored value — the server-side contract that
 * matches the documented product rule (not a UI-only restriction):
 * - a standard rule passes through;
 * - empty / unrecognized fails closed to `null` (non-recurring);
 * - `custom` is **round-trip only**: kept solely when the task already had `custom`
 *   (`previousRule === "custom"`), never newly assignable. So a new task can never be created
 *   with `custom`, and a non-custom task can never be turned into `custom`, even by a crafted
 *   request. There is no custom rule builder in this slice.
 */
export function resolveRecurrenceRule(
  submitted: string,
  previousRule: string | null,
): string | null {
  if ((STANDARD_RECURRENCE_RULES as readonly string[]).includes(submitted)) return submitted;
  if (submitted === "custom" && previousRule === "custom") return "custom";
  return null;
}

/**
 * True when a specific time was entered but there is no date anchor (neither scheduled
 * nor due). Such a submission is rejected — `normalizeTaskDateTime` would otherwise drop
 * the time silently, which reads as data loss to the user. Enforced in the form and in
 * both server actions (create + edit).
 */
export function taskTimeWithoutDate(input: {
  scheduledDate: string;
  dueDate: string;
  time: string;
}): boolean {
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v: string) => /^\d{2}:\d{2}$/.test(v);
  return isTime(input.time) && !isDate(input.scheduledDate) && !isDate(input.dueDate);
}

export function normalizeTaskDateTime(input: {
  scheduledDate: string;
  dueDate: string;
  time: string;
}): NormalizedTaskDateTime {
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v: string) => /^\d{2}:\d{2}$/.test(v);
  const scheduledDate = isDate(input.scheduledDate) ? input.scheduledDate : null;
  const dueDate = isDate(input.dueDate) ? input.dueDate : null;
  const time = isTime(input.time) ? input.time : "";
  const timeOfDay = scheduledDate || dueDate ? time : "";
  const dueAt = dueDate
    ? new Date(`${dueDate}T${timeOfDay || "00:00"}:00+09:00`).toISOString()
    : null;
  return {
    scheduledDate,
    dueAt,
    allDay: !timeOfDay,
    timeLabel: timeOfDay || null,
  };
}

export function isTaskActive(task: TaskRecord): boolean {
  return task.status !== "completed" && task.status !== "cancelled";
}

export function isTaskOverdue(task: TaskRecord): boolean {
  const due = tokyoDateOf(task.dueAt);
  return isTaskActive(task) && !!due && due < tokyoToday();
}

export function isTaskToday(task: TaskRecord): boolean {
  if (!isTaskActive(task) || isTaskOverdue(task)) return false;
  const today = tokyoToday();
  return task.scheduledDate === today || tokyoDateOf(task.dueAt) === today;
}

export function canEditTaskCore(session: AppSession, task: TaskRecord): boolean {
  return task.createdByUserId === session.user.id;
}

type ResContextRow = {
  id: string;
  property_name: string;
  room_label: string;
  source: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
};
type PropContextRow = { id: string; name: string };
type RoomContextRow = { id: string; room_label: string };

function detectChannel(source: string): "airbnb" | "booking" | "direct" {
  const s = (source ?? "").toLowerCase();
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("booking")) return "booking";
  return "direct";
}

function buildLinkedContext(
  r: TaskRow,
  reservationMap: Map<string, ResContextRow>,
  propertyNameMap: Map<string, string>,
  roomLabelMap: Map<string, string>,
): LinkedTaskContext | null {
  const hasAny = r.reservation_id || r.property_id || r.room_id || r.guest_name;
  if (!hasAny) return null;

  if (r.reservation_id) {
    const res = reservationMap.get(r.reservation_id);
    if (res) {
      const msPerDay = 1000 * 60 * 60 * 24;
      const nightsCount = Math.round(
        (new Date(res.check_out_date).getTime() - new Date(res.check_in_date).getTime()) / msPerDay,
      );
      // Normalize to canonical property + merged display room label so chips/detail read the
      // same as the calendar and picker (e.g. "荒木町A" / "201_2" → "아라키초A" / "201").
      const canonProp = getCanonicalPropertyName(res.property_name);
      const displayRoom = getDisplayRoomLabel(
        canonProp,
        getCanonicalRoomLabel(canonProp, res.room_label),
      );
      return {
        propertyId: r.property_id,
        roomId: r.room_id,
        propertyName: canonProp,
        roomLabel: displayRoom,
        guestName: r.guest_name ?? res.guest_name,
        channel: detectChannel(res.source),
        checkinDate: res.check_in_date,
        checkoutDate: res.check_out_date,
        nightsCount,
        reservationId: r.reservation_id,
      };
    }
  }

  // Room-only / property-only link: resolve raw names from the joined property/room rows, then
  // normalize to canonical property + merged display room label (matches the reservation branch).
  const rawPropertyName = r.property_id ? (propertyNameMap.get(r.property_id) ?? null) : null;
  const rawRoomLabel = r.room_id ? (roomLabelMap.get(r.room_id) ?? null) : null;
  const canonProp = rawPropertyName ? getCanonicalPropertyName(rawPropertyName) : null;
  const displayRoom =
    canonProp && rawRoomLabel
      ? getDisplayRoomLabel(canonProp, getCanonicalRoomLabel(canonProp, rawRoomLabel))
      : rawRoomLabel;

  return {
    propertyId: r.property_id,
    roomId: r.room_id,
    propertyName: canonProp ?? rawPropertyName,
    roomLabel: displayRoom,
    guestName: r.guest_name ?? null,
    channel: null,
    checkinDate: null,
    checkoutDate: null,
    nightsCount: null,
    reservationId: null,
  };
}

/**
 * Materialize recurring task instances as real task rows for the active operating window.
 *
 * Current window: first day of the current Tokyo month through the last day of next month.
 * This keeps Today/Tomorrow and the built-in calendar populated without backfilling an
 * unbounded historical backlog for older daily recurrences.
 */
/**
 * @deprecated Todoist-style recurrence (2026-06-16): recurring tasks are no longer pre-materialized
 * into one row per date. A recurring task is a single live row that rolls forward on completion
 * (see `completeTask`), and the calendar expands future occurrences virtually
 * (`recurringOccurrencesInRange`). This window-generator is retained only for reference and is no
 * longer called from any read path. Do not re-introduce calls — it causes the inbox/sent tabs to
 * fill with duplicate-looking instances.
 */
export async function materializeRecurringTasks(options: {
  organizationId?: string;
} = {}): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { start, end } = getRecurrenceWindow();

  let query = supabase
    .from("tasks")
    .select(
      "id, organization_id, created_by_user_id, title, description, scheduled_date, due_at, all_day, time_label, priority, is_inbox, is_shared, recurrence_rule, recurrence_series_id, recurrence_instance_date, tags, image_urls, property_id, room_id, reservation_id, guest_name, project_id, section_id",
    )
    .not("recurrence_series_id", "is", null)
    .not("recurrence_instance_date", "is", null)
    .order("recurrence_instance_date", { ascending: true });
  if (options.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }

  const { data, error } = await query;
  // supabase-js v2 collapses the chained-filter row type to `never`; cast before use (same
  // workaround as the reservation queries elsewhere in this file).
  const rows = (data ?? []) as RecurrenceTaskRow[];
  if (error || rows.length === 0) return;

  const taskIds = rows.map((row) => row.id);
  const { data: participantData } = await supabase
    .from("task_participants")
    .select("task_id, user_id, role, is_first_recipient, added_by_user_id")
    .in("task_id", taskIds);

  const participantsByTask = new Map<string, RecurrenceParticipantRow[]>();
  for (const participant of (participantData ?? []) as Array<
    RecurrenceParticipantRow & { task_id: string }
  >) {
    const list = participantsByTask.get(participant.task_id) ?? [];
    list.push({
      user_id: participant.user_id,
      role: participant.role,
      is_first_recipient: participant.is_first_recipient,
      added_by_user_id: participant.added_by_user_id,
    });
    participantsByTask.set(participant.task_id, list);
  }

  const seriesMap = new Map<string, RecurrenceTaskRow[]>();
  for (const row of rows) {
    if (!row.recurrence_series_id) continue;
    const list = seriesMap.get(row.recurrence_series_id) ?? [];
    list.push(row);
    seriesMap.set(row.recurrence_series_id, list);
  }

  for (const [seriesId, seriesRows] of seriesMap) {
    const chain = [...seriesRows].sort((a, b) =>
      (a.recurrence_instance_date ?? "").localeCompare(b.recurrence_instance_date ?? ""),
    );
    const latest = chain[chain.length - 1];
    const latestDate = latest?.recurrence_instance_date;
    if (!latestDate || !isStandardRecurrenceRule(latest.recurrence_rule)) continue;

    let source = latest;
    let cursor = fastForwardRecurrenceCursor(latest.recurrence_rule, latestDate, start);
    while (true) {
      const candidate = nextOccurrenceDate(latest.recurrence_rule, cursor);
      if (candidate > end) break;
      cursor = candidate;
      if (candidate < start) continue;

      const insert = buildRecurringTaskInsert(source, candidate);
      if (!insert) continue;

      const { data: insertedTask, error: insertError } = await supabase
        .from("tasks")
        .insert(insert as never)
        .select(
          "id, organization_id, created_by_user_id, title, description, scheduled_date, due_at, all_day, time_label, priority, is_inbox, is_shared, recurrence_rule, recurrence_series_id, recurrence_instance_date, tags, image_urls, property_id, room_id, reservation_id, guest_name, project_id, section_id",
        )
        .single();

      let taskRow = insertedTask as RecurrenceTaskRow | null;
      if (insertError) {
        if (insertError.code !== "23505") continue;
        const { data: existingTask } = await supabase
          .from("tasks")
          .select(
            "id, organization_id, created_by_user_id, title, description, scheduled_date, due_at, all_day, time_label, priority, is_inbox, is_shared, recurrence_rule, recurrence_series_id, recurrence_instance_date, tags, image_urls, property_id, room_id, reservation_id, guest_name, project_id, section_id",
          )
          .eq("organization_id", latest.organization_id)
          .eq("recurrence_series_id", seriesId)
          .eq("recurrence_instance_date", candidate)
          .maybeSingle();
        taskRow = (existingTask as RecurrenceTaskRow | null) ?? null;
      }
      if (!taskRow) continue;

      const participantRows = participantsByTask.get(source.id) ?? [];
      if (participantRows.length > 0) {
        const inserts: Database["public"]["Tables"]["task_participants"]["Insert"][] =
          participantRows.map((participant) => ({
            task_id: taskRow.id,
            user_id: participant.user_id,
            role: participant.role,
            is_first_recipient: participant.is_first_recipient,
            added_by_user_id: participant.added_by_user_id,
          }));
        await supabase
          .from("task_participants")
          .upsert(inserts as never, { onConflict: "task_id,user_id", ignoreDuplicates: true });
        participantsByTask.set(taskRow.id, participantRows);
      }

      chain.push(taskRow);
      chain.sort((a, b) =>
        (a.recurrence_instance_date ?? "").localeCompare(b.recurrence_instance_date ?? ""),
      );
      source = taskRow;
    }
  }
}

async function hydrate(rows: TaskRow[]): Promise<TaskRecord[]> {
  if (rows.length === 0) return [];
  const supabase = await getSupabaseServerClient();
  const taskIds = rows.map((r) => r.id);

  const { data: partData } = await supabase
    .from("task_participants")
    .select("task_id, user_id, role, is_first_recipient")
    .in("task_id", taskIds);
  const parts = (partData ?? []) as Array<
    Pick<ParticipantRow, "task_id" | "user_id" | "role" | "is_first_recipient">
  >;

  const userIds = new Set<string>();
  for (const r of rows) {
    userIds.add(r.created_by_user_id);
    if (r.completed_by_user_id) userIds.add(r.completed_by_user_id);
  }
  for (const p of parts) userIds.add(p.user_id);

  // Context resolution — collect IDs for batch joins
  const reservationIds = rows.map((r) => r.reservation_id).filter((v): v is string => !!v);
  const propertyIdsNoRes = [
    ...new Set(
      rows
        .filter((r) => !r.reservation_id && r.property_id)
        .map((r) => r.property_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const roomIdsNoRes = [
    ...new Set(
      rows
        .filter((r) => !r.reservation_id && r.room_id)
        .map((r) => r.room_id)
        .filter((v): v is string => !!v),
    ),
  ];

  const [profiles, resRows, propRows, roomRows] = await Promise.all([
    userIds.size > 0
      ? supabase.from("profiles").select("id, name").in("id", Array.from(userIds)).then((r) => (r.data ?? []) as ProfileName[])
      : Promise.resolve([] as ProfileName[]),
    reservationIds.length > 0
      ? supabase
          .from("reservations")
          .select("id, property_name, room_label, source, check_in_date, check_out_date, guest_name")
          .in("id", reservationIds)
          .then((r) => (r.data ?? []) as ResContextRow[])
      : Promise.resolve([] as ResContextRow[]),
    propertyIdsNoRes.length > 0
      ? supabase.from("properties").select("id, name").in("id", propertyIdsNoRes).then((r) => (r.data ?? []) as PropContextRow[])
      : Promise.resolve([] as PropContextRow[]),
    roomIdsNoRes.length > 0
      ? supabase.from("rooms").select("id, room_label").in("id", roomIdsNoRes).then((r) => (r.data ?? []) as RoomContextRow[])
      : Promise.resolve([] as RoomContextRow[]),
  ]);

  const names = new Map<string, string>();
  for (const p of profiles) names.set(p.id, p.name);

  const reservationMap = new Map(resRows.map((r) => [r.id, r]));
  const propertyNameMap = new Map(propRows.map((p) => [p.id, p.name]));
  const roomLabelMap = new Map(roomRows.map((r) => [r.id, r.room_label]));

  const partsByTask = new Map<string, TaskParticipant[]>();
  for (const p of parts) {
    const list = partsByTask.get(p.task_id) ?? [];
    list.push({
      userId: p.user_id,
      name: names.get(p.user_id) ?? "",
      role: p.role,
      isFirstRecipient: p.is_first_recipient,
    });
    partsByTask.set(p.task_id, list);
  }

  return rows.map((r) => {
    const participants = partsByTask.get(r.id) ?? [];
    const sharedCount = participants.filter((p) => p.role !== "author").length;
    return {
      id: r.id,
      organizationId: r.organization_id,
      createdByUserId: r.created_by_user_id,
      authorName: names.get(r.created_by_user_id) ?? "",
      title: r.title,
      description: r.description,
      scheduledDate: r.scheduled_date,
      dueAt: r.due_at,
      allDay: r.all_day,
      timeLabel: r.time_label,
      priority: r.priority,
      sortOrder: r.sort_order ?? null,
      status: r.status,
      projectId: r.project_id ?? null,
      sectionId: r.section_id ?? null,
      isInbox: r.is_inbox,
      isShared: sharedCount > 0,
      recurrenceRule: r.recurrence_rule,
      recurrenceSeriesId: r.recurrence_series_id ?? null,
      recurrenceInstanceDate: r.recurrence_instance_date ?? null,
      tags: r.tags ?? [],
      imageUrls: r.image_urls ?? [],
      completedAt: r.completed_at,
      completedByUserId: r.completed_by_user_id,
      completedByName: r.completed_by_user_id ? names.get(r.completed_by_user_id) ?? "" : "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      participants,
      resolvedContext: buildLinkedContext(r, reservationMap, propertyNameMap, roomLabelMap),
    };
  });
}

/** All tasks visible to the current user (RLS-scoped to participant membership). */
export async function getVisibleTasks(session: AppSession): Promise<TaskRecord[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("organization_id", session.organization.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error.message ?? "")) return [];
    throw new Error(error.message);
  }
  return hydrate((data ?? []) as TaskRow[]);
}

/** All tasks belonging to a project (RLS-scoped: viewer must be a project participant). */
export async function getProjectTasks(
  session: AppSession,
  projectId: string,
): Promise<TaskRecord[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("organization_id", session.organization.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error.message ?? "")) return [];
    throw new Error(error.message);
  }
  return hydrate((data ?? []) as TaskRow[]);
}

/** One task with participants + full update log, scoped to the session org. */
export async function getTaskDetail(
  session: AppSession,
  id: string,
): Promise<TaskDetail | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message ?? "")) return null;
    // A malformed (non-UUID) id in the URL → treat as not-found, not a 500 crash.
    if (error.code === "22P02") return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const [record] = await hydrate([data as TaskRow]);
  if (!record) return null;

  const { data: updateData } = await supabase
    .from("task_updates")
    .select("id, task_id, created_by_user_id, update_type, body, image_urls, created_at")
    .eq("task_id", id)
    .order("created_at", { ascending: true });
  const updateRows = (updateData ?? []) as UpdateRow[];

  const updaterIds = Array.from(
    new Set(updateRows.map((u) => u.created_by_user_id).filter((v): v is string => !!v)),
  );
  const names = new Map<string, string>();
  if (updaterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", updaterIds);
    for (const p of (profiles ?? []) as ProfileName[]) names.set(p.id, p.name);
  }

  const updates: TaskUpdateEntry[] = updateRows.map((u) => ({
    id: u.id,
    type: u.update_type,
    body: u.body,
    imageUrls: u.image_urls ?? [],
    createdAt: u.created_at,
    byUserId: u.created_by_user_id,
    byName: u.created_by_user_id ? names.get(u.created_by_user_id) ?? "" : "",
  }));

  return { ...record, updates };
}

/** Active org members (excluding self) selectable as share recipients. */
export async function getShareableUsers(session: AppSession): Promise<ShareableUser[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, status, profiles(name)")
    .eq("organization_id", session.organization.id)
    .eq("status", "active");
  if (error) {
    if (isMissingTable(error.message ?? "")) return [];
    return [];
  }
  const rows = (data ?? []) as Array<{
    user_id: string;
    role: string;
    profiles: { name: string } | { name: string }[] | null;
  }>;
  return rows
    .filter((r) => r.user_id !== session.user.id)
    .map((r) => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return { id: r.user_id, name: profile?.name ?? "", role: r.role };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
