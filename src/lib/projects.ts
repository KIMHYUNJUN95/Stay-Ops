import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectTasks, type TaskRecord } from "@/lib/tasks";
import type { Database } from "@/types/database";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectParticipantRow = Database["public"]["Tables"]["project_participants"]["Row"];
type ProjectSectionRow = Database["public"]["Tables"]["project_sections"]["Row"];

export type ProjectRole = "owner" | "member";

export type ProjectMemberInfo = {
  userId: string;
  name: string;
  role: ProjectRole;
  isFirstRecipient: boolean;
};

export type ProjectSummary = {
  id: string;
  title: string;
  description: string | null;
  isShared: boolean;
  createdByUserId: string;
  viewerRole: ProjectRole;
  members: ProjectMemberInfo[];
  totalTasks: number;
  completedTasks: number;
  sortOrder: number | null;
  createdAt: string;
};

export type ProjectSectionInfo = {
  id: string;
  title: string;
  sortOrder: number | null;
};

export type ProjectDetailData = {
  id: string;
  title: string;
  description: string | null;
  isShared: boolean;
  createdByUserId: string;
  viewerRole: ProjectRole;
  viewerIsOwner: boolean;
  members: ProjectMemberInfo[];
  sections: ProjectSectionInfo[];
  tasks: TaskRecord[];
};

type ProfileName = { id: string; name: string };

function isMissingTable(message: string): boolean {
  return message.includes("does not exist") || message.includes("schema cache");
}

function normalizeRole(role: string): ProjectRole {
  return role === "owner" ? "owner" : "member";
}

async function resolveNames(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return names;
  const { data } = await supabase.from("profiles").select("id, name").in("id", unique);
  for (const p of (data ?? []) as ProfileName[]) names.set(p.id, p.name);
  return names;
}

function buildMembers(
  rows: Pick<ProjectParticipantRow, "user_id" | "role" | "is_first_recipient">[],
  names: Map<string, string>,
): ProjectMemberInfo[] {
  return rows
    .map((r) => ({
      userId: r.user_id,
      name: names.get(r.user_id) ?? "",
      role: normalizeRole(r.role),
      isFirstRecipient: r.is_first_recipient,
    }))
    // Owner first, then members in name order.
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Projects the current user belongs to (RLS-scoped to project membership). */
export async function getVisibleProjects(session: AppSession): Promise<ProjectSummary[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("organization_id", session.organization.id)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error.message ?? "")) return [];
    throw new Error(error.message);
  }
  const projects = (data ?? []) as ProjectRow[];
  if (projects.length === 0) return [];
  const projectIds = projects.map((p) => p.id);

  const [{ data: partData }, { data: taskData }] = await Promise.all([
    supabase
      .from("project_participants")
      .select("project_id, user_id, role, is_first_recipient")
      .in("project_id", projectIds),
    supabase.from("tasks").select("project_id, status").in("project_id", projectIds),
  ]);

  const parts = (partData ?? []) as Array<
    Pick<ProjectParticipantRow, "project_id" | "user_id" | "role" | "is_first_recipient">
  >;
  const names = await resolveNames(
    supabase,
    parts.map((p) => p.user_id),
  );

  const partsByProject = new Map<string, typeof parts>();
  for (const p of parts) {
    partsByProject.set(p.project_id, [...(partsByProject.get(p.project_id) ?? []), p]);
  }

  const counts = new Map<string, { total: number; completed: number }>();
  for (const t of (taskData ?? []) as Array<{ project_id: string | null; status: string }>) {
    if (!t.project_id) continue;
    const c = counts.get(t.project_id) ?? { total: 0, completed: 0 };
    c.total += 1;
    if (t.status === "completed") c.completed += 1;
    counts.set(t.project_id, c);
  }

  return projects.map((p) => {
    const memberRows = partsByProject.get(p.id) ?? [];
    const members = buildMembers(memberRows, names);
    const mine = memberRows.find((m) => m.user_id === session.user.id);
    const count = counts.get(p.id) ?? { total: 0, completed: 0 };
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      isShared: p.is_shared,
      createdByUserId: p.created_by_user_id,
      viewerRole: mine ? normalizeRole(mine.role) : "member",
      members,
      totalTasks: count.total,
      completedTasks: count.completed,
      sortOrder: p.sort_order,
      createdAt: p.created_at,
    };
  });
}

/** One project with members, sections, and its tasks (RLS-scoped to membership). */
export async function getProjectDetail(
  session: AppSession,
  projectId: string,
): Promise<ProjectDetailData | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message ?? "")) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const project = data as ProjectRow;

  const [{ data: partData }, { data: sectionData }, tasks] = await Promise.all([
    supabase
      .from("project_participants")
      .select("project_id, user_id, role, is_first_recipient")
      .eq("project_id", projectId),
    supabase
      .from("project_sections")
      .select("id, title, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    getProjectTasks(session, projectId),
  ]);

  const parts = (partData ?? []) as Array<
    Pick<ProjectParticipantRow, "project_id" | "user_id" | "role" | "is_first_recipient">
  >;
  const names = await resolveNames(
    supabase,
    parts.map((p) => p.user_id),
  );
  const members = buildMembers(parts, names);
  const mine = parts.find((m) => m.user_id === session.user.id);
  const viewerRole: ProjectRole = mine ? normalizeRole(mine.role) : "member";
  const viewerIsOwner =
    viewerRole === "owner" || project.created_by_user_id === session.user.id;

  const sections: ProjectSectionInfo[] = (
    (sectionData ?? []) as Pick<ProjectSectionRow, "id" | "title" | "sort_order">[]
  ).map((s) => ({ id: s.id, title: s.title, sortOrder: s.sort_order }));

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    isShared: project.is_shared,
    createdByUserId: project.created_by_user_id,
    viewerRole,
    viewerIsOwner,
    members,
    sections,
    tasks,
  };
}
