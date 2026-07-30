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

/* ── 회차별 수동 순서 (task_occurrence_order, 2026-07-30) ─────────────────────────
   반복 작업은 행 하나가 여러 날짜에 나타나므로 `tasks.sort_order` 한 칸으로는 날짜별 순서를 담을 수
   없다. 그래서 `(task_id, occurrence_date)` 키로 위치를 따로 저장한다.

   **`task_occurrence_state` 가 아니라 별도 테이블인 이유**: 그 테이블은 "행이 없으면 아직 열린
   회차"가 계약이라(`outstandingOverdueOccurrences`), 순서용 행을 넣으면 오버듀 회차가 조용히
   사라진다. 마이그레이션 주석 참고. */

type OccurrenceOrderInsert = Database["public"]["Tables"]["task_occurrence_order"]["Insert"];

/**
 * 한 날짜 목록의 반복 회차 위치를 통째로 다시 쓴다.
 *
 * 목록은 일회성 작업과 반복 회차가 섞여 있고, 인덱스는 **그 병합된 목록 기준**으로 넘어온다 —
 * 그래야 두 저장처(`tasks.sort_order` / 여기)를 합쳐 정렬했을 때 사용자가 놓은 순서가 재현된다.
 */
export async function setOccurrenceOrders(args: {
  organizationId: string;
  occurrenceDate: string;
  /** taskId → 병합 목록에서의 인덱스 */
  positions: ReadonlyMap<string, number>;
}): Promise<boolean> {
  if (args.positions.size === 0) return true;
  const supabase = getSupabaseServiceClient();
  const rows: OccurrenceOrderInsert[] = [...args.positions].map(([taskId, sortOrder]) => ({
    task_id: taskId,
    organization_id: args.organizationId,
    occurrence_date: args.occurrenceDate,
    sort_order: sortOrder,
  }));
  const { error } = await supabase
    .from("task_occurrence_order")
    .upsert(rows as never, { onConflict: "task_id,occurrence_date" });
  if (error) {
    // 초기 구현이 결과를 버려, 테이블 미적용 상태에서 저장이 조용히 실패했다 — 화면은 낙관적으로
    // 바뀌고 새로고침하면 되돌아가는데 아무 단서가 없었다(2026-07-30). 최소한 로그는 남긴다.
    console.error("[setOccurrenceOrders] upsert failed:", error.message);
    return false;
  }
  return true;
}
