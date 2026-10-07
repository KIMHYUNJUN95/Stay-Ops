import "server-only";

import { listAutomationChannels, type AutomationChannel } from "@/lib/automation/channels";
import { checkReservationGate, loadDestinations, loadJobs, loadPropertyLabeler, AUTOMATION_BUILDING_ORDER } from "@/lib/automation/data";
import {
  AUTOMATION_JOB_KEYS,
  AUTOMATION_JOB_KIND,
  type AutomationDestination,
  type AutomationJobKey,
  type AutomationJobKind,
  type AutomationSettings,
} from "@/lib/automation/jobs";
import type { Locale } from "@/lib/i18n";
import type { AppSession } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { tokyoToday, ymdShift } from "@/lib/tokyo-date";

/**
 * 자동화 관제실 화면 데이터 — `/admin/ops/automation`.
 *
 * 도메인 계약: docs/product/36-automation-control.md
 *
 * **호출부가 `ops_admin.access` 를 먼저 확인한다.** service-role 로 읽으므로 조직을 직접 건다.
 */

export type AutomationRunView = {
  id: string;
  createdAt: string;
  targetDate: string | null;
  channelKey: string | null;
  locale: string | null;
  trigger: string;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
};

export type AutomationLogView = {
  id: string;
  createdAt: string;
  actorName: string | null;
  changes: Record<string, { before: unknown; after: unknown }>;
};

export type AutomationJobView = {
  jobKey: AutomationJobKey;
  kind: AutomationJobKind;
  enabled: boolean;
  sendTime: string;
  retryUntil: string;
  weekdays: number[];
  settings: AutomationSettings;
  nextWakeAt: string | null;
  /** 오늘 정시 발송을 끝낸 도쿄 날짜 — 켜기 · 저장 전 「지금 바로 나감」 경고에 쓴다. */
  lastDoneOn: string | null;
  destinations: AutomationDestination[];
  runs: AutomationRunView[];
  logs: AutomationLogView[];
};

export type AutomationPageData = {
  canManage: boolean;
  today: string;
  yesterday: string;
  jobs: AutomationJobView[];
  channels: AutomationChannel[];
  gate: { ok: boolean; ageMinutes: number | null };
  opsAlertConfigured: boolean;
  buildings: Array<{ name: string; label: string }>;
};

export async function getAutomationPageData(session: AppSession, locale: Locale): Promise<AutomationPageData> {
  const supabase = getSupabaseServiceClient();
  const organizationId = session.organization.id;
  const now = new Date();
  const [jobs, destinations, runs, logs, gate, labeler] = await Promise.all([
    loadJobs(supabase, organizationId),
    loadDestinations(supabase, organizationId),
    supabase
      .from("automation_runs")
      .select("id, job_key, created_at, target_date, channel_key, locale, trigger, status, reason")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("automation_setting_logs")
      .select("id, job_key, created_at, actor_id, changes")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    checkReservationGate(supabase, now),
    loadPropertyLabeler(supabase, organizationId),
  ]);

  const actorIds = [...new Set((logs.data ?? []).map((row) => row.actor_id).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await supabase.from("profiles").select("id, name").in("id", actorIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const actorName = new Map((actors.data ?? []).map((row) => [row.id, row.name]));

  const runsByJob = new Map<string, AutomationRunView[]>();
  for (const row of runs.data ?? []) {
    const list = runsByJob.get(row.job_key) ?? [];
    if (list.length >= 60) continue;
    list.push({
      channelKey: row.channel_key,
      createdAt: row.created_at,
      id: row.id,
      locale: row.locale,
      reason: row.reason,
      status: row.status as AutomationRunView["status"],
      targetDate: row.target_date,
      trigger: row.trigger,
    });
    runsByJob.set(row.job_key, list);
  }
  const logsByJob = new Map<string, AutomationLogView[]>();
  for (const row of logs.data ?? []) {
    const list = logsByJob.get(row.job_key) ?? [];
    if (list.length >= 10) continue;
    list.push({
      actorName: row.actor_id ? (actorName.get(row.actor_id) ?? null) : null,
      changes: (row.changes ?? {}) as AutomationLogView["changes"],
      createdAt: row.created_at,
      id: row.id,
    });
    logsByJob.set(row.job_key, list);
  }

  const today = tokyoToday();
  return {
    buildings: AUTOMATION_BUILDING_ORDER.map((name) => ({ label: labeler(name, locale), name })),
    canManage: session.capabilities.includes("automation.manage"),
    channels: listAutomationChannels(),
    gate: { ageMinutes: gate.ageMinutes, ok: gate.ok },
    jobs: AUTOMATION_JOB_KEYS.map((jobKey) => {
      const job = jobs[jobKey];
      return {
        destinations: destinations[jobKey],
        enabled: job.enabled,
        jobKey,
        kind: AUTOMATION_JOB_KIND[jobKey],
        lastDoneOn: job.lastDoneOn,
        logs: logsByJob.get(jobKey) ?? [],
        nextWakeAt: job.nextWakeAt,
        retryUntil: job.retryUntil,
        runs: runsByJob.get(jobKey) ?? [],
        sendTime: job.sendTime,
        settings: job.settings,
        weekdays: job.weekdays,
      };
    }),
    opsAlertConfigured: !!process.env.SLACK_OPS_ALERT_WEBHOOK_URL?.trim(),
    today,
    yesterday: ymdShift(today, -1),
  };
}
