"use server";

import { canGenerateDailyReport } from "@/config/roles";
import { buildDailyReportText, type DailyReportDraft, type DailyReportItem } from "@/lib/daily-report";
import { getFieldActivities } from "@/lib/field-activity";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { hasPermissionOverride } from "@/lib/permission-overrides-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type DailyReportResult =
  | ({ ok: true } & DailyReportDraft)
  | { ok: false; reason: "forbidden" | "empty" | "error" };

export type SlackSendFailureReason =
  | "forbidden"
  | "empty"
  | "error"
  | "not_configured"
  | "too_long";

export type SendDailyReportToSlackResult = { ok: true } | { ok: false; reason: SlackSendFailureReason };

// ── Localized template parts ─────────────────────────────────────────────────
// i18n-ignore-start: localized server-action report templates live together here.
// 합계 문구는 `{n}` 자리표시자를 쓴다 — 클라이언트가 선택 개수에 맞춰 다시 조립하는데
// 함수는 서버 액션 경계를 넘지 못하기 때문이다(`src/lib/daily-report.ts` 참고).
type ReportTemplateParts = {
  header: string;
  labelDate: string;
  labelName: string;
  sectionDone: string;
  sectionField: string;
  summaryOne: string;
  summaryMany: string;
};

const REPORT_TEMPLATE: Record<string, ReportTemplateParts> = {
  ko: {
    header: "[업무일지]",
    labelDate: "날짜",
    labelName: "담당자",
    sectionDone: "■ 완료 업무",
    sectionField: "■ 현장 활동",
    summaryOne: "총 완료: {n}건",
    summaryMany: "총 완료: {n}건",
  },
  ja: {
    header: "[業務日報]",
    labelDate: "日付",
    labelName: "担当者",
    sectionDone: "■ 完了業務",
    sectionField: "■ 現場作業",
    summaryOne: "計: {n}件完了",
    summaryMany: "計: {n}件完了",
  },
  en: {
    header: "[Daily Work Report]",
    labelDate: "Date",
    labelName: "Name",
    sectionDone: "■ Completed Tasks",
    sectionField: "■ Field Activity",
    summaryOne: "Total: {n} task completed",
    summaryMany: "Total: {n} tasks completed",
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

  // Resolve titles (org-scoped; a task deleted after completion simply drops out).
  const titleById = new Map<string, string>();
  if (completedIds.length > 0) {
    const { data: taskData, error: taskErr } = await supabase
      .from("tasks")
      .select("id, title")
      .eq("organization_id", session.organization.id)
      .in("id", completedIds)
      .is("deleted_at", null);
    if (taskErr) return { ok: false, reason: "error" };
    for (const t of (taskData ?? []) as { id: string; title: string }[]) titleById.set(t.id, t.title);
  }

  // Collect unique titles only (no tags, no descriptions), in completion order.
  const seen = new Set<string>();
  const items: DailyReportItem[] = [];
  for (const id of completedIds) {
    const title = tidy(titleById.get(id) ?? "");
    if (!title || seen.has(title)) continue;
    seen.add(title);
    items.push({ text: title, section: "done" });
  }

  // 현장 활동 — 청소·유지보수·린넨·주문에서 **본인이 완료 처리한** 것만(`src/lib/field-activity.ts`).
  // 투두 완료가 하나도 없어도 현장 일은 있었을 수 있으므로, `empty` 판정은 둘을 합친 뒤에 한다.
  const field = await getFieldActivities({
    organizationId: session.organization.id,
    userId: session.user.id,
    locale,
  });
  const fieldSeen = new Set<string>();
  for (const activity of field) {
    if (activity.day !== day || fieldSeen.has(activity.label)) continue;
    fieldSeen.add(activity.label);
    items.push({ text: activity.label, section: "field" });
  }

  if (items.length === 0) return { ok: false, reason: "empty" };

  // Format the date in the user's locale.
  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${day}T00:00:00+09:00`));

  // 항목 배열과 조각을 함께 내려보내, 클라이언트가 체크한 것만으로 본문을 다시 만들 수 있게 한다.
  const template = { ...tmpl, dateLabel, name: session.user.name };

  return { ok: true, text: buildDailyReportText(template, items), items, template };
}

/**
 * Posts the caller-reviewed daily report to the single company Slack channel.
 *
 * The webhook URL stays exclusively in `SLACK_DAILY_REPORT_WEBHOOK_URL`; the client never receives
 * it. We deliberately send the textarea body unchanged so the existing report template and the
 * user's final edits are what appear in Slack. Re-generating first is an authorization + empty-report
 * guard, not a replacement for the edited text.
 */
export async function sendDailyReportToSlack(
  date: string,
  editedText: string,
): Promise<SendDailyReportToSlackResult> {
  // 실패 사유를 서버 로그에 남긴다. 이 액션은 throw 하지 않고 결과 객체로 실패를 돌려주므로
  // Vercel 런타임 **에러** 로그에 아무것도 안 남는다. 2026-08-04 "모바일에서 Slack 전송이 안
  // 된다"를 추적할 때 POST 200 만 보이고 어느 분기인지 알 수 없었다(청소 액션과 같은 교훈).
  const fail = (reason: SlackSendFailureReason) => {
    console.warn(`[report] slack send blocked: ${reason}`);
    return { ok: false as const, reason };
  };

  const day = String(date ?? "").trim();
  const text = String(editedText ?? "").trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day) || !text) return fail("error");
  // Slack truncates text above 40,000 characters. Reject rather than silently posting a partial report.
  if (text.length > 40_000) return fail("too_long");

  const generated = await generateDailyReport(day);
  if (!generated.ok) return fail(generated.reason);

  const webhookUrl = process.env.SLACK_DAILY_REPORT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    // `not_configured` 는 "값이 없다"와 "값이 이상하다" 둘 다에서 난다. 어느 쪽인지 모르면
    // 환경변수를 넣고도 원인을 못 좁힌다 — 두 경우를 갈라 남긴다(2026-08-05).
    console.warn("[report] slack webhook env is missing or empty");
    return fail("not_configured");
  }

  try {
    const endpoint = new URL(webhookUrl);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "hooks.slack.com") {
      // 호스트/프로토콜만 남긴다 — 경로에 토큰이 들어 있으므로 URL 전체는 절대 로그에 남기지 않는다.
      console.warn(
        `[report] slack webhook host rejected: ${endpoint.protocol}//${endpoint.hostname} (len=${webhookUrl.length})`,
      );
      return fail("not_configured");
    }
  } catch {
    console.warn(`[report] slack webhook is not a valid URL (len=${webhookUrl.length})`);
    return fail("not_configured");
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });
    if (!response.ok) {
      // Slack 이 거절한 이유는 본문에 온다(no_service / invalid_payload 등). 웹훅 URL 은 절대
      // 로그에 남기지 않는다.
      const detail = await response.text().catch(() => "");
      console.warn(`[report] slack rejected: ${response.status} ${detail.slice(0, 200)}`);
      return fail("error");
    }
  } catch (error) {
    console.warn("[report] slack fetch failed:", error instanceof Error ? error.message : error);
    return fail("error");
  }

  // 본문은 감사 메타데이터에 넣지 않는다 — 운영 정보가 섞일 수 있다. 그리고 감사 기록 실패가
  // **이미 전달된** Slack 메시지를 실패로 보이게 만들어서도 안 된다.
  try {
    const session = await getCurrentAppSession();
    if (session && hasOrganizationContext(session)) {
      const audit = await getSupabaseServiceClient()
        .from("audit_logs")
        .insert({
          organization_id: session.organization.id,
          actor_user_id: session.user.id,
          action: "task_daily_report_slack_sent",
          target_type: "daily_report",
          // `target_id` 는 **uuid 컬럼**이다. 예전에는 `${userId}:${day}` 를 넣어 Postgres 가 매번
          // 거절했고, supabase-js 는 던지지 않고 `{ error }` 를 돌려주는데 아무도 확인하지 않아
          // **감사 기록이 통째로 사라지고 있었다**(2026-08-05 발견, 성공 기록 0건).
          // 일지는 테이블 행이 아니므로 비우고, 날짜는 metadata 로 옮긴다.
          target_id: null,
          metadata: { date: day, character_count: text.length } as Json,
        });
      // 삼키지 않고 남긴다. 감사 기록이 조용히 실패하면 "누가 회사 채널에 무엇을 보냈는가" 가
      // 영영 남지 않는다.
      if (audit.error) console.warn("[report] audit write failed:", audit.error.message);
    }
  } catch (error) {
    console.warn("[report] audit write threw:", error instanceof Error ? error.message : error);
  }

  return { ok: true };
}
