// Shared domain constants + pure formatting helpers for the admin cleaning console. Real task/
// history data comes from src/lib/admin-cleaning.ts (server) as of 2026-07-14 — this module only
// keeps the stable domain facts (canonical building set, its fixed display order) and small
// client-safe date/duration formatters reused across the today board, history board, detail panel,
// and force-complete modal. See docs/product/07-cleaning-workflow.md →
// "2026-07-14 어드민 청소 대시보드 — 백엔드 연동".

export type BuildingKey =
  | "arakicho_a"
  | "arakicho_b"
  | "kabukicho"
  | "takadanobaba"
  | "okubo_a"
  | "okubo_b"
  | "okubo_c";

export const BUILDING_ORDER: BuildingKey[] = [
  "arakicho_a",
  "arakicho_b",
  "kabukicho",
  "takadanobaba",
  "okubo_a",
  "okubo_b",
  "okubo_c",
];

export type CleaningTaskType = "checkout" | "simple" | "longstay" | "setup";

/* ---------------- helpers ---------------- */
export function toMin(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fmtDur(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
export function todayDateKeyTokyo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
export function nowMinutesTokyo(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}
export function nowLabelTokyo(): string {
  const min = nowMinutesTokyo();
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function elapsedMin(start: string | null): number | null {
  const s = toMin(start);
  return s == null ? null : nowMinutesTokyo() - s;
}
export function durationMin(start: string | null, end: string | null): number | null {
  const s = toMin(start);
  const e = toMin(end);
  return s == null || e == null ? null : e - s;
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
export function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
export function monthRange(y: number, m: number): { from: string; to: string } {
  return { from: iso(y, m, 1), to: iso(y, m, new Date(y, m + 1, 0).getDate()) };
}
export function fmtDate(dateKey: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dateKey}T00:00:00+09:00`));
}
