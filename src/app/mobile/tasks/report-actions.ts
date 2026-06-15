"use server";

import { canGenerateDailyReport } from "@/config/roles";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { tokyoDateOf } from "@/lib/tasks";

export type DailyReportResult =
  | { ok: true; text: string }
  | { ok: false; reason: "forbidden" | "empty" | "error" };

// ── Localized template parts ─────────────────────────────────────────────────
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
  if (!canGenerateDailyReport(session.user.role, session.user.canGenerateReport)) {
    return { ok: false, reason: "forbidden" };
  }

  const locale = session.user.preferredLanguage;
  const tmpl = REPORT_TEMPLATE[locale] ?? REPORT_TEMPLATE.ko;

  // The user's own completions in this org. completed_at is a timestamptz, so the exact Tokyo-date
  // match is done in JS against tokyoDateOf (mirrors how the 완료/기록 tab groups).
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("title, completed_at")
    .eq("organization_id", session.organization.id)
    .eq("status", "completed")
    .eq("completed_by_user_id", session.user.id)
    .order("completed_at", { ascending: true });
  if (error) return { ok: false, reason: "error" };

  type Row = { title: string; completed_at: string | null };
  const rows = ((data ?? []) as Row[]).filter((r) => tokyoDateOf(r.completed_at) === day);
  if (rows.length === 0) return { ok: false, reason: "empty" };

  // Collect unique titles only (no tags, no descriptions).
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const r of rows) {
    const title = tidy(r.title);
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
