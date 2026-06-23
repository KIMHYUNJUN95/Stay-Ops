"use server";

import { redirect } from "next/navigation";
import { notifyTaskParticipants } from "@/lib/notifications/create";
import { getProjectDetail } from "@/lib/projects";
import {
  getShareableUsers,
  taskAnchorDateInput,
  taskNeedsRecurrenceDate,
  normalizeTaskDateTime,
  resolveRecurrenceRule,
  taskTimeWithoutDate,
} from "@/lib/tasks";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

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

export async function quickCreateTask(formData: FormData) {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const title = cleanText(formData.get("title"));
  if (!title) {
    redirect("/mobile/tasks?view=inbox&error=missing_title");
  }

  const id = crypto.randomUUID();
  const supabase = getSupabaseServiceClient();

  const insert: Database["public"]["Tables"]["tasks"]["Insert"] = {
    id,
    organization_id: session.organization.id,
    created_by_user_id: session.user.id,
    title,
    is_inbox: true,
    is_shared: false,
  };
  const { error } = await supabase.from("tasks").insert(insert as never);
  if (error) {
    redirect("/mobile/tasks?view=inbox&error=save_failed");
  }
  const { error: pError } = await supabase.from("task_participants").insert({
    task_id: id,
    user_id: session.user.id,
    role: "author",
  } as never);
  if (pError) {
    await supabase.from("tasks").delete().eq("id", id);
    redirect("/mobile/tasks?view=inbox&error=save_failed");
  }

  redirect("/mobile/tasks?view=inbox&created=1");
}

// Quick-create with today's Tokyo date as scheduled_date — appears in the Today tab immediately.
export async function quickCreateTodayTask(formData: FormData) {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const title = cleanText(formData.get("title"));
  if (!title) {
    redirect("/mobile/tasks?view=today&error=missing_title");
  }

  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const id = crypto.randomUUID();
  const supabase = getSupabaseServiceClient();

  const insert: Database["public"]["Tables"]["tasks"]["Insert"] = {
    id,
    organization_id: session.organization.id,
    created_by_user_id: session.user.id,
    title,
    scheduled_date: todayYmd,
    is_inbox: false,
    is_shared: false,
  };
  const { error } = await supabase.from("tasks").insert(insert as never);
  if (error) {
    redirect("/mobile/tasks?view=today&error=save_failed");
  }
  const { error: pError } = await supabase.from("task_participants").insert({
    task_id: id,
    user_id: session.user.id,
    role: "author",
  } as never);
  if (pError) {
    await supabase.from("tasks").delete().eq("id", id);
    redirect("/mobile/tasks?view=today&error=save_failed");
  }

  redirect("/mobile/tasks?view=today&created=1");
}

// Quick-create with tomorrow's Tokyo date as scheduled_date — appears in the Tomorrow tab immediately.
export async function quickCreateTomorrowTask(formData: FormData) {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const title = cleanText(formData.get("title"));
  if (!title) {
    redirect("/mobile/tasks?view=tomorrow&error=missing_title");
  }

  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const tomorrowYmd = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  const supabase = getSupabaseServiceClient();

  const insert: Database["public"]["Tables"]["tasks"]["Insert"] = {
    id,
    organization_id: session.organization.id,
    created_by_user_id: session.user.id,
    title,
    scheduled_date: tomorrowYmd,
    is_inbox: false,
    is_shared: false,
  };
  const { error } = await supabase.from("tasks").insert(insert as never);
  if (error) {
    redirect("/mobile/tasks?view=tomorrow&error=save_failed");
  }
  const { error: pError } = await supabase.from("task_participants").insert({
    task_id: id,
    user_id: session.user.id,
    role: "author",
  } as never);
  if (pError) {
    await supabase.from("tasks").delete().eq("id", id);
    redirect("/mobile/tasks?view=tomorrow&error=save_failed");
  }

  redirect("/mobile/tasks?view=tomorrow&created=1");
}

export async function createTask(formData: FormData) {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const title = cleanText(formData.get("title"));
  if (!title) {
    redirect("/mobile/tasks/new?error=missing_title");
  }

  const description = cleanText(formData.get("description"));
  const scheduledDate = cleanText(formData.get("scheduledDate"));
  const dueDate = cleanText(formData.get("dueDate"));
  const time = cleanText(formData.get("time"));
  const priorityRaw = cleanText(formData.get("priority"));
  const repeatRaw = cleanText(formData.get("repeat"));
  const priority = PRIORITIES.has(priorityRaw) ? priorityRaw : "normal";
  // Create has no previous rule, so `custom` can never be newly assigned (→ null).
  const repeat = resolveRecurrenceRule(repeatRaw, null);
  const tags = parseStringArray(cleanText(formData.get("tagsJson")))
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  const requestedShare = parseStringArray(cleanText(formData.get("shareJson")));
  // Upper safety bound (20); the real per-task cap (5 regular / 20 project) is applied at insert.
  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v))
    .filter((u) => u.startsWith("https://") || u.startsWith("http://"))
    .slice(0, 20);
  const ctxPropertyId = cleanText(formData.get("ctxPropertyId")) || null;
  const ctxRoomId = cleanText(formData.get("ctxRoomId")) || null;
  const ctxReservationId = cleanText(formData.get("ctxReservationId")) || null;
  const ctxGuestName = cleanText(formData.get("ctxGuestName")) || null;

  // A specific time needs a date anchor — reject rather than silently drop it.
  if (taskTimeWithoutDate({ scheduledDate, dueDate, time })) {
    redirect("/mobile/tasks/new?error=time_needs_date");
  }
  // One shared rule for date/time persistence (see lib/tasks normalizeTaskDateTime).
  const { scheduledDate: sched, dueAt, allDay, timeLabel } = normalizeTaskDateTime({
    scheduledDate,
    dueDate,
    time,
  });
  const anchorDate = taskAnchorDateInput({ scheduledDate: sched, dueAt });
  if (taskNeedsRecurrenceDate(repeat, anchorDate)) {
    redirect("/mobile/tasks/new?error=repeat_needs_date");
  }

  // Project-task linkage (optional). When present the task belongs to a project: validate the
  // viewer is a participant (RLS-scoped read proves it) and that the section belongs to the project.
  // Project tasks are never per-task shared — sharing is governed by project membership.
  const projectIdRaw = cleanText(formData.get("projectId")) || null;
  const sectionIdRaw = cleanText(formData.get("sectionId")) || null;
  let linkedProjectId: string | null = null;
  let linkedSectionId: string | null = null;
  if (projectIdRaw) {
    const project = await getProjectDetail(session, projectIdRaw);
    if (!project) {
      redirect("/mobile/tasks?view=projects");
    }
    linkedProjectId = projectIdRaw;
    linkedSectionId =
      sectionIdRaw && project.sections.some((s) => s.id === sectionIdRaw) ? sectionIdRaw : null;
  }

  // Validate share recipients against the org's active members (fail closed); never for project tasks.
  let shareIds: string[] = [];
  if (!linkedProjectId && requestedShare.length > 0) {
    const allowed = new Set((await getShareableUsers(session)).map((u) => u.id));
    shareIds = Array.from(new Set(requestedShare)).filter(
      (uid) => uid !== session.user.id && allowed.has(uid),
    );
  }

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
    priority,
    status: "open",
    is_inbox: false,
    is_shared: shareIds.length > 0,
    recurrence_rule: repeat,
    recurrence_series_id: recurrenceSeriesId,
    recurrence_instance_date: recurrenceSeriesId ? anchorDate : null,
    tags,
    // Project tasks allow up to 20 photos; regular tasks keep the standard 5.
    image_urls: imageUrls.slice(0, linkedProjectId ? 20 : 5),
    property_id: ctxPropertyId,
    room_id: ctxRoomId,
    reservation_id: ctxReservationId,
    guest_name: ctxGuestName,
    project_id: linkedProjectId,
    section_id: linkedSectionId,
  };
  const { error } = await supabase.from("tasks").insert(insert as never);
  if (error) {
    redirect("/mobile/tasks/new?error=save_failed");
  }

  // The author row MUST carry the same keys as the participant rows below. PostgREST builds one
  // multi-row INSERT from the union of keys across the array and fills any key a row omits with
  // NULL — bypassing the column default — so an author row missing `is_first_recipient` would write
  // NULL and violate its NOT NULL constraint whenever a share is included. Keep the shapes uniform.
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
  const { error: pError } = await supabase.from("task_participants").insert(participantRows as never);
  if (pError) {
    await supabase.from("tasks").delete().eq("id", id);
    redirect("/mobile/tasks/new?error=save_failed");
  }

  if (shareIds.length > 0) {
    await supabase.from("task_updates").insert({
      task_id: id,
      created_by_user_id: session.user.id,
      update_type: "system_shared",
      body: null,
    } as never);
    await notifyTaskParticipants(supabase, {
      organizationId: session.organization.id,
      taskId: id,
      recipientUserIds: shareIds,
      actorUserId: session.user.id,
      type: "task_shared",
      dedupeBase: `task_shared:${id}`,
      payload: { taskId: id, taskTitle: title, actorUserId: session.user.id, event: "shared" },
    });
  }

  // Project tasks return to the project detail; regular tasks open the new task.
  if (linkedProjectId) {
    redirect(`/mobile/tasks/projects/${linkedProjectId}`);
  }
  redirect(`/mobile/tasks/${id}?created=1`);
}
