import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTOMATION_JOB_KEYS,
  defaultJobConfig,
  isAutomationJobKey,
  parseLocales,
  parseSettings,
  parseWeekdays,
  toHhmm,
  type AutomationDestination,
  type AutomationJobConfig,
  type AutomationJobKey,
  type AutomationLocale,
} from "@/lib/automation/jobs";
import type { CleaningListModel, CleaningListRoom } from "@/lib/automation/messages";
import {
  AUTOMATION_RESERVATION_SELECT,
  toAutomationReservation,
  type AutomationReservation,
} from "@/lib/automation/reservation-fields";
import { getCleaningTargets } from "@/lib/cleaning-targets";
import { getDictionary } from "@/lib/i18n";
import {
  getCanonicalPropertyName,
  getDisplayRoomLabel,
  localizePropertyName,
} from "@/lib/room-label-normalization";
import { readAllPages } from "@/lib/supabase/read-all-pages";
import { tokyoDayStart, ymdShift } from "@/lib/tokyo-date";
import type { Database } from "@/types/database";

/**
 * 자동화가 읽는 데이터 — 설정 · 받는 곳 · 예약 · 청소 명단 · 담당자 이름. service-role 로 읽으므로 **조직을 직접 건다.**
 *
 * 도메인 계약: docs/product/36-automation-control.md
 */

type Client = SupabaseClient<Database>;

export type StoredJob = AutomationJobConfig & {
  /** 표에 줄이 있나(없으면 기본값 + 꺼짐). */
  stored: boolean;
  nextWakeAt: string | null;
  lastDoneOn: string | null;
  eventCursor: string | null;
  updatedAt: string | null;
};

type JobRow = Database["public"]["Tables"]["automation_jobs"]["Row"];

export function toStoredJob(row: JobRow): StoredJob {
  const jobKey = row.job_key as AutomationJobKey;
  const base = defaultJobConfig(jobKey);
  return {
    enabled: row.enabled,
    eventCursor: row.event_cursor,
    jobKey,
    lastDoneOn: row.last_done_on,
    nextWakeAt: row.next_wake_at,
    retryUntil: toHhmm(row.retry_until, base.retryUntil),
    sendTime: toHhmm(row.send_time, base.sendTime),
    settings: parseSettings(row.settings),
    stored: true,
    updatedAt: row.updated_at,
    weekdays: parseWeekdays(row.weekdays),
  };
}

export async function loadJobs(supabase: Client, organizationId: string): Promise<Record<AutomationJobKey, StoredJob>> {
  const result = await supabase.from("automation_jobs").select("*").eq("organization_id", organizationId);
  if (result.error) throw new Error(result.error.message);
  const out = Object.fromEntries(
    AUTOMATION_JOB_KEYS.map((key) => [
      key,
      { ...defaultJobConfig(key), eventCursor: null, lastDoneOn: null, nextWakeAt: null, stored: false, updatedAt: null },
    ]),
  ) as Record<AutomationJobKey, StoredJob>;
  for (const row of result.data ?? []) {
    if (isAutomationJobKey(row.job_key)) out[row.job_key] = toStoredJob(row);
  }
  return out;
}

export async function loadDestinations(
  supabase: Client,
  organizationId: string,
): Promise<Record<AutomationJobKey, AutomationDestination[]>> {
  const result = await supabase
    .from("automation_destinations")
    .select("job_key, channel_key, locales")
    .eq("organization_id", organizationId)
    .order("channel_key");
  if (result.error) throw new Error(result.error.message);
  const out = Object.fromEntries(AUTOMATION_JOB_KEYS.map((key) => [key, [] as AutomationDestination[]])) as Record<
    AutomationJobKey,
    AutomationDestination[]
  >;
  for (const row of result.data ?? []) {
    if (!isAutomationJobKey(row.job_key)) continue;
    const locales = parseLocales(row.locales);
    if (locales.length > 0) out[row.job_key].push({ channelKey: row.channel_key, locales });
  }
  return out;
}

/** 건물 표시 이름 — 우리 건물 정보(`properties.display_name_*`) 우선, 없으면 사전의 건물 이름. */
export async function loadPropertyLabeler(
  supabase: Client,
  organizationId: string,
): Promise<(canonicalName: string, locale: AutomationLocale) => string> {
  const result = await supabase
    .from("properties")
    .select("name, display_name_ko, display_name_ja, display_name_en")
    .eq("organization_id", organizationId);
  const names = new Map<string, Record<AutomationLocale, string | null>>();
  for (const row of result.data ?? []) {
    names.set(getCanonicalPropertyName(row.name), { en: row.display_name_en, ja: row.display_name_ja, ko: row.display_name_ko });
  }
  return (canonicalName, locale) => {
    const stored = names.get(canonicalName)?.[locale]?.trim();
    if (stored) return stored;
    return localizePropertyName(canonicalName, getDictionary(locale).cleaning.buildingLabels);
  };
}

/**
 * 자동화 메시지의 건물 순서 — **저쪽 청소 명단 순서**(`CLEANING_BUILDING_ORDER`: 스테이아리가 오쿠보 뒤). 판매 캘린더 순서와
 * 다르다. 일일 리포트도 같은 순서를 쓰고 사노는 맨 끝(2026-10-07 사용자 결정).
 */
export const AUTOMATION_BUILDING_ORDER: readonly string[] = [
  "아라키초A",
  "아라키초B",
  "가부키초",
  "다카다노바바",
  "오쿠보A",
  "오쿠보B",
  "오쿠보C",
  "STAY ARI Apartment Hotel",
  "사노",
];

/**
 * 일일 리포트 재료 — 이번 달 예약(예약 시각 기준)과 어제 근처에 취소된 예약.
 *
 * 예약 시각 · 취소 시각은 원본(`raw_payload`)에만 있어 JSON 경로로 거른다. 경계는 하루씩 넉넉히 잡고 정확한 판정은
 * `computeDailyStats` 가 한다(도쿄 날짜).
 */
export async function loadDailyReportReservations(
  supabase: Client,
  organizationId: string,
  reportDate: string,
): Promise<AutomationReservation[]> {
  const monthStart = `${reportDate.slice(0, 7)}-01`;
  const bookedFrom = tokyoDayStart(ymdShift(monthStart, -1));
  const cancelFrom = tokyoDayStart(ymdShift(reportDate, -2));
  const [booked, cancelled] = await Promise.all([
    readAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("reservations")
        .select(AUTOMATION_RESERVATION_SELECT)
        .eq("organization_id", organizationId)
        .or(`raw_payload->>bookingTime.gte.${bookedFrom},raw_payload->>bookTime.gte.${bookedFrom},raw_payload->>entryTime.gte.${bookedFrom}`)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
    ),
    readAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("reservations")
        .select(AUTOMATION_RESERVATION_SELECT)
        .eq("organization_id", organizationId)
        .eq("status", "cancelled")
        .or(`raw_payload->>cancelTime.gte.${cancelFrom},raw_payload->>modifiedTime.gte.${cancelFrom}`)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
    ),
  ]);
  if (booked.error) throw new Error(booked.error.message);
  if (cancelled.error) throw new Error(cancelled.error.message);
  return [...booked.data, ...cancelled.data].map(toAutomationReservation);
}

/** 방 코드 — 현장이 부르는 이름(저쪽 `formatCleaningRoomCode`, 스테이아리만 숫자만). 오쿠보처럼 건물 = 방이면 null(건물 이름을 쓴다). */
export function cleaningRoomCode(canonicalProperty: string, canonicalRoom: string): string | null {
  if (canonicalRoom === canonicalProperty) return null;
  const display = getDisplayRoomLabel(canonicalProperty, canonicalRoom);
  const digits = display.replace(/[^0-9]/g, "");
  if (!digits) return display;
  switch (canonicalProperty) {
    case "아라키초A":
      return `AA${digits}`;
    case "아라키초B":
      return `AB${digits}`;
    case "가부키초":
      return `K${digits}`;
    case "다카다노바바":
      return `T${digits[0]}`;
    case "STAY ARI Apartment Hotel":
      // 숫자만(`107`) — 저쪽은 `sky107`, 우리 객실 이름은 `O107`. 2026-10-07 사용자 결정으로 접두어 없이.
      return digits;
    default:
      return display;
  }
}

/** 청소 · 셋팅 명단 — 청소 화면과 **같은 계산**(`getCleaningTargets`)을 쓴다. 제외 건물은 설정에서. */
export async function loadCleaningListModel(
  supabase: Client,
  organizationId: string,
  targetDate: string,
  excludedProperties: readonly string[],
): Promise<CleaningListModel> {
  const targets = await getCleaningTargets(organizationId, targetDate, supabase);
  const excluded = new Set(excludedProperties);
  const cleaning: CleaningListRoom[] = targets.cleaningList
    .filter((item) => !excluded.has(item.canonicalPropertyName))
    .map((item) => ({
      code: cleaningRoomCode(item.canonicalPropertyName, item.canonicalRoomLabel) ?? "",
      guestName: item.hasTurnover ? item.arrivingGuestName : null,
      kind: item.hasTurnover ? "turnover" : "no_checkin",
      pax: item.hasTurnover ? item.arrivingGuestsTotal : item.nextCheckInGuestsTotal,
      propertyName: item.canonicalPropertyName,
      roomKey: item.roomKey,
    }));
  const setting: CleaningListRoom[] = targets.settingList
    .filter((item) => !excluded.has(item.canonicalPropertyName))
    .map((item) => ({
      code: cleaningRoomCode(item.canonicalPropertyName, item.canonicalRoomLabel) ?? "",
      guestName: item.arrivingGuestName,
      kind: "setting",
      pax: item.arrivingGuestsTotal,
      propertyName: item.canonicalPropertyName,
      roomKey: item.roomKey,
    }));
  return { cleaning, setting, targetDate };
}

/** 방 코드가 없는(오쿠보) 줄은 건물 이름을 코드 자리에 넣는다 — 언어마다 다르므로 메시지를 만들 때 채운다. */
export function withLocalizedCodes(
  model: CleaningListModel,
  label: (canonicalName: string) => string,
): CleaningListModel {
  const fix = (room: CleaningListRoom) => (room.code ? room : { ...room, code: label(room.propertyName) });
  return { ...model, cleaning: model.cleaning.map(fix), setting: model.setting.map(fix) };
}

export async function loadAssignees(supabase: Client, organizationId: string, date: string): Promise<Map<string, string>> {
  const result = await supabase
    .from("cleaning_list_assignees")
    .select("room_key, names")
    .eq("organization_id", organizationId)
    .eq("assign_date", date);
  if (result.error) throw new Error(result.error.message);
  return new Map((result.data ?? []).map((row) => [row.room_key, row.names]));
}

/** 예약 데이터 관문 — 증분 정합성이 24시간 안에 돌았나(저쪽 `assertReservationDataReady` 의 24시간). */
export const RESERVATION_GATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function checkReservationGate(
  supabase: Client,
  now: Date,
): Promise<{ ok: boolean; lastSyncAt: string | null; ageMinutes: number | null }> {
  const result = await supabase.from("beds24_sync_state").select("last_modified_cursor").eq("id", true).maybeSingle();
  const lastSyncAt = result.data?.last_modified_cursor ?? null;
  if (!lastSyncAt) return { ageMinutes: null, lastSyncAt: null, ok: false };
  const age = now.getTime() - Date.parse(lastSyncAt);
  return { ageMinutes: Math.round(age / 60_000), lastSyncAt, ok: age <= RESERVATION_GATE_MAX_AGE_MS };
}
