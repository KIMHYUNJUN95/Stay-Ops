// Admin Todoist 콘솔 — 클라이언트 안전 헬퍼(날짜/술어/포맷/아바타).
// @/lib/tasks 는 server-only 이므로 여기서 Tokyo 날짜 계산·술어·라벨을 독립 정의한다.
// 라벨은 전부 getAdminTasksDictionary(locale) 를 통해 다국어로만 렌더한다(하드코딩 금지).
import type { Locale } from "@/lib/i18n";
import type { TaskRecord } from "@/lib/tasks";
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
export function isOverdue(t: TaskRecord, today: string): boolean {
  const d = dueDateOf(t);
  return isActive(t) && !!d && d < today;
}
export function isTodayTask(t: TaskRecord, today: string): boolean {
  return (
    isActive(t) && !isOverdue(t, today) && (t.scheduledDate === today || dueDateOf(t) === today)
  );
}
export function isTomorrowTask(t: TaskRecord, today: string): boolean {
  const tm = addDays(today, 1);
  return isActive(t) && (t.scheduledDate === tm || dueDateOf(t) === tm);
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

// 백엔드 지원 반복 규칙(yearly 미지원, custom 은 round-trip 전용).
export const REPEAT_RULES = ["none", "daily", "weekly", "weekdays", "weekends", "monthly"] as const;
export type RepeatRule = (typeof REPEAT_RULES)[number];

export function repeatLabel(
  rule: string | null,
  anchorYmd: string | null,
  today: string,
  locale: Locale,
  d: AdminTasksDictionary,
): string {
  const anchor = anchorYmd ?? today;
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
    case "custom":
      return d.repCustom;
    default:
      return d.repNone;
  }
}
export function repeatShort(rule: string | null, d: AdminTasksDictionary): string {
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
