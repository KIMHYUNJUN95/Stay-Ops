import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postToAutomationChannel } from "@/lib/automation/channels";
import {
  AUTOMATION_BUILDING_ORDER,
  checkReservationGate,
  loadAssignees,
  loadCleaningListModel,
  loadDailyReportReservations,
  loadDestinations,
  loadJobs,
  loadPropertyLabeler,
  toStoredJob,
  withLocalizedCodes,
  type StoredJob,
} from "@/lib/automation/data";
import {
  AUTOMATION_JOB_KIND,
  type AutomationDestination,
  type AutomationJobKey,
  type AutomationLocale,
} from "@/lib/automation/jobs";
import {
  buildCleaningListMessage,
  buildDailyReportMessage,
  buildReservationAlertMessage,
  cleaningStructureKey,
  computeDailyStats,
  dailySnapshotOf,
  fill,
  isFreshCancellation,
  isSameDayBooking,
  sameSnapshot,
  type CleaningListModel,
  type DailySnapshot,
  type DailyStats,
} from "@/lib/automation/messages";
import {
  AUTOMATION_RESERVATION_SELECT,
  toAutomationReservation,
  type AutomationReservation,
} from "@/lib/automation/reservation-fields";
import { computeNextWake, hhmmToMinutes, isPastRetryDeadline, isScheduledSendDue, tokyoClock } from "@/lib/automation/schedule";
import { acquireBeds24Lock, releaseBeds24Lock } from "@/lib/beds24/sync-locks";
import { getDictionary } from "@/lib/i18n";
import { getCanonicalPropertyName, getDisplayRoomLabel, getCanonicalRoomLabel } from "@/lib/room-label-normalization";
import { postSlackText } from "@/lib/slack-notify";
import { ymdShift } from "@/lib/tokyo-date";
import type { Database, Json } from "@/types/database";

/**
 * 자동화 실행기 — 1분 틱 · 지금 보내기 · 정정본이 전부 여기를 지난다.
 *
 * 도메인 계약: docs/product/36-automation-control.md
 *
 * - **받는 곳 × 언어마다 한 통**, 한 통마다 실행 기록 한 줄(`automation_runs`).
 * - 정시 · 이벤트 발송은 `dedupe_key` 로 **먼저 줄을 잡고 나서** 보낸다 — 두 틱이 겹치거나 중간에 죽었다 다시 돌아도
 *   같은 것을 두 번 보내지 않는다(저쪽 취소 · 당일예약 알림은 중복 방지가 없었다).
 * - 실패는 실패 알림으로 모은다(`notifyAutomationFailure`).
 */

type Client = SupabaseClient<Database>;

const TICK_LOCK = "automation_tick";
const TICK_LOCK_TTL_MS = 60_000;
const EVENT_SCAN_LIMIT = 300;
const CANCEL_FRESH_MS = 24 * 60 * 60 * 1000;

export type RunTrigger = "scheduled" | "retry" | "manual" | "event" | "correction" | "resend";

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function appBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

// ── 한 통 보내기 + 기록 ─────────────────────────────────────────────────

type Delivery = {
  organizationId: string;
  jobKey: AutomationJobKey;
  destination: AutomationDestination;
  locale: AutomationLocale;
  text: string;
  trigger: RunTrigger;
  targetDate: string | null;
  meta?: Record<string, unknown>;
  dedupeKey?: string | null;
  actorId?: string | null;
};

type DeliveryResult = "sent" | "failed" | "duplicate";

async function deliver(supabase: Client, item: Delivery): Promise<DeliveryResult> {
  const base = {
    actor_id: item.actorId ?? null,
    channel_key: item.destination.channelKey,
    job_key: item.jobKey,
    locale: item.locale,
    message: item.text,
    message_hash: hashOf(item.text),
    meta: (item.meta ?? {}) as Json,
    organization_id: item.organizationId,
    target_date: item.targetDate,
    trigger: item.trigger,
  };

  // 줄을 먼저 잡는다(`sending` 실패로) → 보낸 뒤 결과로 고친다. 이미 있으면 다른 틱이 처리했다.
  const claimed = await supabase
    .from("automation_runs")
    .insert({ ...base, dedupe_key: item.dedupeKey ?? null, reason: "sending", status: "failed" })
    .select("id")
    .single();
  if (claimed.error) {
    if (claimed.error.code === "23505") return "duplicate";
    console.error("[automation] run claim failed", { code: claimed.error.code, job: item.jobKey });
    return "failed";
  }

  const sent = await postToAutomationChannel(item.destination.channelKey, item.text);
  await supabase
    .from("automation_runs")
    .update(sent.ok ? { reason: null, status: "sent" } : { reason: sent.reason, status: "failed" })
    .eq("id", claimed.data.id);
  return sent.ok ? "sent" : "failed";
}

async function recordSkip(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
  input: { trigger: RunTrigger; reason: string; targetDate: string | null; dedupeKey?: string | null; meta?: Record<string, unknown> },
) {
  const inserted = await supabase.from("automation_runs").insert({
    dedupe_key: input.dedupeKey ?? null,
    job_key: jobKey,
    meta: (input.meta ?? {}) as Json,
    organization_id: organizationId,
    reason: input.reason,
    status: "skipped",
    target_date: input.targetDate,
    trigger: input.trigger,
  });
  if (inserted.error && inserted.error.code !== "23505") {
    console.error("[automation] skip record failed", { code: inserted.error.code, job: jobKey });
  }
}

// ── 실패 알림 ────────────────────────────────────────────────────────────

/**
 * 실패 알림 — 「실패 알림」 자동화가 켜져 있고 받는 곳이 있으면 거기로(언어마다), 아니면 기존 운영 경보 채널
 * (`SLACK_OPS_ALERT_WEBHOOK_URL`)로. **업무 채널로 대신 보내지 않는다**(저쪽은 일일 → 청소 채널로 넘겼다).
 * 같은 제목 · 내용은 15분 동안 한 번(저쪽 `sync_alert_dedupe` 와 같은 창).
 */
export async function notifyAutomationFailure(
  supabase: Client,
  organizationId: string,
  input: { title: string; lines: string[] },
): Promise<void> {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const key = hashOf(`${input.title}\n${input.lines.join("\n")}`);
  try {
    const [jobs, destinations] = await Promise.all([loadJobs(supabase, organizationId), loadDestinations(supabase, organizationId)]);
    const job = jobs.failure_alert;
    const targets = destinations.failure_alert;
    if (job.enabled && targets.length > 0) {
      for (const destination of targets) {
        for (const locale of destination.locales) {
          const copy = getDictionary(locale).automationMessages;
          const text = [fill(copy.failure.title, { title: input.title }), ...input.lines].join("\n");
          await deliver(supabase, {
            dedupeKey: `failure_alert:${key}:${bucket}:${destination.channelKey}:${locale}`,
            destination,
            jobKey: "failure_alert",
            locale,
            organizationId,
            targetDate: null,
            text,
            trigger: "event",
          });
        }
      }
      return;
    }
    const copy = getDictionary("ko").automationMessages;
    await postSlackText([fill(copy.failure.title, { title: input.title }), ...input.lines].join("\n"));
  } catch (error) {
    console.error("[automation] failure alert failed", error instanceof Error ? error.message : error);
  }
}

// ── 메시지 만들기(미리보기와 발송이 같은 함수) ───────────────────────────────

export type BuiltMessages = {
  targetDate: string | null;
  byLocale: Partial<Record<AutomationLocale, string>>;
  meta: Record<string, unknown>;
};

async function buildDaily(
  supabase: Client,
  organizationId: string,
  job: StoredJob,
  reportDate: string,
  locales: AutomationLocale[],
  previous: DailySnapshot | null,
): Promise<{ built: BuiltMessages; stats: DailyStats }> {
  const [reservations, label] = await Promise.all([
    loadDailyReportReservations(supabase, organizationId, reportDate),
    loadPropertyLabeler(supabase, organizationId),
  ]);
  const stats = computeDailyStats({
    buildingOrder: AUTOMATION_BUILDING_ORDER,
    canonicalProperty: getCanonicalPropertyName,
    channels: job.settings.channels,
    excludedProperties: job.settings.excludedProperties,
    reportDate,
    reservations,
  });
  const byLocale: Partial<Record<AutomationLocale, string>> = {};
  for (const locale of locales) {
    byLocale[locale] = buildDailyReportMessage({
      copy: getDictionary(locale).automationMessages,
      locale,
      previous,
      propertyLabel: (name) => label(name, locale),
      stats,
    });
  }
  return { built: { byLocale, meta: { snapshot: dailySnapshotOf(stats) }, targetDate: reportDate }, stats };
}

async function buildCleaning(
  supabase: Client,
  organizationId: string,
  job: StoredJob,
  targetDate: string,
  locales: AutomationLocale[],
  correction: boolean,
): Promise<{ built: BuiltMessages; model: CleaningListModel }> {
  const [model, names, label] = await Promise.all([
    loadCleaningListModel(supabase, organizationId, targetDate, job.settings.excludedProperties),
    loadAssignees(supabase, organizationId, targetDate),
    loadPropertyLabeler(supabase, organizationId),
  ]);
  const byLocale: Partial<Record<AutomationLocale, string>> = {};
  for (const locale of locales) {
    const propertyLabel = (name: string) => label(name, locale);
    byLocale[locale] = buildCleaningListMessage({
      buildingOrder: AUTOMATION_BUILDING_ORDER,
      copy: getDictionary(locale).automationMessages,
      correction,
      model: withLocalizedCodes(model, propertyLabel),
      names,
      propertyLabel,
    });
  }
  return {
    built: {
      byLocale,
      meta: { names: Object.fromEntries(names), structureKey: hashOf(cleaningStructureKey(model)) },
      targetDate,
    },
    model,
  };
}

/** 정시 발송이 다루는 날 — 일일 리포트 = 어제, 청소 명단 = 오늘. */
export function scheduledTargetDate(jobKey: AutomationJobKey, now: Date): string {
  const today = tokyoClock(now).date;
  return jobKey === "daily_report" ? ymdShift(today, -1) : today;
}

/**
 * 화면 미리보기 — 보내지 않고 만들기만. 일일 리포트 · 청소 명단은 날짜, 이벤트형은 최근 예약 한 건으로.
 */
export async function buildPreview(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
  input: { date: string; locale: AutomationLocale },
): Promise<{ text: string; targetDate: string | null; sampleId: string | null }> {
  const jobs = await loadJobs(supabase, organizationId);
  const job = jobs[jobKey];
  if (jobKey === "daily_report") {
    const { built } = await buildDaily(supabase, organizationId, job, input.date, [input.locale], null);
    return { sampleId: null, targetDate: input.date, text: built.byLocale[input.locale] ?? "" };
  }
  if (jobKey === "cleaning_list") {
    const { built } = await buildCleaning(supabase, organizationId, job, input.date, [input.locale], false);
    return { sampleId: null, targetDate: input.date, text: built.byLocale[input.locale] ?? "" };
  }
  if (jobKey === "failure_alert") {
    const copy = getDictionary(input.locale).automationMessages;
    return { sampleId: null, targetDate: null, text: [fill(copy.failure.title, { title: copy.failure.sampleTitle }), copy.failure.sampleLine].join("\n") };
  }
  const sample = await latestEventSample(supabase, organizationId, jobKey);
  if (!sample) return { sampleId: null, targetDate: null, text: "" };
  const text = await buildAlertText(supabase, organizationId, jobKey, sample, input.locale);
  return { sampleId: sample.id, targetDate: null, text };
}

async function latestEventSample(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
): Promise<AutomationReservation | null> {
  let query = supabase.from("reservations").select(AUTOMATION_RESERVATION_SELECT).eq("organization_id", organizationId);
  query = jobKey === "cancel_alert" ? query.eq("status", "cancelled") : query.eq("status", "confirmed");
  const result = await query.order("updated_at", { ascending: false }).limit(1);
  const row = (result.data as unknown as Record<string, unknown>[] | null)?.[0];
  return row ? toAutomationReservation(row) : null;
}

async function buildAlertText(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
  reservation: AutomationReservation,
  locale: AutomationLocale,
  labeler?: (name: string, locale: AutomationLocale) => string,
): Promise<string> {
  const label = labeler ?? (await loadPropertyLabeler(supabase, organizationId));
  const canonical = getCanonicalPropertyName(reservation.propertyName);
  const room = getDisplayRoomLabel(canonical, getCanonicalRoomLabel(canonical, reservation.roomLabel));
  const base = appBaseUrl();
  return buildReservationAlertMessage({
    copy: getDictionary(locale).automationMessages,
    kind: jobKey === "cancel_alert" ? "cancel" : "same_day",
    openUrl: base ? `${base}/admin/ops/calendar?resv=${encodeURIComponent(reservation.id)}` : null,
    propertyLabel: label(canonical, locale),
    reservation,
    roomLabel: room,
  });
}

// ── 시각형: 정시 · 재시도 · 변동 재전송 · 정정본 · 지금 보내기 ───────────────────

function allLocales(destinations: AutomationDestination[]): AutomationLocale[] {
  return [...new Set(destinations.flatMap((item) => item.locales))];
}

async function sendBuilt(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
  destinations: AutomationDestination[],
  built: BuiltMessages,
  input: { trigger: RunTrigger; dedupeSuffix: string | null; actorId?: string | null },
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const destination of destinations) {
    for (const locale of destination.locales) {
      const text = built.byLocale[locale];
      if (!text) continue;
      const result = await deliver(supabase, {
        actorId: input.actorId,
        dedupeKey: input.dedupeSuffix ? `${jobKey}:${built.targetDate}:${input.dedupeSuffix}:${destination.channelKey}:${locale}` : null,
        destination,
        jobKey,
        locale,
        meta: built.meta,
        organizationId,
        targetDate: built.targetDate,
        text,
        trigger: input.trigger,
      });
      if (result === "sent") sent += 1;
      if (result === "failed") failed += 1;
    }
  }
  return { failed, sent };
}

/** 그날 마지막으로 **보낸** 줄의 meta(재전송 · 정정본 비교 기준). */
async function lastSentMeta(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
  targetDate: string,
): Promise<{ meta: Record<string, unknown>; resendsToday: number } | null> {
  const result = await supabase
    .from("automation_runs")
    .select("meta, trigger, created_at")
    .eq("organization_id", organizationId)
    .eq("job_key", jobKey)
    .eq("target_date", targetDate)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = result.data ?? [];
  if (rows.length === 0) return null;
  const resendsToday = new Set(
    rows.filter((row) => row.trigger === "resend" || row.trigger === "correction").map((row) => row.created_at.slice(0, 16)),
  ).size;
  return { meta: (rows[0].meta ?? {}) as Record<string, unknown>, resendsToday };
}

function snapshotFrom(meta: Record<string, unknown>): DailySnapshot | null {
  const value = meta.snapshot as Partial<DailySnapshot> | undefined;
  if (!value || typeof value !== "object") return null;
  const n = (x: unknown) => (typeof x === "number" ? x : Number(x) || 0);
  return { mtdNew: n(value.mtdNew), revenue: n(value.revenue), totalCancel: n(value.totalCancel), totalNew: n(value.totalNew) };
}

async function updateJobState(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
  patch: Database["public"]["Tables"]["automation_jobs"]["Update"],
) {
  const result = await supabase.from("automation_jobs").update(patch).eq("organization_id", organizationId).eq("job_key", jobKey);
  if (result.error) console.error("[automation] job state update failed", { code: result.error.code, job: jobKey });
}

async function runScheduledJob(supabase: Client, organizationId: string, job: StoredJob, now: Date): Promise<string> {
  const jobKey = job.jobKey;
  const today = tokyoClock(now).date;
  const targetDate = scheduledTargetDate(jobKey, now);
  const destinations = (await loadDestinations(supabase, organizationId))[jobKey];
  // 발송 시각 직후(틱 지연 1분까지)는 정시, 그 뒤는 재시도.
  const trigger: RunTrigger = tokyoClock(now).minutes <= hhmmToMinutes(job.sendTime) + 1 ? "scheduled" : "retry";
  const recheckUntil = job.settings.resend.enabled ? job.settings.resend.until : null;

  if (destinations.length === 0) {
    await recordSkip(supabase, organizationId, jobKey, { dedupeKey: `${jobKey}:${targetDate}:no_destination`, reason: "no_destination", targetDate, trigger });
    await updateJobState(supabase, organizationId, jobKey, {
      last_done_on: today,
      next_wake_at: computeNextWake({ ...job, lastDoneOn: today, recheckUntil: null }, now)?.toISOString() ?? null,
    });
    return "no_destination";
  }

  const gate = await checkReservationGate(supabase, now);
  if (!gate.ok) {
    const giveUp = isPastRetryDeadline(job, now);
    await recordSkip(supabase, organizationId, jobKey, {
      dedupeKey: `${jobKey}:${targetDate}:gate:${giveUp ? "final" : "first"}`,
      meta: { ageMinutes: gate.ageMinutes, lastSyncAt: gate.lastSyncAt },
      reason: "gate_stale",
      targetDate,
      trigger,
    });
    if (giveUp) {
      await notifyAutomationFailure(supabase, organizationId, {
        lines: [`job=${jobKey}`, `date=${targetDate}`, `reservation sync=${gate.lastSyncAt ?? "-"}`],
        title: `${jobKey} gate_stale`,
      });
      await updateJobState(supabase, organizationId, jobKey, {
        last_done_on: today,
        next_wake_at: computeNextWake({ ...job, lastDoneOn: today, recheckUntil: null }, now)?.toISOString() ?? null,
      });
      return "gate_final";
    }
    await updateJobState(supabase, organizationId, jobKey, {
      next_wake_at: computeNextWake({ ...job, recheckUntil: null }, now, { retryAfterFailure: true })?.toISOString() ?? null,
    });
    return "gate_wait";
  }

  const locales = allLocales(destinations);
  const built =
    jobKey === "daily_report"
      ? (await buildDaily(supabase, organizationId, job, targetDate, locales, null)).built
      : (await buildCleaning(supabase, organizationId, job, targetDate, locales, false)).built;
  const result = await sendBuilt(supabase, organizationId, jobKey, destinations, built, { dedupeSuffix: "scheduled", trigger });

  const done = result.failed === 0 || isPastRetryDeadline(job, now);
  if (result.failed > 0) {
    await notifyAutomationFailure(supabase, organizationId, {
      lines: [`job=${jobKey}`, `date=${targetDate}`, `failed=${result.failed}`, `sent=${result.sent}`],
      title: `${jobKey} send failed`,
    });
  }
  await updateJobState(supabase, organizationId, jobKey, {
    ...(done ? { last_done_on: today } : {}),
    next_wake_at:
      computeNextWake({ ...job, lastDoneOn: done ? today : job.lastDoneOn, recheckUntil }, now, { retryAfterFailure: !done })?.toISOString() ?? null,
  });
  return done ? "sent" : "retry";
}

/** 보낸 뒤 확인 — 일일 리포트는 숫자가 바뀌면 변동 재전송, 청소 명단은 예약이 바뀌면 정정본. */
async function recheckJob(supabase: Client, organizationId: string, job: StoredJob, now: Date): Promise<string> {
  const jobKey = job.jobKey;
  const targetDate = scheduledTargetDate(jobKey, now);
  const resend = job.settings.resend;
  const next = () =>
    updateJobState(supabase, organizationId, jobKey, {
      next_wake_at: computeNextWake({ ...job, recheckUntil: resend.enabled ? resend.until : null }, now)?.toISOString() ?? null,
    });
  if (!resend.enabled) {
    await next();
    return "recheck_off";
  }
  const last = await lastSentMeta(supabase, organizationId, jobKey, targetDate);
  if (!last || last.resendsToday >= resend.maxPerDay) {
    await next();
    return last ? "resend_limit" : "nothing_sent";
  }
  const destinations = (await loadDestinations(supabase, organizationId))[jobKey];
  if (destinations.length === 0) {
    await next();
    return "no_destination";
  }
  const locales = allLocales(destinations);

  if (jobKey === "daily_report") {
    const previous = snapshotFrom(last.meta);
    const { built, stats } = await buildDaily(supabase, organizationId, job, targetDate, locales, previous);
    if (!previous || sameSnapshot(previous, dailySnapshotOf(stats))) {
      await next();
      return "unchanged";
    }
    const suffix = `resend:${hashOf(JSON.stringify(dailySnapshotOf(stats))).slice(0, 12)}`;
    await sendBuilt(supabase, organizationId, jobKey, destinations, built, { dedupeSuffix: suffix, trigger: "resend" });
    await next();
    return "resent";
  }

  const { built } = await buildCleaning(supabase, organizationId, job, targetDate, locales, true);
  if (built.meta.structureKey === last.meta.structureKey) {
    await next();
    return "unchanged";
  }
  await sendBuilt(supabase, organizationId, jobKey, destinations, built, {
    dedupeSuffix: `correction:${String(built.meta.structureKey).slice(0, 12)}`,
    trigger: "correction",
  });
  await next();
  return "corrected";
}

/** 「지금 보내기」 · 「정정본 보내기」 — 발송 토글과 상관없이, 사람이 누른 그 자리에서. */
export async function sendJobNow(
  supabase: Client,
  organizationId: string,
  jobKey: AutomationJobKey,
  input: { actorId: string; date: string; correction?: boolean },
): Promise<{ sent: number; failed: number; reason?: "no_destination" | "no_sample" }> {
  const [jobs, destinationsByJob] = await Promise.all([loadJobs(supabase, organizationId), loadDestinations(supabase, organizationId)]);
  const job = jobs[jobKey];
  const destinations = destinationsByJob[jobKey];
  if (destinations.length === 0) return { failed: 0, reason: "no_destination", sent: 0 };
  const locales = allLocales(destinations);

  let built: BuiltMessages;
  if (jobKey === "daily_report") {
    built = (await buildDaily(supabase, organizationId, job, input.date, locales, null)).built;
  } else if (jobKey === "cleaning_list") {
    built = (await buildCleaning(supabase, organizationId, job, input.date, locales, !!input.correction)).built;
  } else if (jobKey === "failure_alert") {
    const byLocale: BuiltMessages["byLocale"] = {};
    for (const locale of locales) {
      const copy = getDictionary(locale).automationMessages;
      byLocale[locale] = [fill(copy.failure.title, { title: copy.failure.sampleTitle }), copy.failure.sampleLine].join("\n");
    }
    built = { byLocale, meta: { test: true }, targetDate: null };
  } else {
    const sample = await latestEventSample(supabase, organizationId, jobKey);
    if (!sample) return { failed: 0, reason: "no_sample", sent: 0 };
    const labeler = await loadPropertyLabeler(supabase, organizationId);
    const byLocale: BuiltMessages["byLocale"] = {};
    for (const locale of locales) byLocale[locale] = await buildAlertText(supabase, organizationId, jobKey, sample, locale, labeler);
    built = { byLocale, meta: { reservationId: sample.id }, targetDate: null };
  }
  return sendBuilt(supabase, organizationId, jobKey, destinations, built, {
    actorId: input.actorId,
    dedupeSuffix: null,
    trigger: input.correction ? "correction" : "manual",
  });
}

// ── 이벤트형: 취소 · 당일예약 ──────────────────────────────────────────────

/**
 * 커서 뒤에 바뀐 예약을 훑어 보낸다. 웹훅 처리 코드를 건드리지 않는다 — 웹훅이든 정합성이든 예약 표가 바뀌면
 * 1분 안에 여기서 잡히고, `dedupe_key`(예약 × 받는 곳 × 언어)가 두 번 가는 것을 막는다.
 */
async function scanEventJob(supabase: Client, organizationId: string, job: StoredJob, now: Date): Promise<string> {
  const jobKey = job.jobKey;
  const cursor = job.eventCursor ?? now.toISOString();
  const changed = await supabase
    .from("reservations")
    .select(AUTOMATION_RESERVATION_SELECT)
    .eq("organization_id", organizationId)
    .gt("updated_at", cursor)
    .order("updated_at", { ascending: true })
    .limit(EVENT_SCAN_LIMIT);
  if (changed.error) {
    console.error("[automation] event scan failed", { code: changed.error.code, job: jobKey });
    return "scan_failed";
  }
  const rows = ((changed.data ?? []) as unknown as Record<string, unknown>[]).map(toAutomationReservation);
  if (rows.length === 0) {
    if (!job.eventCursor) await updateJobState(supabase, organizationId, jobKey, { event_cursor: cursor });
    return "idle";
  }

  const today = tokyoClock(now).date;
  const excluded = new Set(job.settings.excludedProperties);
  const freshSince = new Date(now.getTime() - CANCEL_FRESH_MS).toISOString();
  const matches = rows.filter((row) => {
    if (excluded.has(getCanonicalPropertyName(row.propertyName))) return false;
    return jobKey === "cancel_alert" ? isFreshCancellation(row, freshSince) : isSameDayBooking(row, today);
  });

  if (matches.length > 0) {
    const [destinations, labeler] = await Promise.all([
      loadDestinations(supabase, organizationId).then((all) => all[jobKey]),
      loadPropertyLabeler(supabase, organizationId),
    ]);
    let failed = 0;
    for (const reservation of matches) {
      for (const destination of destinations) {
        for (const locale of destination.locales) {
          const text = await buildAlertText(supabase, organizationId, jobKey, reservation, locale, labeler);
          const result = await deliver(supabase, {
            dedupeKey: `${jobKey}:${reservation.id}:${destination.channelKey}:${locale}`,
            destination,
            jobKey,
            locale,
            meta: { reservationId: reservation.id },
            organizationId,
            targetDate: null,
            text,
            trigger: "event",
          });
          if (result === "failed") failed += 1;
        }
      }
    }
    if (failed > 0) {
      await notifyAutomationFailure(supabase, organizationId, { lines: [`job=${jobKey}`, `failed=${failed}`], title: `${jobKey} send failed` });
    }
  }

  await updateJobState(supabase, organizationId, jobKey, { event_cursor: rows[rows.length - 1].updatedAt });
  return `scanned:${rows.length}:${matches.length}`;
}

// ── 1분 틱 ────────────────────────────────────────────────────────────────

export type TickSummary = { status: "busy" | "done"; results: Array<{ organizationId: string; jobKey: string; result: string }> };

export async function runAutomationTick(supabase: Client, now = new Date()): Promise<TickSummary> {
  const lock = await acquireBeds24Lock(supabase, TICK_LOCK, "automation-tick", TICK_LOCK_TTL_MS);
  if (!lock.acquired) return { results: [], status: "busy" };
  const results: TickSummary["results"] = [];
  try {
    const rows = await supabase.from("automation_jobs").select("*").eq("enabled", true);
    if (rows.error) throw new Error(rows.error.message);
    for (const row of rows.data ?? []) {
      const job = toStoredJob(row);
      const organizationId = row.organization_id;
      try {
        let result = "skip";
        if (AUTOMATION_JOB_KIND[job.jobKey] === "event") {
          if (job.jobKey !== "failure_alert") result = await scanEventJob(supabase, organizationId, job, now);
        } else if (isScheduledSendDue(job, now)) {
          result = await runScheduledJob(supabase, organizationId, job, now);
        } else if (job.nextWakeAt && Date.parse(job.nextWakeAt) <= now.getTime()) {
          result =
            job.lastDoneOn === tokyoClock(now).date
              ? await recheckJob(supabase, organizationId, job, now)
              : "rescheduled";
          if (result === "rescheduled") {
            await updateJobState(supabase, organizationId, job.jobKey, {
              next_wake_at:
                computeNextWake({ ...job, recheckUntil: job.settings.resend.enabled ? job.settings.resend.until : null }, now)?.toISOString() ?? null,
            });
          }
        }
        results.push({ jobKey: job.jobKey, organizationId, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[automation] job failed", { job: job.jobKey, message });
        results.push({ jobKey: job.jobKey, organizationId, result: "error" });
        await notifyAutomationFailure(supabase, organizationId, { lines: [`job=${job.jobKey}`, message.slice(0, 300)], title: `${job.jobKey} error` });
        if (AUTOMATION_JOB_KIND[job.jobKey] === "scheduled") {
          await updateJobState(supabase, organizationId, job.jobKey, {
            next_wake_at: computeNextWake({ ...job, recheckUntil: null }, now, { retryAfterFailure: true })?.toISOString() ?? null,
          });
        }
      }
    }
  } finally {
    await releaseBeds24Lock(supabase, TICK_LOCK, lock.lockId);
  }
  return { results, status: "done" };
}
