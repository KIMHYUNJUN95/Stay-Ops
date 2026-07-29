"use server";

import { canGenerateDailyReport } from "@/config/roles";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { hasPermissionOverride } from "@/lib/permission-overrides-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type DailyReportResult =
  | { ok: true; text: string }
  | { ok: false; reason: "forbidden" | "empty" | "error" };

// ── Localized template parts ─────────────────────────────────────────────────
// i18n-ignore-start: localized server-action report templates live together here.
const REPORT_TEMPLATE: Record<
  string,
  {
    header: string;
    labelDate: string;
    labelName: string;
    sectionDone: string;
    summary: (n: number) => string;
  }
> = {
  ko: {
    header: "[업무일지]",
    labelDate: "날짜",
    labelName: "담당자",
    sectionDone: "■ 완료 업무",
    summary: (n) => `총 완료: ${n}건`,
  },
  ja: {
    header: "[業務日報]",
    labelDate: "日付",
    labelName: "担当者",
    sectionDone: "■ 完了業務",
    summary: (n) => `計: ${n}件完了`,
  },
  en: {
    header: "[Daily Work Report]",
    labelDate: "Date",
    labelName: "Name",
    sectionDone: "■ Completed Tasks",
    summary: (n) => `Total: ${n} task${n === 1 ? "" : "s"} completed`,
  },
};
// i18n-ignore-end

/**
 * Deterministic, no-cost text tidy-up for a single rough item line. We can't do dictionary-grade
 * 맞춤법 correction without an LLM, but we can reliably normalize the things people get wrong when
 * jotting tasks: stray whitespace, leading bullet glyphs, and spacing around punctuation. Kept
 * conservative so it never changes the meaning of what the user typed.
 */
function tidy(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  // Collapse all whitespace runs to a single space.
  s = s.replace(/\s+/g, " ");
  // Drop any leading bullet / dash / list glyphs the user typed themselves.
  s = s.replace(/^[-–—•·*▪◦●○▶▷>]+\s*/, "");
  // One space after commas / Korean enumeration commas, none before.
  s = s.replace(/\s*[,，、]\s*/g, ", ");
  // Even spacing around common separators.
  s = s.replace(/\s*\/\s*/g, " / ");
  s = s.replace(/\s*·\s*/g, " · ");
  s = s.replace(/\s*&\s*/g, " & ");
  s = s.replace(/\s*~\s*/g, "~");
  // Tighten parentheses/brackets: no padding just inside, a single space just before an opener.
  s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  s = s.replace(/\[\s+/g, "[").replace(/\s+\]/g, "]");
  s = s.replace(/(\S)\(/g, "$1 (");
  // No space before sentence punctuation; collapse repeats.
  s = s.replace(/\s+([.!?…])/g, "$1");
  s = s.replace(/([.,!?])\1+/g, "$1");
  // Final pass: re-collapse, trim, and drop a trailing period (work-log bullets read better without).
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[.\s]+$/, "");
  return s;
}

/**
 * Build the daily work report ("업무일지") for the given Tokyo date from the current user's completed
 * tasks. Free / template-based — no LLM call, no per-use cost. Staff-only (see `canGenerateDailyReport`).
 * Outputs a formal business report: title, date, staff name, numbered task list, total count.
 * Tags and descriptions are intentionally excluded — titles only.
 */
export async function generateDailyReport(date: string): Promise<DailyReportResult> {
  const day = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, reason: "error" };

  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "forbidden" };
  if (
    !canGenerateDailyReport(session.user.role, session.user.canGenerateReport) &&
    !(await hasPermissionOverride(session.organization.id, session.user.id, "can_generate_report"))
  ) {
    return { ok: false, reason: "forbidden" };
  }

  const locale = session.user.preferredLanguage;
  const tmpl = REPORT_TEMPLATE[locale] ?? REPORT_TEMPLATE.ko;

  // The user's own completions on this Tokyo day, derived from the `completed`/`reopened` events in
  // `task_updates` (NOT `tasks.status`). A recurring task completion rolls the row forward and keeps
  // it `open`, so it never has `status=completed` — the completion only lives in the log. Counting a
  // per-task net (completed − reopened) captures recurring completions too and cancels a same-day undo.
  const supabase = await getSupabaseServerClient();
  const dayStart = new Date(`${day}T00:00:00+09:00`);
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = new Date(dayStart.getTime() + 86_400_000).toISOString(); // +09:00 range == the Tokyo day
  const { data: updData, error: updErr } = await supabase
    .from("task_updates")
    .select("task_id, update_type, created_at")
    .in("update_type", ["completed", "reopened"])
    .eq("created_by_user_id", session.user.id)
    .gte("created_at", dayStartIso)
    .lt("created_at", dayEndIso)
    .order("created_at", { ascending: true });
  if (updErr) return { ok: false, reason: "error" };

  type Upd = { task_id: string; update_type: string };
  const net = new Map<string, number>();
  const order: string[] = []; // task_ids in first-completion order
  for (const r of (updData ?? []) as Upd[]) {
    if (!net.has(r.task_id)) {
      net.set(r.task_id, 0);
      order.push(r.task_id);
    }
    net.set(r.task_id, (net.get(r.task_id) ?? 0) + (r.update_type === "completed" ? 1 : -1));
  }
  const completedIds = order.filter((id) => (net.get(id) ?? 0) > 0);
  if (completedIds.length === 0) return { ok: false, reason: "empty" };

  // Resolve titles (org-scoped; a task deleted after completion simply drops out).
  const { data: taskData, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("organization_id", session.organization.id)
    .in("id", completedIds)
    .is("deleted_at", null);
  if (taskErr) return { ok: false, reason: "error" };
  const titleById = new Map<string, string>();
  for (const t of (taskData ?? []) as { id: string; title: string }[]) titleById.set(t.id, t.title);

  // Collect unique titles only (no tags, no descriptions), in completion order.
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const id of completedIds) {
    const title = tidy(titleById.get(id) ?? "");
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  if (titles.length === 0) return { ok: false, reason: "empty" };

  // Format the date in the user's locale.
  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${day}T00:00:00+09:00`));

  const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const text = [
    tmpl.header,
    `${tmpl.labelDate}: ${dateLabel}`,
    `${tmpl.labelName}: ${session.user.name}`,
    "",
    tmpl.sectionDone,
    numbered,
    "",
    tmpl.summary(titles.length),
  ].join("\n");

  return { ok: true, text };
}
