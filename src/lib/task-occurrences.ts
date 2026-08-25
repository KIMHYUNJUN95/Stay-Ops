import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { TaskRecord } from "@/lib/tasks";
import type { OccurrenceState } from "@/lib/tasks-recurrence";
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

/**
 * 한 작업의 회차 상태 전체 — `occurrence_date` → state.
 *
 * `resolvedOccurrenceDates` 는 «행이 있는가»만 답하므로 완료와 건너뜀/이동을 구분하지 못한다. 상세
 * 화면은 그 구분이 필요한데(완료 버튼 라벨), 조직 전체 회차 상태를 끌어오는 `getOccurrenceStates`
 * 를 쓰면 날짜 한 건을 알려고 400일치 org 데이터를 읽게 된다. 작업 하나로 좁힌 조회를 두고,
 * 호출부가 이 한 번의 결과에서 «해결된 날짜 집합»과 «완료 여부»를 함께 뽑아 쓴다.
 */
export async function occurrenceStatesForTask(
  taskId: string,
): Promise<Map<string, OccurrenceState>> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("task_occurrence_state")
    .select("occurrence_date, state")
    .eq("task_id", taskId);
  const rows = (data ?? []) as Array<{ occurrence_date: string; state: string }>;
  return new Map(rows.map((r) => [r.occurrence_date, r.state as OccurrenceState]));
}

/* ── 「오늘로 가져오기」 보충 사본 (2026-08-25) ──────────────────────────────────── */

/**
 * 밀린 회차의 보충용 **일회성 사본** 1건을 만든다 — 제목·컨텍스트만 복사한 실행자 개인 작업이며
 * 반복도, 공유도 아니다. RLS 가 읽을 수 있도록 author 참여자 행을 함께 넣는다.
 *
 * 날짜는 `due_at` 하나로만 앵커한다(단일 날짜 모델). 지연 판정이 모바일·콘솔 양쪽 모두 `due_at` 만
 * 보기 때문에, `scheduled_date` 로 만들면 그날 못 끝냈을 때 오늘·지연·내일 어디에도 안 뜨고 관리함에만
 * 남는다(2026-08-25 수정).
 *
 * 모바일과 콘솔이 이 블록을 통째로 복붙해 갖고 있었다 — 쌍둥이가 어긋나는 것이 이 도메인의 반복된
 * 실패 모드라 한 곳으로 모은다.
 */
export async function createCarryOverTask(args: {
  task: TaskRecord;
  organizationId: string;
  userId: string;
  date: string;
}): Promise<void> {
  const { task } = args;
  const supabase = getSupabaseServiceClient();
  const carryId = crypto.randomUUID();
  await supabase.from("tasks").insert({
    id: carryId,
    organization_id: args.organizationId,
    created_by_user_id: args.userId,
    title: task.title,
    description: task.description ?? null,
    scheduled_date: null,
    due_at: new Date(`${args.date}T00:00:00+09:00`).toISOString(),
    all_day: true,
    priority: task.priority,
    status: "open",
    is_inbox: false,
    is_shared: false,
    recurrence_rule: null,
    recurrence_series_id: null,
    recurrence_instance_date: null,
    tags: task.tags,
    property_id: task.resolvedContext?.propertyId ?? null,
    room_id: task.resolvedContext?.roomId ?? null,
    reservation_id: task.resolvedContext?.reservationId ?? null,
    guest_name: task.resolvedContext?.guestName ?? null,
  } as never);
  await supabase.from("task_participants").insert({
    task_id: carryId,
    user_id: args.userId,
    role: "author",
    is_first_recipient: false,
    added_by_user_id: null,
  } as never);
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
