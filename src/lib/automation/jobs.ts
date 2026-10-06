/**
 * 자동화 레지스트리 — 어떤 자동화가 있고, 기본값이 무엇인가. **순수하다**(서버 import 없음 — 화면도 쓴다).
 *
 * 도메인 계약: docs/product/36-automation-control.md
 *
 * 저쪽(STAY ARI Manager `functions/modules/slackReports.js` · `cancelAlert.js` · `sameDayBookingAlert.js`)에
 * 이미 있던 다섯 가지만 옮긴다. 새 자동화는 이식이 끝난 뒤 따로 기획한다(사용자 지시 2026-10-06).
 *
 * `automation_jobs` 에 줄이 없으면 아래 기본값 + **꺼짐**이다. 처음 저장할 때 줄이 생긴다.
 */

export const AUTOMATION_JOB_KEYS = [
  "daily_report",
  "cleaning_list",
  "cancel_alert",
  "same_day_alert",
  "failure_alert",
] as const;

export type AutomationJobKey = (typeof AUTOMATION_JOB_KEYS)[number];

export function isAutomationJobKey(value: unknown): value is AutomationJobKey {
  return typeof value === "string" && (AUTOMATION_JOB_KEYS as readonly string[]).includes(value);
}

/** 시각형은 매일 정한 시각에, 이벤트형은 일이 생길 때마다. */
export type AutomationJobKind = "scheduled" | "event";

export const AUTOMATION_JOB_KIND: Record<AutomationJobKey, AutomationJobKind> = {
  cancel_alert: "event",
  cleaning_list: "scheduled",
  daily_report: "scheduled",
  failure_alert: "event",
  same_day_alert: "event",
};

export const AUTOMATION_LOCALES = ["ko", "ja", "en"] as const;
export type AutomationLocale = (typeof AUTOMATION_LOCALES)[number];

export function isAutomationLocale(value: unknown): value is AutomationLocale {
  return typeof value === "string" && (AUTOMATION_LOCALES as readonly string[]).includes(value);
}

/** 일일 리포트가 세는 채널 — 저쪽은 `referer` 가 정확히 이 값인 예약만 셌다(`slackReports.js` :244). */
export const DAILY_REPORT_CHANNELS = ["airbnb", "booking"] as const;
export type DailyReportChannel = (typeof DAILY_REPORT_CHANNELS)[number];

/** 변동 재전송(저쪽의 죽은 코드를 살림 — 2026-10-06 사용자 결정). */
export type ResendSettings = {
  enabled: boolean;
  /** 예약이 바뀐 뒤 이만큼 모아서 한 번. */
  debounceMinutes: number;
  /** 하루 최대 재전송 횟수. */
  maxPerDay: number;
  /** 이 시각(도쿄)까지만 다시 본다. */
  until: string;
};

export type AutomationSettings = {
  /** 메시지에서 뺄 건물(운영 표준 이름). */
  excludedProperties: string[];
  /** 일일 리포트가 세는 채널. */
  channels: DailyReportChannel[];
  /** 일일 리포트: 어제 숫자가 늦게 바뀌면 다시 보냄. 청소 명단: 예약이 바뀌면 정정본. */
  resend: ResendSettings;
};

export const DEFAULT_RESEND: ResendSettings = { debounceMinutes: 10, enabled: true, maxPerDay: 3, until: "18:00" };

export function defaultSettings(): AutomationSettings {
  return { channels: ["airbnb", "booking"], excludedProperties: [], resend: { ...DEFAULT_RESEND } };
}

export type AutomationJobConfig = {
  jobKey: AutomationJobKey;
  enabled: boolean;
  /** "HH:MM" 도쿄. */
  sendTime: string;
  retryUntil: string;
  /** ISO 요일 1=월 … 7=일. */
  weekdays: number[];
  settings: AutomationSettings;
};

export function defaultJobConfig(jobKey: AutomationJobKey): AutomationJobConfig {
  return {
    enabled: false,
    jobKey,
    retryUntil: "09:00",
    sendTime: "06:30",
    settings: defaultSettings(),
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHhmm(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

/** DB `time`(HH:MM:SS) → "HH:MM". */
export function toHhmm(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const short = value.slice(0, 5);
  return isHhmm(short) ? short : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * 저장된 `settings` jsonb 를 믿지 않고 다시 읽는다 — 화면과 서버가 같은 결과를 본다. 모르는 값은 기본값으로.
 */
export function parseSettings(value: unknown): AutomationSettings {
  const base = defaultSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const record = value as Record<string, unknown>;
  const excluded = Array.isArray(record.excludedProperties)
    ? record.excludedProperties.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 30)
    : base.excludedProperties;
  const channels = Array.isArray(record.channels)
    ? DAILY_REPORT_CHANNELS.filter((channel) => (record.channels as unknown[]).includes(channel))
    : base.channels;
  const resendRaw = record.resend && typeof record.resend === "object" ? (record.resend as Record<string, unknown>) : {};
  return {
    channels: channels.length > 0 ? [...channels] : base.channels,
    excludedProperties: [...new Set(excluded.map((item) => item.trim()))],
    resend: {
      debounceMinutes: clampInt(resendRaw.debounceMinutes, 1, 120, DEFAULT_RESEND.debounceMinutes),
      enabled: typeof resendRaw.enabled === "boolean" ? resendRaw.enabled : DEFAULT_RESEND.enabled,
      maxPerDay: clampInt(resendRaw.maxPerDay, 0, 20, DEFAULT_RESEND.maxPerDay),
      until: isHhmm(resendRaw.until) ? resendRaw.until : DEFAULT_RESEND.until,
    },
  };
}

export function parseWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5, 6, 7];
  const days = [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort();
  return days;
}

/** 받는 곳 하나 = Slack 채널 키 × 체크한 언어들. */
export type AutomationDestination = { channelKey: string; locales: AutomationLocale[] };

export const CHANNEL_KEY_PATTERN = /^[A-Z0-9_]{1,40}$/;

export function parseLocales(value: unknown): AutomationLocale[] {
  if (!Array.isArray(value)) return [];
  return AUTOMATION_LOCALES.filter((locale) => value.includes(locale));
}
