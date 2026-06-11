import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyTaskParticipants } from "@/lib/notifications/create";
import { tokyoDateOf, tokyoToday } from "@/lib/tasks";
import type { Database } from "@/types/database";

type CandidateRow = {
  id: string;
  organization_id: string;
  title: string;
  due_at: string | null;
  status: string;
};

export type TaskReminderResult = {
  scanned: number;
  dueSoonTasks: number;
  overdueTasks: number;
  notificationsAttempted: number;
};

const EMPTY: TaskReminderResult = {
  scanned: 0,
  dueSoonTasks: 0,
  overdueTasks: 0,
  notificationsAttempted: 0,
};

/**
 * Evaluate time-based task reminders and fan them out. Intended to run once daily from a
 * cron (see `/api/tasks/reminders`); it is the only path that can produce these two types.
 *
 * First-slice rules (anchored on the Tokyo operating date, like the rest of the feature):
 * - **due soon** — an active task (`open`/`in_progress`) whose `due_at` Tokyo date == today.
 *   One same-day reminder; not an escalating series.
 * - **overdue** — an active task whose `due_at` Tokyo date is before today.
 *
 * Spam control: dedupe via the notifications `unique (recipient_user_id, dedupe_key)`
 * constraint with `dedupe_key = task_due_soon|task_overdue:<taskId>`, so each task yields at
 * most one due-soon and one overdue reminder per recipient, ever — re-running the cron is a
 * no-op for already-notified tasks.
 *
 * Permission/scope: tasks are org-scoped; recipients are exactly the task's participants
 * (so a private personal task only reminds its author, and shared tasks reach all current
 * participants — never anyone else). These are system reminders with no actor, so the author
 * is intentionally included (it is their own deadline, not someone else's activity).
 */
export async function runTaskReminders(
  supabase: SupabaseClient<Database>,
  options: { organizationId?: string } = {},
): Promise<TaskReminderResult> {
  const today = tokyoToday();
  const [ty, tm, td] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);
  // Upper bound: anything due before tomorrow 00:00 JST is today-or-earlier; future tasks
  // are neither due-soon nor overdue, so they never enter the candidate set.
  const upperBoundIso = new Date(`${tomorrow}T00:00:00+09:00`).toISOString();

  let query = supabase
    .from("tasks")
    .select("id, organization_id, title, due_at, status")
    .not("due_at", "is", null)
    .in("status", ["open", "in_progress"])
    .lt("due_at", upperBoundIso);
  if (options.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }

  const { data, error } = await query;
  if (error || !data) return EMPTY;
  const rows = data as CandidateRow[];
  if (rows.length === 0) return EMPTY;

  // Participants for every candidate task in one round-trip (avoid N+1).
  const taskIds = rows.map((r) => r.id);
  const { data: partData } = await supabase
    .from("task_participants")
    .select("task_id, user_id")
    .in("task_id", taskIds);
  const participantsByTask = new Map<string, string[]>();
  for (const p of (partData ?? []) as Array<{ task_id: string; user_id: string }>) {
    participantsByTask.set(p.task_id, [...(participantsByTask.get(p.task_id) ?? []), p.user_id]);
  }

  let dueSoonTasks = 0;
  let overdueTasks = 0;
  let notificationsAttempted = 0;

  for (const row of rows) {
    const dueDate = tokyoDateOf(row.due_at);
    if (!dueDate) continue;
    const recipients = participantsByTask.get(row.id) ?? [];
    if (recipients.length === 0) continue;

    const overdue = dueDate < today;
    const dueSoon = dueDate === today;
    if (!overdue && !dueSoon) continue;

    const type = overdue ? "task_overdue" : "task_due_soon";
    const event = overdue ? "overdue" : "due_soon";
    if (overdue) overdueTasks += 1;
    else dueSoonTasks += 1;
    notificationsAttempted += recipients.length;

    await notifyTaskParticipants(supabase, {
      organizationId: row.organization_id,
      taskId: row.id,
      recipientUserIds: recipients,
      actorUserId: "", // system reminder — no actor, so every participant is notified
      type,
      dedupeBase: `${type}:${row.id}`, // one per task per recipient, ever
      payload: { taskId: row.id, taskTitle: row.title, actorUserId: null, event },
    });
  }

  return { scanned: rows.length, dueSoonTasks, overdueTasks, notificationsAttempted };
}
