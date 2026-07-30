import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

/**
 * Server-only mutations for `task_occurrence_state` — the per-occurrence completion/skip/move state
 * for recurring tasks (2026-07-30 롤포워드 폐지, see docs/planning/01-decision-log.md). Shared by the
 * mobile and admin task actions so the two surfaces write identical state (twin-drift guard).
 *
 * A recurring task's row is a fixed rule + anchor and is never rolled forward or marked completed;
 * completion lives here keyed by `(task_id, occurrence_date)`.
 */

type OccurrenceInsert = Database["public"]["Tables"]["task_occurrence_state"]["Insert"];

/** Mark one occurrence date completed (idempotent upsert on the PK). */
export async function completeOccurrence(args: {
  taskId: string;
  organizationId: string;
  occurrenceDate: string;
  userId: string;
}): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const row: OccurrenceInsert = {
    task_id: args.taskId,
    organization_id: args.organizationId,
    occurrence_date: args.occurrenceDate,
    state: "completed",
    completed_by_user_id: args.userId,
    moved_to_date: null,
  };
  await supabase
    .from("task_occurrence_state")
    .upsert(row as never, { onConflict: "task_id,occurrence_date" });
}

/** Remove an occurrence's recorded state (used to reopen/undo a completed occurrence). */
export async function clearOccurrenceState(taskId: string, occurrenceDate: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  await supabase
    .from("task_occurrence_state")
    .delete()
    .eq("task_id", taskId)
    .eq("occurrence_date", occurrenceDate);
}

/** Resolve a set of overdue occurrence dates as skipped ("삭제") — kept forever, never re-appears. */
export async function skipOccurrences(args: {
  taskId: string;
  organizationId: string;
  dates: string[];
}): Promise<void> {
  if (args.dates.length === 0) return;
  const supabase = getSupabaseServiceClient();
  const rows: OccurrenceInsert[] = args.dates.map((d) => ({
    task_id: args.taskId,
    organization_id: args.organizationId,
    occurrence_date: d,
    state: "skipped",
    completed_by_user_id: null,
    moved_to_date: null,
  }));
  await supabase
    .from("task_occurrence_state")
    .upsert(rows as never, { onConflict: "task_id,occurrence_date" });
}

/** Resolve overdue occurrence dates as moved to `movedTo` ("오늘로 가져오기"). */
export async function moveOccurrences(args: {
  taskId: string;
  organizationId: string;
  dates: string[];
  movedTo: string;
}): Promise<void> {
  if (args.dates.length === 0) return;
  const supabase = getSupabaseServiceClient();
  const rows: OccurrenceInsert[] = args.dates.map((d) => ({
    task_id: args.taskId,
    organization_id: args.organizationId,
    occurrence_date: d,
    state: "moved",
    completed_by_user_id: null,
    moved_to_date: args.movedTo,
  }));
  await supabase
    .from("task_occurrence_state")
    .upsert(rows as never, { onConflict: "task_id,occurrence_date" });
}

/** Occurrence dates that already carry a state row for a task (used to compute what's still open). */
export async function resolvedOccurrenceDates(taskId: string): Promise<Set<string>> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("task_occurrence_state")
    .select("occurrence_date")
    .eq("task_id", taskId);
  return new Set(((data ?? []) as Array<{ occurrence_date: string }>).map((r) => r.occurrence_date));
}
