import "server-only";

import type { AppSession } from "@/lib/session";
import { getShareableUsers, getVisibleTasks, type ShareableUser, type TaskRecord } from "@/lib/tasks";
import { getVisibleProjects, type ProjectSummary } from "@/lib/projects";

export type AdminTasksData = {
  tasks: TaskRecord[];
  projects: ProjectSummary[];
  users: ShareableUser[];
  me: { id: string; name: string; role: string };
  loadError: boolean;
};

/**
 * Loads everything the admin Todoist console needs in one call — the viewer's visible tasks
 * (personal + shared + directed), their shared projects, the org's shareable members (for the
 * share / directive picker), and the viewer identity. All reads are the existing session-scoped
 * task/project libs (surface-agnostic); the console filters per-view client-side, exactly like
 * the mobile TasksWorkspace. See docs/product/28-admin-todoist-console.md.
 */
export async function getAdminTasksData(session: AppSession): Promise<AdminTasksData> {
  const me = {
    id: session.user.id,
    name: session.user.name ?? "",
    role: session.user.role,
  };
  try {
    const [tasks, projects, users] = await Promise.all([
      getVisibleTasks(session),
      getVisibleProjects(session),
      getShareableUsers(session),
    ]);
    return { tasks, projects, users, me, loadError: false };
  } catch {
    return { tasks: [], projects: [], users: [], me, loadError: true };
  }
}
