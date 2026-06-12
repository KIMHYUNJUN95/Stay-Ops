"use server";

import { redirect } from "next/navigation";
import { notifyTaskParticipants } from "@/lib/notifications/create";
import {
  getShareableUsers,
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
    redirect("/admin");
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
    redirect("/admin");
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

export async function createTask(formData: FormData) {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
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
  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v))
    .filter((u) => u.startsWith("https://") || u.startsWith("http://"))
    .slice(0, 5);

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

  // Validate share recipients against the org's active members (fail closed).
  let shareIds: string[] = [];
  if (requestedShare.length > 0) {
    const allowed = new Set((await getShareableUsers(session)).map((u) => u.id));
    shareIds = Array.from(new Set(requestedShare)).filter(
      (uid) => uid !== session.user.id && allowed.has(uid),
    );
  }

  const id = crypto.randomUUID();
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
    tags,
    image_urls: imageUrls,
  };
  const { error } = await supabase.from("tasks").insert(insert as never);
  if (error) {
    redirect("/mobile/tasks/new?error=save_failed");
  }

  const participantRows: Database["public"]["Tables"]["task_participants"]["Insert"][] = [
    { task_id: id, user_id: session.user.id, role: "author" },
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

  redirect(`/mobile/tasks/${id}?created=1`);
}
