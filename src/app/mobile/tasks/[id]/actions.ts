"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyTaskParticipants } from "@/lib/notifications/create";
import type { TaskNotificationPayload } from "@/lib/notifications/types";
import {
  getShareableUsers,
  getTaskDetail,
  normalizeTaskDateTime,
  resolveRecurrenceRule,
  taskTimeWithoutDate,
  type TaskDetail,
} from "@/lib/tasks";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type Session = NonNullable<Awaited<ReturnType<typeof getCurrentAppSession>>>;

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}
const PRIORITIES = new Set(["normal", "important", "urgent"]);

const REQUEST_IMAGE_BUCKET = "request-images";

const detailPath = (id: string, error?: string) =>
  `/mobile/tasks/${id}${error ? `?error=${error}` : ""}`;

// Extract the Storage object path from a request-images public URL.
// Returns null for URLs that are not public objects in the expected bucket/host.
function extractRequestImagePath(publicUrl: string): string | null {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!baseUrl) return null;
    const url = new URL(publicUrl);
    const supabaseUrl = new URL(baseUrl);
    const prefix = `/storage/v1/object/public/${REQUEST_IMAGE_BUCKET}/`;
    if (
      url.protocol !== "https:" ||
      url.hostname !== supabaseUrl.hostname ||
      !url.pathname.startsWith(prefix)
    ) {
      return null;
    }
    const encoded = url.pathname.slice(prefix.length);
    if (!encoded) return null;
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

// Hard-delete task-level photos that the author detached during a core edit.
// Defensive boundaries: candidates come only from server-truth previous URLs
// (never arbitrary client input), and each must resolve to a path under
// `${organizationId}/task-images/` before it is eligible for removal.
async function cleanupRemovedTaskImages(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  removedUrls: string[],
  organizationId: string,
) {
  if (removedUrls.length === 0) return;
  const expectedPrefix = `${organizationId}/task-images/`;
  const paths = removedUrls
    .map((u) => extractRequestImagePath(u))
    .filter((p): p is string => !!p && p.startsWith(expectedPrefix));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(REQUEST_IMAGE_BUCKET).remove(paths);
  if (error) {
    // Non-fatal: the DB reference is already detached; a stray file is the worst case.
    console.error("[cleanupRemovedTaskImages] storage remove failed:", error.message);
  }
}

// getTaskDetail uses the RLS-scoped client, so a non-null result already proves the
// acting user is a participant. Author actions additionally check authorship.
async function requireSessionAndTask(taskId: string): Promise<{
  session: Session;
  task: TaskDetail;
}> {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }
  const task = await getTaskDetail(session, taskId);
  if (!task) {
    redirect("/mobile/tasks");
  }
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
  type: "task_shared" | "task_updated",
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

export async function updateTaskCore(formData: FormData) {
  const id = cleanText(formData.get("taskId"));
  const { session, task } = await requireSessionAndTask(id);
  if (task.createdByUserId !== session.user.id) {
    redirect(detailPath(id, "forbidden"));
  }

  const title = cleanText(formData.get("title"));
  if (!title) {
    redirect(detailPath(id, "missing_title"));
  }
  const description = cleanText(formData.get("description"));
  const scheduledDate = cleanText(formData.get("scheduledDate"));
  const dueDate = cleanText(formData.get("dueDate"));
  const time = cleanText(formData.get("time"));
  const priorityRaw = cleanText(formData.get("priority"));
  const repeatRaw = cleanText(formData.get("repeat"));
  const tags = parseStringArray(cleanText(formData.get("tagsJson")))
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v))
    .filter((u) => u.startsWith("https://") || u.startsWith("http://"))
    .slice(0, 5);
  const ctxPropertyId = cleanText(formData.get("ctxPropertyId")) || null;
  const ctxRoomId = cleanText(formData.get("ctxRoomId")) || null;
  const ctxReservationId = cleanText(formData.get("ctxReservationId")) || null;
  const ctxGuestName = cleanText(formData.get("ctxGuestName")) || null;
  // A specific time needs a date anchor — reject rather than silently drop it (back to edit).
  if (taskTimeWithoutDate({ scheduledDate, dueDate, time })) {
    redirect(`/mobile/tasks/${id}/edit?error=time_needs_date`);
  }
  // One shared rule for date/time persistence (see lib/tasks normalizeTaskDateTime) — keeps
  // create and edit identical: toggling all-day clears time cleanly, no stale time_label/due_at.
  const { scheduledDate: sched, dueAt, allDay, timeLabel } = normalizeTaskDateTime({
    scheduledDate,
    dueDate,
    time,
  });

  const supabase = getSupabaseServiceClient();
  const update: Database["public"]["Tables"]["tasks"]["Update"] = {
    title,
    description: description || null,
    scheduled_date: sched,
    due_at: dueAt,
    all_day: allDay,
    time_label: timeLabel,
    priority: PRIORITIES.has(priorityRaw) ? priorityRaw : "normal",
    // `custom` is kept only if this task already had it; non-custom tasks can't become custom.
    recurrence_rule: resolveRecurrenceRule(repeatRaw, task.recurrenceRule),
    tags,
    image_urls: imageUrls,
    property_id: ctxPropertyId,
    room_id: ctxRoomId,
    reservation_id: ctxReservationId,
    guest_name: ctxGuestName,
  };
  // Files the author detached in this edit (server-truth previous set minus the new set).
  const removedImageUrls = task.imageUrls.filter((u) => !imageUrls.includes(u));
  const { error } = await supabase.from("tasks").update(update as never).eq("id", id);
  if (error) {
    redirect(detailPath(id, "save_failed"));
  }
  // Only after the DB no longer references them, hard-delete the detached files.
  await cleanupRemovedTaskImages(supabase, removedImageUrls, session.organization.id);
  await supabase.from("task_updates").insert({
    task_id: id,
    created_by_user_id: session.user.id,
    update_type: "system_edited",
  } as never);
  await notify(
    id,
    otherParticipantIds(task, session.user.id),
    session.user.id,
    session.organization.id,
    "task_updated",
    "edited",
    title,
    `task_edited:${id}:${Date.now()}`,
  );
  redirect(detailPath(id));
}

async function setInbox(formData: FormData, isInbox: boolean) {
  const id = cleanText(formData.get("taskId"));
  await requireSessionAndTask(id);
  const supabase = getSupabaseServiceClient();
  await supabase.from("tasks").update({ is_inbox: isInbox } as never).eq("id", id);
  redirect(detailPath(id));
}
export async function moveTaskToInbox(formData: FormData) {
  await setInbox(formData, true);
}
export async function moveTaskOutOfInbox(formData: FormData) {
  await setInbox(formData, false);
}

// Allowed list views for the swipe-action return redirect (keeps the user on the tab they swiped
// from). Mirrors the page's VIEWS allow-list.
const LIST_VIEWS = new Set(["today", "tomorrow", "inbox", "sent", "calendar"]);
function listPathForView(formData: FormData): string {
  const view = cleanText(formData.get("view"));
  return LIST_VIEWS.has(view) ? `/mobile/tasks?view=${view}` : "/mobile/tasks";
}

// Shift a Tokyo YYYY-MM-DD by n days, returning the same format.
function ymdShift(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// "To today" swipe action: schedule the task for the Tokyo operating date and pull it
// out of Inbox. Returns to the originating tab so the card moves into Today.
export async function moveTaskToToday(formData: FormData) {
  const id = cleanText(formData.get("taskId"));
  await requireSessionAndTask(id);
  const today = (await import("@/lib/tasks")).tokyoToday();
  const supabase = getSupabaseServiceClient();
  await supabase
    .from("tasks")
    .update({ scheduled_date: today, is_inbox: false } as never)
    .eq("id", id);
  redirect(listPathForView(formData));
}

// "To tomorrow" swipe action (Today tab): defer the task to the Tokyo next operating date and pull
// it out of Inbox. Returns to the originating tab so the card moves into Tomorrow.
export async function moveTaskToTomorrow(formData: FormData) {
  const id = cleanText(formData.get("taskId"));
  await requireSessionAndTask(id);
  const today = (await import("@/lib/tasks")).tokyoToday();
  const tomorrow = ymdShift(today, 1);
  const supabase = getSupabaseServiceClient();
  await supabase
    .from("tasks")
    .update({ scheduled_date: tomorrow, is_inbox: false } as never)
    .eq("id", id);
  redirect(listPathForView(formData));
}

export async function shareTaskWithUsers(formData: FormData) {
  const id = cleanText(formData.get("taskId"));
  const { session, task } = await requireSessionAndTask(id);
  const requested = parseStringArray(cleanText(formData.get("shareJson")));
  const allowed = new Set((await getShareableUsers(session)).map((u) => u.id));
  const existing = new Set(task.participants.map((p) => p.userId));
  const newIds = Array.from(new Set(requested)).filter(
    (uid) => uid !== session.user.id && allowed.has(uid) && !existing.has(uid),
  );
  if (newIds.length === 0) {
    redirect(detailPath(id));
  }
  const supabase = getSupabaseServiceClient();
  const hadFirst = task.participants.some((p) => p.isFirstRecipient);
  const rows: Database["public"]["Tables"]["task_participants"]["Insert"][] = newIds.map(
    (uid, index) => ({
      task_id: id,
      user_id: uid,
      role: "participant",
      is_first_recipient: !hadFirst && index === 0,
      added_by_user_id: session.user.id,
    }),
  );
  // Fail-safe: if the participant rows do not land, do NOT mark the task shared,
  // do NOT write the system_shared log, and do NOT emit notifications — otherwise
  // the task would show a false shared state for a share that never happened.
  const { error: pError } = await supabase.from("task_participants").insert(rows as never);
  if (pError) {
    redirect(detailPath(id, "save_failed"));
  }
  await supabase.from("tasks").update({ is_shared: true } as never).eq("id", id);
  await supabase.from("task_updates").insert({
    task_id: id,
    created_by_user_id: session.user.id,
    update_type: "system_shared",
  } as never);
  await notify(
    id,
    newIds,
    session.user.id,
    session.organization.id,
    "task_shared",
    "shared",
    task.title,
    `task_shared:${id}`,
  );
  redirect(detailPath(id));
}

export async function removeTaskParticipant(formData: FormData) {
  const id = cleanText(formData.get("taskId"));
  const targetUserId = cleanText(formData.get("userId"));
  const { session, task } = await requireSessionAndTask(id);
  const isAuthor = task.createdByUserId === session.user.id;
  const removingSelf = targetUserId === session.user.id;
  const supabase = getSupabaseServiceClient();

  // Author leaving = full task deletion for everyone.
  if (isAuthor && removingSelf) {
    await supabase.from("tasks").delete().eq("id", id);
    redirect("/mobile/tasks");
  }

  // Only the author may remove others; anyone may remove themselves.
  if (!removingSelf && !isAuthor) {
    redirect(detailPath(id, "forbidden"));
  }
  // Never remove the author via this path (author leaves only via self-delete above).
  if (targetUserId === task.createdByUserId) {
    redirect(detailPath(id, "forbidden"));
  }

  await supabase
    .from("task_participants")
    .delete()
    .eq("task_id", id)
    .eq("user_id", targetUserId);

  // If no non-author participants remain, the task returns to private.
  const remainingNonAuthor = task.participants.filter(
    (p) => p.role !== "author" && p.userId !== targetUserId,
  ).length;
  if (remainingNonAuthor === 0) {
    await supabase.from("tasks").update({ is_shared: false } as never).eq("id", id);
  }

  // A participant who removed themselves no longer sees the task.
  if (removingSelf) {
    redirect("/mobile/tasks");
  }
  redirect(detailPath(id));
}

export async function deleteTask(formData: FormData) {
  const id = cleanText(formData.get("taskId"));
  const { session, task } = await requireSessionAndTask(id);
  if (task.createdByUserId !== session.user.id) {
    redirect(detailPath(id, "forbidden"));
  }
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) {
    redirect(detailPath(id, "delete_failed"));
  }
  redirect("/mobile/tasks");
}

// Batch delete from the list (multi-select). Only deletes tasks the acting user authored —
// the `created_by_user_id` filter is the authorization boundary, so selecting tasks shared to
// you (that you don't own) simply leaves them untouched. Stays on the list (revalidates).
export async function deleteTasksInList(taskIds: string[]) {
  const ids = Array.from(
    new Set((taskIds ?? []).map((s) => String(s).trim()).filter(Boolean)),
  ).slice(0, 200);
  if (ids.length === 0) return;
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }
  const supabase = getSupabaseServiceClient();
  await supabase
    .from("tasks")
    .delete()
    .in("id", ids)
    .eq("created_by_user_id", session.user.id);
  revalidatePath("/mobile/tasks");
}

// Persist a manual drag-reorder of the Today view. `orderedIds` is the section's task ids in their
// new top-to-bottom order; each row's sort_order is set to its index (0..n). Org-scoped, so a user
// can only reorder tasks inside their own organization. sort_order is global to the task (not
// per-user) — see the migration note. Stays on the list (revalidates); the optimistic client order
// already reflects the change.
export async function reorderTasks(orderedIds: string[]) {
  const ids = Array.from(
    new Set((orderedIds ?? []).map((s) => String(s).trim()).filter(Boolean)),
  ).slice(0, 500);
  if (ids.length === 0) return;
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }
  const supabase = getSupabaseServiceClient();
  await Promise.all(
    ids.map((id, index) =>
      supabase
        .from("tasks")
        .update({ sort_order: index } as never)
        .eq("id", id)
        .eq("organization_id", session.organization.id),
    ),
  );
  revalidatePath("/mobile/tasks");
}

export async function addTaskUpdate(formData: FormData) {
  const id = cleanText(formData.get("taskId"));
  const { session, task } = await requireSessionAndTask(id);
  const body = cleanText(formData.get("body"));
  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v))
    .filter((u) => u.startsWith("https://") || u.startsWith("http://"))
    .slice(0, 5);
  if (!body && imageUrls.length === 0) {
    redirect(detailPath(id));
  }
  const supabase = getSupabaseServiceClient();
  await supabase.from("task_updates").insert({
    task_id: id,
    created_by_user_id: session.user.id,
    update_type: "note",
    body: body || null,
    image_urls: imageUrls,
  } as never);
  await notify(
    id,
    otherParticipantIds(task, session.user.id),
    session.user.id,
    session.organization.id,
    "task_updated",
    "note",
    task.title,
    `task_note:${id}:${Date.now()}`,
  );
  redirect(detailPath(id));
}
