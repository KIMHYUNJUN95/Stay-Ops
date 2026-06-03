"use server";

import { redirect } from "next/navigation";
import {
  canAccessMobileCleaning,
  getCleaningOperatingDateKey,
  isCleaningTaskKey,
  type CleaningSessionRow,
} from "@/lib/cleaning";
import { getActiveRoomCatalog } from "@/lib/rooms";
import { getCurrentAppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const cleaningPath = "/mobile/cleaning";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function redirectWithError(error: string): never {
  redirect(`${cleaningPath}?error=${encodeURIComponent(error)}`);
}

export async function startCleaningSession(formData: FormData) {
  const session = await getCurrentAppSession();

  if (!session) {
    redirect("/auth/login?next=/mobile/cleaning");
  }

  if (!canAccessMobileCleaning(session.user.role)) {
    redirectWithError("not_allowed");
  }

  const roomLabel = cleanText(formData.get("roomLabel"));
  const taskKey = cleanText(formData.get("taskKey"));

  if (roomLabel.length === 0 || roomLabel.length > 100 || !isCleaningTaskKey(taskKey)) {
    redirectWithError("invalid_selection");
  }

  const supabase = await getSupabaseServerClient();

  const catalog = await getActiveRoomCatalog(session.organization.id, supabase).catch(() => undefined);
  if (catalog !== undefined) {
    const allowed = new Set(
      catalog.map((item) =>
        item.canonicalRoomLabel === item.propertyName
          ? item.propertyName
          : `${item.propertyName} ${item.canonicalRoomLabel}`,
      ),
    );
    if (!allowed.has(roomLabel)) {
      redirectWithError("invalid_selection");
    }
  }

  // Block re-starting a room that already has an in_progress or completed session today
  const { data: existingForRoom } = await supabase
    .from("cleaning_sessions")
    .select("id")
    .eq("organization_id", session.organization.id)
    .eq("cleaning_date", getCleaningOperatingDateKey())
    .eq("room_label", roomLabel)
    .in("status", ["in_progress", "completed"])
    .limit(1);

  if (existingForRoom && existingForRoom.length > 0) {
    redirectWithError("already_processed_today");
  }

  const insert: Database["public"]["Tables"]["cleaning_sessions"]["Insert"] = {
    cleaning_date: getCleaningOperatingDateKey(),
    organization_id: session.organization.id,
    room_label: roomLabel,
    staff_user_id: session.user.id,
    task_label: taskKey,
  };

  const { error } = await supabase
    .from("cleaning_sessions")
    .insert(insert as never);

  if (error) {
    redirectWithError(error.code === "23505" ? "already_active" : "start_failed");
  }

  redirect(`${cleaningPath}?started=1`);
}

export async function cancelCleaningSession(formData: FormData) {
  const session = await getCurrentAppSession();

  if (!session) {
    redirect("/auth/login?next=/mobile/cleaning");
  }

  if (!canAccessMobileCleaning(session.user.role)) {
    redirectWithError("not_allowed");
  }

  const sessionId = cleanText(formData.get("sessionId"));

  if (!sessionId) {
    redirectWithError("missing_session");
  }

  const supabase = await getSupabaseServerClient();
  const { data: rawData, error } = await supabase
    .from("cleaning_sessions")
    .select("id, status, staff_user_id, started_at")
    .eq("id", sessionId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  const sessionRow = rawData as { id: string; status: string; staff_user_id: string; started_at: string } | null;

  if (error || !sessionRow) {
    redirectWithError("active_not_found");
  }

  if (sessionRow.status === "cancelled") {
    redirectWithError("already_cancelled");
  }

  if (sessionRow.status === "completed") {
    redirectWithError("already_completed");
  }

  if (sessionRow.staff_user_id !== session.user.id) {
    redirectWithError("not_allowed");
  }

  // DB check constraint requires completed_at + duration_seconds to be non-null
  // for both 'completed' and 'cancelled' statuses.
  const cancelledAt = new Date();
  const durationSeconds = Math.max(
    0,
    Math.round((cancelledAt.getTime() - new Date(sessionRow.started_at).getTime()) / 1000),
  );

  const { error: updateError } = await supabase
    .from("cleaning_sessions")
    .update({
      completed_at: cancelledAt.toISOString(),
      duration_seconds: durationSeconds,
      status: "cancelled",
    } as never)
    .eq("id", sessionId)
    .eq("status", "in_progress");

  if (updateError) {
    redirectWithError("cancel_failed");
  }

  redirect(`${cleaningPath}?cancelled=1`);
}

export async function completeCleaningSession(formData: FormData) {
  const session = await getCurrentAppSession();

  if (!session) {
    redirect("/auth/login?next=/mobile/cleaning");
  }

  if (!canAccessMobileCleaning(session.user.role)) {
    redirectWithError("not_allowed");
  }

  const sessionId = cleanText(formData.get("sessionId"));
  const notes = cleanText(formData.get("notes"));

  if (!sessionId) {
    redirectWithError("missing_session");
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("cleaning_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("organization_id", session.organization.id)
    .eq("staff_user_id", session.user.id)
    .eq("status", "in_progress")
    .maybeSingle();

  const activeSession = data as CleaningSessionRow | null;

  if (error || !activeSession) {
    redirectWithError("active_not_found");
  }

  const completedAt = new Date();
  const startedAt = new Date(activeSession.started_at);
  const durationSeconds = Math.max(
    0,
    Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
  );
  const update: Database["public"]["Tables"]["cleaning_sessions"]["Update"] = {
    completed_at: completedAt.toISOString(),
    duration_seconds: durationSeconds,
    notes: notes || null,
    status: "completed",
  };

  const { error: updateError } = await supabase
    .from("cleaning_sessions")
    .update(update as never)
    .eq("id", activeSession.id)
    .eq("status", "in_progress");

  if (updateError) {
    redirectWithError("complete_failed");
  }

  redirect(`${cleaningPath}?completed=1`);
}
