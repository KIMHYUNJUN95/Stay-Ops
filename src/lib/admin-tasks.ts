import "server-only";

import type { AppSession } from "@/lib/session";
import {
  getOccurrenceStates,
  getShareableUsers,
  getVisibleTasks,
  tokyoDateOf,
  tokyoToday,
  ymdShift,
  type OccurrenceStateRecord,
  type ShareableUser,
  type TaskRecord,
} from "@/lib/tasks";
import { getVisibleProjects, type ProjectSummary } from "@/lib/projects";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** One net completion of a task on a Tokyo day (from the `completed`/`reopened` log). */
export type CompletionRecord = { taskId: string; day: string; byUserId: string | null };

export type AdminTasksData = {
  tasks: TaskRecord[];
  projects: ProjectSummary[];
  users: ShareableUser[];
  completions: CompletionRecord[];
  occurrenceStates: OccurrenceStateRecord[];
  me: { id: string; name: string; role: string };
  loadError: boolean;
};

/**
 * Completion history from `task_updates` (NOT `tasks.status`). A recurring task completion rolls the
 * row forward and keeps it `open`, so it never has `status=completed` — the completion only lives in
 * the log. The 완료·기록 tab reads this so recurring completions show alongside one-off ones (and so
 * the list agrees with the daily report, which uses the same source). Net per (task, day):
 * completed − reopened, so a same-day undo cancels out. Bounded to the last ~120 days.
 */
async function getCompletionRecords(): Promise<CompletionRecord[]> {
  const supabase = await getSupabaseServerClient();
  const sinceIso = new Date(`${ymdShift(tokyoToday(), -120)}T00:00:00+09:00`).toISOString();
  const { data, error } = await supabase
    .from("task_updates")
    .select("task_id, update_type, created_at, created_by_user_id")
    .in("update_type", ["completed", "reopened"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) return [];
  type Row = {
    task_id: string;
    update_type: string;
    created_at: string | null;
    created_by_user_id: string | null;
  };
  const net = new Map<string, { net: number; by: string | null }>(); // key = `${taskId}|${day}`
  for (const r of (data ?? []) as Row[]) {
    const day = tokyoDateOf(r.created_at);
    if (!day) continue;
    const key = `${r.task_id}|${day}`;
    const cur = net.get(key) ?? { net: 0, by: null };
    if (r.update_type === "completed") {
      cur.net += 1;
      cur.by = r.created_by_user_id;
    } else {
      cur.net -= 1;
    }
    net.set(key, cur);
  }
  const out: CompletionRecord[] = [];
  for (const [key, v] of net) {
    if (v.net <= 0) continue;
    const sep = key.lastIndexOf("|");
    out.push({ taskId: key.slice(0, sep), day: key.slice(sep + 1), byUserId: v.by });
  }
  return out;
}

/**
 * Loads everything the admin Todoist console needs in one call — the viewer's visible tasks
 * (personal + shared + directed), their shared projects, the org's shareable members (for the
 * share / directive picker), the completion log, and the viewer identity. All reads are the existing
 * session-scoped task/project libs (surface-agnostic); the console filters per-view client-side,
 * exactly like the mobile TasksWorkspace. See docs/product/28-admin-todoist-console.md.
 */
export async function getAdminTasksData(session: AppSession): Promise<AdminTasksData> {
  const me = {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
  };
  try {
    const [tasks, projects, users, completions, occurrenceStates] = await Promise.all([
      getVisibleTasks(session),
      getVisibleProjects(session),
      getShareableUsers(session),
      getCompletionRecords(),
      getOccurrenceStates(session),
    ]);
    return { tasks, projects, users, completions, occurrenceStates, me, loadError: false };
  } catch {
    return { tasks: [], projects: [], users: [], completions: [], occurrenceStates: [], me, loadError: true };
  }
}
