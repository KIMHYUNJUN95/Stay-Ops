import { getCleaningOperatingDateKey } from "@/lib/cleaning";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
} from "@/lib/room-label-normalization";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type ParticipantRow = Database["public"]["Tables"]["task_participants"]["Row"];
type UpdateRow = Database["public"]["Tables"]["task_updates"]["Row"];

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
  isInbox: boolean;
  isShared: boolean;
  recurrenceRule: string | null;
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
      isInbox: r.is_inbox,
      isShared: sharedCount > 0,
      recurrenceRule: r.recurrence_rule,
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
    .select("*")
    .eq("organization_id", session.organization.id)
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
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message ?? "")) return null;
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
