"use server";

import { revalidatePath } from "next/cache";
import { generateDailyReport, type DailyReportResult } from "@/app/mobile/tasks/report-actions";
import { notifyProjectMembers, notifyTaskParticipants } from "@/lib/notifications/create";
import type { TaskNotificationPayload } from "@/lib/notifications/types";
import { getProjectDetail, type ProjectDetailData } from "@/lib/projects";
import {
  getShareableUsers,
  getTaskDetail,
  nextRecurringInstance,
  normalizeTaskDateTime,
  previousRecurringInstance,
  resolveRecurrenceRule,
  shiftRecurringTaskDates,
  taskAnchorDateInput,
  taskNeedsRecurrenceDate,
  taskTimeWithoutDate,
  tokyoToday,
  type TaskDetail,
} from "@/lib/tasks";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

export type TaskActionResult = { ok: true; id?: string } | { ok: false; error: string };

type Session = NonNullable<Awaited<ReturnType<typeof getCurrentAppSession>>>;

const PRIORITIES = new Set(["normal", "important", "urgent"]);
const CONSOLE_PATH = "/admin/tasks";

// Session + org-context guard for the result-returning console actions (no redirect).
async function resolveSession(): Promise<Session | null> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return null;
  return session;
}

// getTaskDetail is RLS-scoped, so a non-null result already proves the acting user is a
// participant. Author-only actions additionally check authorship.
async function resolveTask(
  taskId: string,
): Promise<{ session: Session; task: TaskDetail } | null> {
  const session = await resolveSession();
  if (!session) return null;
  const id = String(taskId ?? "").trim();
  if (!id) return null;
  const task = await getTaskDetail(session, id);
  if (!task) return null;
  return { session, task };
}

function otherParticipantIds(task: TaskDetail, actorUserId: string): string[] {
  return task.participants.map((p) => p.userId).filter((uid) => uid !== actorUserId);
}

async function notify(
  taskId: string,
  recipientUserIds: string[],
  actorUserId: string,
  organizationId: string,
  type: "task_shared" | "task_updated" | "task_completed",
  event: TaskNotificationPayload["event"],
  taskTitle: string,
  dedupeBase: string,
) {
  if (recipientUserIds.length === 0) return;
  await notifyTaskParticipants(getSupabaseServiceClient(), {
    organizationId,
    taskId,
    recipientUserIds,
    actorUserId,
    type,
    dedupeBase,
    payload: { taskId, taskTitle, actorUserId, event },
  });
}

// Clamp a submitted duration to the 1–1440 minute block length, or null if out of range/absent.
function clampDuration(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n >= 1 && n <= 1440 ? n : null;
}

// ── 1. Create ─────────────────────────────────────────────────────────────────
export async function createConsoleTask(input: {
  title: string;
  desc: string;
  date: string;
  time: string;
  durationMinutes: number | null;
  repeat: string;
  priority: string;
  tags: string[];
  projectId?: string | null;
  sectionId?: string | null;
  targetUserIds: string[];
  isDirective: boolean;
}): Promise<TaskActionResult> {
  const session = await resolveSession();
  if (!session) return { ok: false, error: "auth" };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "missing_title" };

  const description = input.desc.trim();
  const date = input.date.trim();
  const time = input.time.trim();
  const priority = PRIORITIES.has(input.priority) ? input.priority : "normal";
  // Create has no previous rule, so `custom` can never be newly assigned (→ null).
  const repeat = resolveRecurrenceRule(input.repeat, null);
  const tags = input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10);

  // Single-date model: scheduledDate is always empty; dueDate carries the single date.
  if (taskTimeWithoutDate({ scheduledDate: "", dueDate: date, time })) {
    return { ok: false, error: "time_needs_date" };
  }
  const { scheduledDate: sched, dueAt, allDay, timeLabel } = normalizeTaskDateTime({
    scheduledDate: "",
    dueDate: date,
    time,
  });
  // Duration is a time-block length and is only meaningful with a time-of-day.
  const finalDuration = timeLabel ? clampDuration(input.durationMinutes) : null;
  const anchorDate = taskAnchorDateInput({ scheduledDate: sched, dueAt });
  if (taskNeedsRecurrenceDate(repeat, anchorDate)) {
    return { ok: false, error: "repeat_needs_date" };
  }

  // Optional project link: getProjectDetail is RLS-scoped, so a non-null result proves the acting
  // user is a project participant. Project tasks are never per-task shared/directive.
  let linkedProjectId: string | null = null;
  let linkedSectionId: string | null = null;
  if (input.projectId) {
    const project = await getProjectDetail(session, input.projectId);
    if (!project) return { ok: false, error: "invalid_project" };
    linkedProjectId = input.projectId;
    linkedSectionId =
      input.sectionId && project.sections.some((s) => s.id === input.sectionId)
        ? input.sectionId
        : null;
  }

  // Validate targets against the org's active members (fail closed); never for project tasks.
  let shareIds: string[] = [];
  if (!linkedProjectId && input.targetUserIds.length > 0) {
    const allowed = new Set((await getShareableUsers(session)).map((u) => u.id));
    shareIds = Array.from(new Set(input.targetUserIds)).filter(
      (uid) => uid !== session.user.id && allowed.has(uid),
    );
  }
  const isDirective = !linkedProjectId && input.isDirective && shareIds.length > 0;
  // Dateless personal/shared quick-adds land in the staging Inbox (Todoist parity); dated tasks
  // and project tasks are never inbox.
  const isInboxTask = !sched && !dueAt && !linkedProjectId;

  const id = crypto.randomUUID();
  const recurrenceSeriesId = repeat ? id : null;
  const supabase = getSupabaseServiceClient();

  const insert: Database["public"]["Tables"]["tasks"]["Insert"] = {
    id,
    organization_id: session.organization.id,
    created_by_user_id: session.user.id,
    title,
    description: description || null,
    scheduled_date: sched,
    due_at: dueAt,
    all_day: allDay,
    time_label: timeLabel,
    duration_minutes: finalDuration,
    priority,
    status: "open",
    is_inbox: isInboxTask,
    is_shared: shareIds.length > 0,
    is_directive: isDirective,
    recurrence_rule: repeat,
    recurrence_series_id: recurrenceSeriesId,
    recurrence_instance_date: recurrenceSeriesId ? anchorDate : null,
    tags,
    image_urls: [],
    project_id: linkedProjectId,
    section_id: linkedSectionId,
  };
  const { error } = await supabase.from("tasks").insert(insert as never);
  if (error) return { ok: false, error: "save_failed" };

  // The author row MUST carry the same keys as the participant rows so PostgREST does not fill an
  // omitted NOT NULL column with NULL across the multi-row insert (see the mobile create note).
  const participantRows: Database["public"]["Tables"]["task_participants"]["Insert"][] = [
    {
      task_id: id,
      user_id: session.user.id,
      role: "author",
      is_first_recipient: false,
      added_by_user_id: null,
    },
    ...shareIds.map((uid, index) => ({
      task_id: id,
      user_id: uid,
      role: "participant",
      is_first_recipient: index === 0,
      added_by_user_id: session.user.id,
    })),
  ];
  const { error: pError } = await supabase
    .from("task_participants")
    .insert(participantRows as never);
  if (pError) {
    await supabase.from("tasks").delete().eq("id", id);
    return { ok: false, error: "save_failed" };
  }

  if (shareIds.length > 0) {
    await supabase.from("task_updates").insert({
      task_id: id,
      created_by_user_id: session.user.id,
      update_type: "system_shared",
      body: null,
    } as never);
    await notify(
      id,
      shareIds,
      session.user.id,
      session.organization.id,
      "task_shared",
      "shared",
      title,
      `task_shared:${id}`,
    );
  }

  revalidatePath(CONSOLE_PATH);
  return { ok: true, id };
}

// Shared completion: recurring tasks roll the same row forward to the next occurrence and stay
// open (Todoist-style); one-offs are stamped completed. Logs `completed` + notifies participants.
async function completeInternal(session: Session, task: TaskDetail) {
  const supabase = getSupabaseServiceClient();
  const nextInstance = nextRecurringInstance(task);
  const rolled = nextInstance ? shiftRecurringTaskDates(task, nextInstance) : null;
  if (rolled) {
    await supabase
      .from("tasks")
      .update({
        scheduled_date: rolled.scheduledDate,
        due_at: rolled.dueAt,
        recurrence_instance_date: rolled.recurrenceInstanceDate,
        status: "open",
        completed_at: null,
        completed_by_user_id: null,
      } as never)
      .eq("id", task.id)
      .eq("organization_id", session.organization.id);
  } else {
    await supabase
      .from("tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by_user_id: session.user.id,
      } as never)
      .eq("id", task.id)
      .eq("organization_id", session.organization.id);
  }
  await supabase.from("task_updates").insert({
    task_id: task.id,
    created_by_user_id: session.user.id,
    update_type: "completed",
  } as never);
  await notify(
    task.id,
    otherParticipantIds(task, session.user.id),
    session.user.id,
    session.organization.id,
    "task_completed",
    "completed",
    task.title,
    `task_completed:${task.id}:${Date.now()}`,
  );
}

// Shared reopen: recurring tasks roll back to the previous occurrence (they are never in a
// completed state); one-offs clear their completion stamps. Logs `reopened`, no notification.
async function reopenInternal(session: Session, task: TaskDetail) {
  const supabase = getSupabaseServiceClient();
  const prevInstance = previousRecurringInstance(task);
  const rewound = prevInstance ? shiftRecurringTaskDates(task, prevInstance) : null;
  if (rewound) {
    await supabase
      .from("tasks")
      .update({
        scheduled_date: rewound.scheduledDate,
        due_at: rewound.dueAt,
        recurrence_instance_date: rewound.recurrenceInstanceDate,
        status: "open",
        completed_at: null,
        completed_by_user_id: null,
      } as never)
      .eq("id", task.id)
      .eq("organization_id", session.organization.id);
  } else {
    await supabase
      .from("tasks")
      .update({
        status: "open",
        completed_at: null,
        completed_by_user_id: null,
      } as never)
      .eq("id", task.id)
      .eq("organization_id", session.organization.id);
  }
  await supabase.from("task_updates").insert({
    task_id: task.id,
    created_by_user_id: session.user.id,
    update_type: "reopened",
  } as never);
}

// ── 2. Status ───────────────────────────────────────────────────────────────
export async function setConsoleTaskStatus(
  taskId: string,
  status: "open" | "in_progress" | "completed",
): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;

  if (status === "completed") {
    await completeInternal(session, task);
    revalidatePath(CONSOLE_PATH);
    return { ok: true };
  }

  const supabase = getSupabaseServiceClient();
  await supabase
    .from("tasks")
    .update({
      status,
      completed_at: null,
      completed_by_user_id: null,
    } as never)
    .eq("id", task.id)
    .eq("organization_id", session.organization.id);
  await supabase.from("task_updates").insert({
    task_id: task.id,
    created_by_user_id: session.user.id,
    // Clearing a completed task back to open reads as a reopen; other transitions are status changes.
    update_type: task.status === "completed" && status === "open" ? "reopened" : "status_changed",
  } as never);
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 3. Toggle complete (checkbox) ──────────────────────────────────────────────
export async function toggleConsoleComplete(
  taskId: string,
  complete: boolean,
): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  if (complete) {
    await completeInternal(session, task);
  } else {
    await reopenInternal(session, task);
  }
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 4. Edit core (author only) ─────────────────────────────────────────────────
export async function updateConsoleTaskCore(input: {
  taskId: string;
  title: string;
  desc: string;
  date: string;
  time: string;
  durationMinutes: number | null;
  repeat: string;
  priority: string;
  tags: string[];
}): Promise<TaskActionResult> {
  const resolved = await resolveTask(input.taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  if (task.createdByUserId !== session.user.id) return { ok: false, error: "forbidden" };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "missing_title" };
  const description = input.desc.trim();
  const date = input.date.trim();
  const time = input.time.trim();
  const tags = input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10);

  if (taskTimeWithoutDate({ scheduledDate: "", dueDate: date, time })) {
    return { ok: false, error: "time_needs_date" };
  }
  const { scheduledDate: sched, dueAt, allDay, timeLabel } = normalizeTaskDateTime({
    scheduledDate: "",
    dueDate: date,
    time,
  });
  const finalDuration = timeLabel ? clampDuration(input.durationMinutes) : null;
  const nextRecurrenceRule = resolveRecurrenceRule(input.repeat, task.recurrenceRule);
  const anchorDate = taskAnchorDateInput({ scheduledDate: sched, dueAt });
  if (taskNeedsRecurrenceDate(nextRecurrenceRule, anchorDate)) {
    return { ok: false, error: "repeat_needs_date" };
  }

  const supabase = getSupabaseServiceClient();
  const update: Database["public"]["Tables"]["tasks"]["Update"] = {
    title,
    description: description || null,
    scheduled_date: sched,
    due_at: dueAt,
    all_day: allDay,
    time_label: timeLabel,
    duration_minutes: finalDuration,
    priority: PRIORITIES.has(input.priority) ? input.priority : "normal",
    recurrence_rule: nextRecurrenceRule,
    recurrence_series_id: task.recurrenceSeriesId ?? (nextRecurrenceRule ? task.id : null),
    recurrence_instance_date:
      task.recurrenceSeriesId || nextRecurrenceRule
        ? anchorDate ?? task.recurrenceInstanceDate ?? null
        : null,
    tags,
  };
  const { error } = await supabase
    .from("tasks")
    .update(update as never)
    .eq("id", task.id)
    .eq("organization_id", session.organization.id);
  if (error) return { ok: false, error: "save_failed" };
  await supabase.from("task_updates").insert({
    task_id: task.id,
    created_by_user_id: session.user.id,
    update_type: "system_edited",
  } as never);
  await notify(
    task.id,
    otherParticipantIds(task, session.user.id),
    session.user.id,
    session.organization.id,
    "task_updated",
    "edited",
    title,
    `task_edited:${task.id}:${Date.now()}`,
  );
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 5. Reschedule (participant) ────────────────────────────────────────────────
export async function rescheduleConsoleTask(
  taskId: string,
  input: { date: string; time: string; durationMinutes: number | null; repeat: string },
): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;

  const date = input.date.trim();
  const time = input.time.trim();
  // Empty date clears the schedule → the task returns to the no-date Inbox (Todoist "remove date").
  // Without an anchor a recurrence rule is meaningless, so it is cleared too.
  if (!date) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("tasks")
      .update({
        due_at: null,
        scheduled_date: null,
        all_day: true,
        time_label: null,
        duration_minutes: null,
        is_inbox: true,
        recurrence_rule: null,
        recurrence_series_id: null,
        recurrence_instance_date: null,
      } as never)
      .eq("id", task.id)
      .eq("organization_id", session.organization.id);
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath(CONSOLE_PATH);
    return { ok: true };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "invalid_date" };

  const { dueAt, allDay, timeLabel } = normalizeTaskDateTime({
    scheduledDate: "",
    dueDate: date,
    time,
  });
  const finalDuration = timeLabel ? clampDuration(input.durationMinutes) : null;
  const nextRecurrenceRule = resolveRecurrenceRule(input.repeat, task.recurrenceRule);

  const supabase = getSupabaseServiceClient();
  const update: Database["public"]["Tables"]["tasks"]["Update"] = {
    due_at: dueAt,
    all_day: allDay,
    time_label: timeLabel,
    duration_minutes: finalDuration,
    scheduled_date: null,
    is_inbox: false,
    recurrence_rule: nextRecurrenceRule,
    recurrence_series_id: task.recurrenceSeriesId ?? (nextRecurrenceRule ? task.id : null),
    recurrence_instance_date: task.recurrenceSeriesId || nextRecurrenceRule ? date : null,
  };
  const { error } = await supabase
    .from("tasks")
    .update(update as never)
    .eq("id", task.id)
    .eq("organization_id", session.organization.id);
  if (error) return { ok: false, error: "save_failed" };
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 6. Share / assign as directive (author only) ──────────────────────────────
export async function shareConsoleTask(
  taskId: string,
  userIds: string[],
  asDirective: boolean,
): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  if (task.createdByUserId !== session.user.id) return { ok: false, error: "forbidden" };
  // Project tasks are governed by project membership, not per-task sharing.
  if (task.projectId) return { ok: false, error: "forbidden" };

  const allowed = new Set((await getShareableUsers(session)).map((u) => u.id));
  const existing = new Set(task.participants.map((p) => p.userId));
  const newIds = Array.from(new Set(userIds)).filter(
    (uid) => uid !== session.user.id && allowed.has(uid) && !existing.has(uid),
  );

  const supabase = getSupabaseServiceClient();
  if (newIds.length > 0) {
    const hadFirst = task.participants.some((p) => p.isFirstRecipient);
    const rows: Database["public"]["Tables"]["task_participants"]["Insert"][] = newIds.map(
      (uid, index) => ({
        task_id: task.id,
        user_id: uid,
        role: "participant",
        is_first_recipient: !hadFirst && index === 0,
        added_by_user_id: session.user.id,
      }),
    );
    const { error: pError } = await supabase.from("task_participants").insert(rows as never);
    if (pError) return { ok: false, error: "save_failed" };
    await supabase.from("task_updates").insert({
      task_id: task.id,
      created_by_user_id: session.user.id,
      update_type: "system_shared",
    } as never);
  }

  const nonAuthorCount =
    task.participants.filter((p) => p.role !== "author").length + newIds.length;
  const isShared = nonAuthorCount > 0;
  await supabase
    .from("tasks")
    .update({ is_shared: isShared, is_directive: asDirective && isShared } as never)
    .eq("id", task.id)
    .eq("organization_id", session.organization.id);

  if (newIds.length > 0) {
    await notify(
      task.id,
      newIds,
      session.user.id,
      session.organization.id,
      "task_shared",
      "shared",
      task.title,
      `task_shared:${task.id}`,
    );
  }
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 7. Add note (participant) ──────────────────────────────────────────────────
export async function addConsoleNote(taskId: string, body: string): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, error: "empty" };

  const supabase = getSupabaseServiceClient();
  await supabase.from("task_updates").insert({
    task_id: task.id,
    created_by_user_id: session.user.id,
    update_type: "note",
    body: text,
    image_urls: [],
  } as never);
  await notify(
    task.id,
    otherParticipantIds(task, session.user.id),
    session.user.id,
    session.organization.id,
    "task_updated",
    "note",
    task.title,
    `task_note:${task.id}:${Date.now()}`,
  );
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 8. Delete (author) / leave (participant) ───────────────────────────────────
export async function deleteConsoleTask(taskId: string): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  if (task.createdByUserId !== session.user.id) return { ok: false, error: "forbidden" };
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", task.id)
    .eq("organization_id", session.organization.id);
  if (error) return { ok: false, error: "delete_failed" };
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

export async function leaveConsoleTask(taskId: string): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  const supabase = getSupabaseServiceClient();

  // Author leaving = full deletion for everyone (mirrors mobile removeTaskParticipant self path).
  if (task.createdByUserId === session.user.id) {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id)
      .eq("organization_id", session.organization.id);
    if (error) return { ok: false, error: "delete_failed" };
    revalidatePath(CONSOLE_PATH);
    return { ok: true };
  }

  await supabase
    .from("task_participants")
    .delete()
    .eq("task_id", task.id)
    .eq("user_id", session.user.id);
  // If no non-author participants remain, the task returns to private (and non-directive).
  const remainingNonAuthor = task.participants.filter(
    (p) => p.role !== "author" && p.userId !== session.user.id,
  ).length;
  if (remainingNonAuthor === 0) {
    await supabase
      .from("tasks")
      .update({ is_shared: false, is_directive: false } as never)
      .eq("id", task.id)
      .eq("organization_id", session.organization.id);
  }
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 9. Move to today / inbox (participant) ─────────────────────────────────────
export async function moveConsoleToToday(taskId: string): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  const today = tokyoToday();
  const supabase = getSupabaseServiceClient();
  // Anchor to the Tokyo operating date via due_at, preserving any time-of-day; pull out of Inbox.
  const dueAt = new Date(`${today}T${task.timeLabel ?? "00:00"}:00+09:00`).toISOString();
  const update: Database["public"]["Tables"]["tasks"]["Update"] = {
    due_at: dueAt,
    all_day: !task.timeLabel,
    scheduled_date: null,
    is_inbox: false,
  };
  if (task.recurrenceSeriesId) update.recurrence_instance_date = today;
  const { error } = await supabase
    .from("tasks")
    .update(update as never)
    .eq("id", task.id)
    .eq("organization_id", session.organization.id);
  if (error) return { ok: false, error: "save_failed" };
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

export async function moveConsoleToInbox(taskId: string): Promise<TaskActionResult> {
  const resolved = await resolveTask(taskId);
  if (!resolved) return { ok: false, error: "not_found" };
  const { session, task } = resolved;
  const supabase = getSupabaseServiceClient();
  // 관리함 = "프로젝트 밖 모든 작업"(Todoist Inbox 모델). 따라서 관리함으로 이동 = 프로젝트에서
  // 빼는 것(날짜/시간/반복은 유지). 비프로젝트 작업이면 사실상 no-op.
  const { error } = await supabase
    .from("tasks")
    .update({ is_inbox: true, project_id: null, section_id: null } as never)
    .eq("id", task.id)
    .eq("organization_id", session.organization.id);
  if (error) return { ok: false, error: "save_failed" };
  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}

// ── 10. Create project ─────────────────────────────────────────────────────────
export async function createConsoleProject(
  title: string,
  memberIds: string[],
): Promise<TaskActionResult> {
  const session = await resolveSession();
  if (!session) return { ok: false, error: "auth" };
  const name = String(title ?? "").trim();
  if (!name) return { ok: false, error: "missing_title" };

  const allowed = new Set((await getShareableUsers(session)).map((u) => u.id));
  const inviteIds = Array.from(new Set(memberIds ?? [])).filter(
    (uid) => uid !== session.user.id && allowed.has(uid),
  );

  const id = crypto.randomUUID();
  const supabase = getSupabaseServiceClient();
  const insert: Database["public"]["Tables"]["projects"]["Insert"] = {
    id,
    organization_id: session.organization.id,
    created_by_user_id: session.user.id,
    title: name,
    description: null,
    is_shared: inviteIds.length > 0,
  };
  const { error } = await supabase.from("projects").insert(insert as never);
  if (error) return { ok: false, error: "save_failed" };

  const participantRows: Database["public"]["Tables"]["project_participants"]["Insert"][] = [
    {
      project_id: id,
      user_id: session.user.id,
      role: "owner",
      is_first_recipient: false,
      added_by_user_id: null,
    },
    ...inviteIds.map((uid, index) => ({
      project_id: id,
      user_id: uid,
      role: "member",
      is_first_recipient: index === 0,
      added_by_user_id: session.user.id,
    })),
  ];
  const { error: pError } = await supabase
    .from("project_participants")
    .insert(participantRows as never);
  if (pError) {
    await supabase.from("projects").delete().eq("id", id);
    return { ok: false, error: "save_failed" };
  }

  if (inviteIds.length > 0) {
    await notifyProjectMembers(supabase, {
      organizationId: session.organization.id,
      projectId: id,
      recipientUserIds: inviteIds,
      actorUserId: session.user.id,
      dedupeBase: `project_shared:${id}`,
      payload: { projectId: id, projectTitle: name, actorUserId: session.user.id, event: "shared" },
    });
  }

  revalidatePath(CONSOLE_PATH);
  return { ok: true, id };
}

// ── 11. Daily report (delegate to the shared staff-only generator) ─────────────
export async function generateConsoleReport(date: string): Promise<DailyReportResult> {
  return generateDailyReport(date);
}

// ── 12. Load full task detail (updates + resolved context) for the right panel ─────────────
// getTaskDetail is RLS-scoped, so a non-null result already proves the viewer participates.
export type ConsoleTaskDetailResult =
  | { ok: true; task: TaskDetail }
  | { ok: false; error: string };

export async function getConsoleTaskDetail(taskId: string): Promise<ConsoleTaskDetailResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };
  const task = await getTaskDetail(session, taskId);
  if (!task) return { ok: false, error: "not_found" };
  return { ok: true, task };
}

// ── 13. Load a project's sections + tasks for the console project view ─────────
// getProjectDetail is RLS-scoped, so a non-null result proves the viewer is a project member.
export type ConsoleProjectDetailResult =
  | { ok: true; project: ProjectDetailData }
  | { ok: false; error: string };

export async function getConsoleProjectDetail(
  projectId: string,
): Promise<ConsoleProjectDetailResult> {
  const session = await resolveSession();
  if (!session) return { ok: false, error: "auth" };
  const id = String(projectId ?? "").trim();
  if (!id) return { ok: false, error: "not_found" };
  const project = await getProjectDetail(session, id);
  if (!project) return { ok: false, error: "not_found" };
  return { ok: true, project };
}
