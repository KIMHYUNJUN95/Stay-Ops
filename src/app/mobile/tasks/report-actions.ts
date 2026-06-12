"use server";

import { canGenerateDailyReport } from "@/config/roles";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { tokyoDateOf } from "@/lib/tasks";

export type DailyReportResult =
  | { ok: true; text: string }
  | { ok: false; reason: "forbidden" | "empty" | "error" };

// Localized header suffix for the report's first line ("YYYY-MM-DD <suffix>").
const REPORT_HEADER: Record<string, string> = {
  ko: "업무일지 입니다",
  ja: "業務日報です",
  en: "Daily report",
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
 * tasks. Free / template-based — no LLM call, no per-use cost. Still **staff-only** (see
 * `canGenerateDailyReport`): a forbidden caller gets `reason: "forbidden"` so the client can show the
 * "권한 없음" popup. Returns the date header followed by one tidied bullet per completed item, with the
 * description / tags folded into a parenthetical.
 */
export async function generateDailyReport(date: string): Promise<DailyReportResult> {
  const day = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, reason: "error" };

  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "forbidden" };
  if (!canGenerateDailyReport(session.user.role, session.user.canGenerateReport)) {
    return { ok: false, reason: "forbidden" };
  }

  // The user's own completions in this org. completed_at is a timestamptz, so the exact Tokyo-date
  // match is done in JS against tokyoDateOf (mirrors how the 완료/기록 tab groups).
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("title, description, tags, completed_at")
    .eq("organization_id", session.organization.id)
    .eq("status", "completed")
    .eq("completed_by_user_id", session.user.id)
    .order("completed_at", { ascending: true });
  if (error) return { ok: false, reason: "error" };

  type Row = { title: string; description: string | null; tags: string[] | null; completed_at: string | null };
  const rows = ((data ?? []) as Row[]).filter((r) => tokyoDateOf(r.completed_at) === day);
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of rows) {
    const title = tidy(r.title);
    if (!title || seen.has(title)) continue; // skip blanks + exact duplicates
    seen.add(title);
    const tags = (r.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const desc = r.description ? tidy(r.description) : "";
    const extra = [desc, tags.length ? tags.map((t) => `#${t}`).join(" ") : ""]
      .filter(Boolean)
      .join(" / ");
    lines.push(`- ${title}${extra ? ` (${extra})` : ""}`);
  }
  if (lines.length === 0) return { ok: false, reason: "empty" };

  const suffix = REPORT_HEADER[session.user.preferredLanguage] ?? REPORT_HEADER.ko;
  const text = `${day} ${suffix}\n\n${lines.join("\n")}`;
  return { ok: true, text };
}
