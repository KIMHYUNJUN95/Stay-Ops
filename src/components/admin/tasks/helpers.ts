// Admin Todoist 콘솔 — 클라이언트 안전 헬퍼(날짜/술어/포맷/아바타).
// @/lib/tasks 는 server-only 이므로 여기서 Tokyo 날짜 계산·술어·라벨을 독립 정의한다.
// 라벨은 전부 getAdminTasksDictionary(locale) 를 통해 다국어로만 렌더한다(하드코딩 금지).
import type { Locale } from "@/lib/i18n";
import type { TaskRecord } from "@/lib/tasks";
import {
  formatCustomWeekdays,
  formatWeekday,
  isStandardRecurrence,
  outstandingOverdueOccurrences,
  parseCustomWeekdays,
  recurringOccurrencesInRange,
  WEEKDAY_ORDER,
} from "@/lib/tasks-recurrence";
import type { AdminTasksDictionary } from "@/lib/admin-tasks-i18n";

const TZ = "Asia/Tokyo";

// ── Tokyo 운영 날짜 ────────────────────────────────────────────────────────────
export function tokyoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
export function tokyoDateOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function parseYmdUTC(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function weekdayIndex(ymd: string): number {
  return parseYmdUTC(ymd).getUTCDay();
}

// ── 날짜 포맷(로케일) ──────────────────────────────────────────────────────────
function localeTag(locale: Locale): string {
  return locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "ko-KR";
}
export function fmtShort(ymd: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseYmdUTC(ymd));
}
export function fmtWeekday(ymd: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), { weekday: "short", timeZone: "UTC" }).format(
    parseYmdUTC(ymd),
  );
}
export function fmtLong(ymd: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(parseYmdUTC(ymd));
}
function weekdayForRepeat(ymd: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: locale === "en" ? "long" : "short",
    timeZone: "UTC",
  }).format(parseYmdUTC(ymd));
}

// ── 템플릿 치환 ({n}/{name}/{wd}/{d}/{m}/{date}) ────────────────────────────────
export function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

// ── 술어(meId 기준) ────────────────────────────────────────────────────────────
export function partsOf(t: TaskRecord): string[] {
  return t.participants.filter((p) => p.userId !== t.createdByUserId).map((p) => p.userId);
}
export function isMine(t: TaskRecord, meId: string): boolean {
  return t.createdByUserId === meId;
}
export function isSharedTask(t: TaskRecord): boolean {
  return t.isShared || partsOf(t).length > 0;
}
export function sentInstr(t: TaskRecord, meId: string): boolean {
  return t.isDirective && isMine(t, meId) && partsOf(t).length > 0;
}
export function recvInstr(t: TaskRecord, meId: string): boolean {
  return t.isDirective && !isMine(t, meId) && t.participants.some((p) => p.userId === meId);
}
// 내 뷰(오늘/내일/관리함/캘린더)는 내가 보낸 지시를 제외한다(대상자의 일정이므로).
export function myOwn(t: TaskRecord, meId: string): boolean {
  return !sentInstr(t, meId);
}
export function isActive(t: TaskRecord): boolean {
  return t.status !== "completed";
}
export function dueDateOf(t: TaskRecord): string | null {
  return tokyoDateOf(t.dueAt);
}
// 마감(due) 우선, 없으면 예정일(scheduledDate).
export function dateOf(t: TaskRecord): string | null {
  return tokyoDateOf(t.dueAt) ?? t.scheduledDate ?? null;
}
// 날짜 버킷 술어(오늘/내일/지연)는 이제 **일회성 전용**이다. 반복(표준)은 완료해도 롤포워드하지 않고
// 각 회차가 독립적이므로(2026-07-30), 회차 기준으로 뷰에서 occursOn/occurrence 상태로 따로 처리한다.
export function isOverdue(t: TaskRecord, today: string): boolean {
  if (isStandardRecurrence(t.recurrenceRule)) return false;
  const d = dueDateOf(t);
  return isActive(t) && !!d && d < today;
}
export function isTodayTask(t: TaskRecord, today: string): boolean {
  if (isStandardRecurrence(t.recurrenceRule)) return false;
  return (
    isActive(t) && !isOverdue(t, today) && (t.scheduledDate === today || dueDateOf(t) === today)
  );
}
export function isTomorrowTask(t: TaskRecord, today: string): boolean {
  if (isStandardRecurrence(t.recurrenceRule)) return false;
  const tm = addDays(today, 1);
  return isActive(t) && (t.scheduledDate === tm || dueDateOf(t) === tm);
}

// ── 반복 회차(occurrence) 헬퍼 (2026-07-30) ──────────────────────────────────────
/** 표준 반복의 앵커(마감/예정, 고정). 회차 계산의 시작점. */
export function recurrenceAnchor(t: TaskRecord): string | null {
  return dateOf(t);
}
/** 이 작업이 `ymd`에 걸리는가 — 반복은 규칙으로, 비반복은 앵커 하루. */
export function occursOn(t: TaskRecord, ymd: string): boolean {
  const a = dateOf(t);
  if (!a) return false;
  if (isStandardRecurrence(t.recurrenceRule))
    return recurringOccurrencesInRange(t.recurrenceRule, a, ymd, ymd).length > 0;
  return a === ymd;
}
/** 미해결 지연 회차 날짜들(과거 · 상태 없음). `resolved`는 해당 작업의 회차상태 보유 날짜 집합. */
export function overdueOccurrenceDates(
  t: TaskRecord,
  today: string,
  resolved: ReadonlySet<string>,
): string[] {
  if (!isStandardRecurrence(t.recurrenceRule)) return [];
  return outstandingOverdueOccurrences(t.recurrenceRule, dateOf(t), today, resolved);
}
export function completedDateOf(t: TaskRecord): string | null {
  return tokyoDateOf(t.completedAt);
}

// ── 정렬 ────────────────────────────────────────────────────────────────────────
const PRIO_ORD: Record<string, number> = { urgent: 0, important: 1, normal: 2 };
export function prioSort(a: TaskRecord, b: TaskRecord): number {
  return (PRIO_ORD[a.priority] ?? 2) - (PRIO_ORD[b.priority] ?? 2);
}
export function dateSort(a: TaskRecord, b: TaskRecord): number {
  return (dateOf(a) ?? "9999-99-99").localeCompare(dateOf(b) ?? "9999-99-99");
}

// ── 라벨(다국어) ────────────────────────────────────────────────────────────────
export function prioLabel(prio: string, d: AdminTasksDictionary): string {
  return prio === "urgent" ? d.prioUrgent : prio === "important" ? d.prioImportant : d.prioNormal;
}
export function statusLabel(status: string, d: AdminTasksDictionary): string {
  return status === "completed"
    ? d.stCompleted
    : status === "in_progress"
      ? d.stInProgress
      : d.stOpen;
}

// 백엔드 지원 반복 규칙(yearly 미지원, 요일 없는 bare `custom` 은 round-trip 전용).
// 사용자 지정 요일 반복은 `custom:1,3,5` 형태라 이 목록이 아니라 별도 빌더로 만든다.
export const REPEAT_RULES = ["none", "daily", "weekly", "weekdays", "weekends", "monthly"] as const;
export type RepeatRule = (typeof REPEAT_RULES)[number];

// 요일 순서/이름은 모바일과 공유(@/lib/tasks-recurrence) — 두 화면이 어긋나지 않게 한 곳에서만 정의.
export { WEEKDAY_ORDER };

/** 요일 숫자 → 로케일 짧은 이름("월"/"月"/"Mon"). */
export function weekdayShortName(weekday: number, locale: Locale): string {
  return formatWeekday(weekday, localeTag(locale));
}

/** `custom:1,3,5` → "월·수·금". Thin wrapper so admin and mobile render the format identically. */
export function customWeekdayNames(rule: string | null, locale: Locale): string {
  return formatCustomWeekdays(rule, localeTag(locale));
}

export function repeatLabel(
  rule: string | null,
  anchorYmd: string | null,
  today: string,
  locale: Locale,
  d: AdminTasksDictionary,
): string {
  const anchor = anchorYmd ?? today;
  const customNames = customWeekdayNames(rule, locale);
  if (customNames) return fill(d.repCustomDays, { wd: customNames });
  switch (rule) {
    case "daily":
      return d.repDaily;
    case "weekly":
      return fill(d.repWeekly, { wd: weekdayForRepeat(anchor, locale) });
    case "weekdays":
      return d.repWeekdays;
    case "weekends":
      return d.repShortWeekends;
    case "monthly":
      return fill(d.repMonthly, { d: Number(anchor.split("-")[2]) });
    // 콘솔에서 새로 지정할 수는 없지만(REPEAT_RULES 제외) 모바일이 만든 값은 반드시 제대로 읽어야
    // 한다 — 이 분기가 없으면 `default` 로 떨어져 "반복 없음"이라고 거짓 표시된다(2026-07-30 수정).
    case "yearly":
      return fill(d.repYearly, {
        m: Number(anchor.split("-")[1]),
        d: Number(anchor.split("-")[2]),
      });
    case "custom":
      return d.repCustom;
    default:
      return d.repNone;
  }
}
export function repeatShort(
  rule: string | null,
  d: AdminTasksDictionary,
  locale?: Locale,
): string {
  // 행 칩은 공간이 좁아 요일 이름만 노출한다("월·수·금"). locale 없이 불리면 공용 라벨로 폴백.
  if (parseCustomWeekdays(rule)) {
    return locale ? customWeekdayNames(rule, locale) : d.repCustom;
  }
  switch (rule) {
    case "daily":
      return d.repDaily;
    case "weekly":
      return d.repShortWeekly;
    case "weekdays":
      return d.repShortWeekdays;
    case "weekends":
      return d.repShortWeekends;
    case "monthly":
      return d.repShortMonthly;
    case "yearly":
      return d.repShortYearly;
    case "custom":
      return d.repCustom;
    default:
      return "";
  }
}

// 기간(분) — 백엔드는 1–1440 자유값이지만 UI 는 프리셋만 제공. 라벨은 프리셋만 매핑.
export const DURATION_OPTIONS: { value: number | null; key: keyof AdminTasksDictionary }[] = [
  { value: null, key: "durNone" },
  { value: 15, key: "dur15" },
  { value: 30, key: "dur30" },
  { value: 60, key: "dur60" },
  { value: 120, key: "dur120" },
];
export function durLabel(mins: number | null, d: AdminTasksDictionary): string {
  if (mins == null) return "";
  const opt = DURATION_OPTIONS.find((o) => o.value === mins);
  return opt ? d[opt.key] : "";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
export function timeRange(timeLabel: string | null, dur: number | null): string | null {
  if (!timeLabel) return null;
  if (!dur) return timeLabel;
  const [h, m] = timeLabel.split(":").map(Number);
  const total = h * 60 + m + dur;
  const end = `${pad2(Math.floor((total % 1440) / 60))}:${pad2(total % 60)}`;
  return `${timeLabel}–${end}`;
}

// ── 아바타(디자인 AV 팔레트) ────────────────────────────────────────────────────
const AV_ME = "#3a4c7a";
const AV_PALETTE = ["#8a5a2c", "#4b7a63", "#7a4b6a", "#9a6210", "#5a6a7a", "#6a4b8a", "#8a4b4b"];
export function avatarColor(id: string, meId: string): string {
  if (id === meId) return AV_ME;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
}
export function initial(name: string): string {
  const t = (name || "").trim();
  return t ? Array.from(t)[0] : "?";
}

// ── 연결된 컨텍스트 → 칩 배열 ────────────────────────────────────────────────────
export type CtxItem = { k: "building" | "bed" | "ticket" | "guest"; v: string; reservationId: string | null };
export function ctxItems(t: TaskRecord): CtxItem[] {
  const c = t.resolvedContext;
  if (!c) return [];
  const out: CtxItem[] = [];
  if (c.propertyName) out.push({ k: "building", v: c.propertyName, reservationId: null });
  if (c.roomLabel) out.push({ k: "bed", v: c.roomLabel, reservationId: null });
  if (c.guestName) out.push({ k: "guest", v: c.guestName, reservationId: null });
  if (c.reservationId) {
    const range = [c.checkinDate, c.checkoutDate].filter(Boolean).join(" → ");
    out.push({ k: "ticket", v: range || c.channel || c.reservationId, reservationId: c.reservationId });
  }
  return out;
}

// ── 검색/우선순위/날짜 필터 ─────────────────────────────────────────────────────
export type DateFilterKey = "today" | "week" | "overdue" | "nodate";
export function matchQuery(t: TaskRecord, q: string, nameOf: (id: string) => string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (t.title.toLowerCase().includes(needle)) return true;
  if (nameOf(t.createdByUserId).toLowerCase().includes(needle)) return true;
  return t.tags.some((g) => g.toLowerCase().includes(needle));
}
export function matchPrio(t: TaskRecord, prio: string): boolean {
  return !prio || t.priority === prio;
}
export function matchDate(t: TaskRecord, key: DateFilterKey | null, today: string): boolean {
  if (!key) return true;
  const d = dateOf(t);
  if (key === "nodate") return !d;
  if (key === "overdue") return isOverdue(t, today);
  if (key === "today") return d === today;
  if (key === "week") {
    const end = addDays(today, 6);
    return !!d && d >= today && d <= end;
  }
  return true;
}
