import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { ExportCsvLink } from "@/components/admin/export-csv-link";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAdminSession } from "@/lib/admin-session";
import { getDictionary } from "@/lib/i18n";
import {
  getCanonicalPropertyName,
  getDisplayRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";
import {
  buildPropertyRoomLookups,
  getActiveRoomCatalog,
  getActiveRoomLabels,
} from "@/lib/rooms";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// ─── types ──────────────────────────────────────────────────────────────────

type ReservationStatus = Database["public"]["Enums"]["reservation_status"];
type ReservationRow = Pick<
  Database["public"]["Tables"]["reservations"]["Row"],
  | "id"
  | "check_in_date"
  | "check_out_date"
  | "guest_name"
  | "property_name"
  | "room_label"
  | "status"
  | "raw_payload"
>;

type CalItem = {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  guestName: string;
  propertyName: string;
  roomLabel: string;
  roomKey: string;
  status: ReservationStatus;
};

const ROOM_AXIS_KEY_SEP = "::";

type RoomAxisRow = {
  key: string;
  propertyName: string;
  displayRoomLabel: string;
  label: string;
};

function toRoomAxisKey(propertyName: string, displayRoomLabel: string) {
  return `${propertyName}${ROOM_AXIS_KEY_SEP}${displayRoomLabel}`;
}

function buildAdminRoomAxisRows(
  roomCatalog: Awaited<ReturnType<typeof getActiveRoomCatalog>>,
  effectiveProperty: string | null,
  locale: "ko" | "ja" | "en",
): RoomAxisRow[] {
  const byKey = new Map<string, RoomAxisRow>();

  for (const entry of roomCatalog ?? []) {
    if (isExcludedOperationalProperty(entry.propertyName)) continue;
    if (effectiveProperty && entry.propertyName !== effectiveProperty) continue;

    const key = toRoomAxisKey(entry.propertyName, entry.displayRoomLabel);
    if (byKey.has(key)) continue;

    byKey.set(key, {
      key,
      propertyName: entry.propertyName,
      displayRoomLabel: entry.displayRoomLabel,
      label: effectiveProperty
        ? entry.displayRoomLabel
        : `${localizeProperty(entry.propertyName, locale)} / ${entry.displayRoomLabel}`,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const ai = BUILDING_ORDER.indexOf(a.propertyName as (typeof BUILDING_ORDER)[number]);
    const bi = BUILDING_ORDER.indexOf(b.propertyName as (typeof BUILDING_ORDER)[number]);
    if (ai !== bi) {
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      const propertyCompare = a.propertyName.localeCompare(b.propertyName, "ko");
      if (propertyCompare !== 0) return propertyCompare;
    }
    return a.displayRoomLabel.localeCompare(b.displayRoomLabel, "ko", { numeric: true });
  });
}

type DayCell = { guestName: string; status: ReservationStatus; id: string } | null;

// ─── helpers ─────────────────────────────────────────────────────────────────

// i18n-ignore-start: canonical building-name domain keys (room-label normalization), not UI copy.
const BUILDING_ORDER = [
  "아라키초A", "아라키초B", "가부키초", "다카다노바바",
  "오쿠보A", "오쿠보B", "오쿠보C",
] as const;
// i18n-ignore-end

const PROPERTY_LABELS: Record<string, { en: string; ja: string; ko: string }> = {
  "아라키초A": { en: "ArakichoA", ja: "荒木町A", ko: "아라키초A" },
  "아라키초B": { en: "ArakichoB", ja: "荒木町B", ko: "아라키초B" },
  "가부키초": { en: "Kabukicho", ja: "歌舞伎町", ko: "가부키초" },
  "다카다노바바": { en: "Takadanobaba", ja: "高田馬場", ko: "다카다노바바" },
  "오쿠보A": { en: "OkuboA", ja: "大久保A", ko: "오쿠보A" },
  "오쿠보B": { en: "OkuboB", ja: "大久保B", ko: "오쿠보B" },
  "오쿠보C": { en: "OkuboC", ja: "大久保C", ko: "오쿠보C" },
};

function localizeProperty(name: string, locale: "ko" | "ja" | "en") {
  return PROPERTY_LABELS[name]?.[locale] ?? name;
}

function toJstDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function isValidMonth(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function buildDates(monthStr: string): string[] {
  const [y, m] = monthStr.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => {
    const d = i + 1;
    return `${monthStr}-${String(d).padStart(2, "0")}`;
  });
}

function sortBuildings(arr: string[]) {
  return [...arr].sort((a, b) => {
    const ai = BUILDING_ORDER.indexOf(a as (typeof BUILDING_ORDER)[number]);
    const bi = BUILDING_ORDER.indexOf(b as (typeof BUILDING_ORDER)[number]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

function normalizePropertyParam(v: string | undefined): string | null {
  if (!v) return null;
  const c = getCanonicalPropertyName(v.trim());
  return c.length > 0 ? c : null;
}

const STATUS_CELL: Record<ReservationStatus, string> = {
  confirmed:   "bg-blue-100 text-blue-800",
  checked_in:  "bg-green-100 text-green-800",
  checked_out: "bg-slate-100 text-slate-600",
  cancelled:   "bg-red-50 text-red-400 line-through",
  no_show:     "bg-rose-50 text-rose-400",
};

const STATUS_BADGE: Record<ReservationStatus, string> = {
  confirmed:   "border-blue-200 bg-blue-50 text-blue-700",
  checked_in:  "border-green-200 bg-green-50 text-green-700",
  checked_out: "border-border bg-muted/50 text-muted-foreground",
  cancelled:   "border-red-200 bg-red-50 text-red-600",
  no_show:     "border-rose-200 bg-rose-50 text-rose-600",
};

// ─── page ────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams: Promise<{ month?: string; property?: string }>;
};

export default async function AdminCalendarPage({ searchParams }: PageProps) {
  const [session, params] = await Promise.all([requireAdminSession(), searchParams]);

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.admin.calendar;
  const statusLabels = dict.admin.reservationStatusLabels;
  const stats = dict.admin.stats;

  // ── month / property params ──────────────────────────────────────────────
  const today = toJstDateString(new Date());
  const currentMonth = today.slice(0, 7);
  const selectedMonth = isValidMonth(params.month) ? params.month : currentMonth;
  const selectedProperty = normalizePropertyParam(params.property);

  const [y, m] = selectedMonth.split("-").map(Number);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", timeZone: "Asia/Tokyo",
  }).format(new Date(`${selectedMonth}-01T00:00:00Z`));

  // ── operational window ───────────────────────────────────────────────────
  const [opY, opM] = currentMonth.split("-").map(Number);
  const opWindowStart = `${currentMonth}-01`;
  const opWindowEnd = new Date(Date.UTC(opY, opM + 1, 1)).toISOString().slice(0, 10);
  const nextJstMonth = new Date(Date.UTC(opY, opM, 1)).toISOString().slice(0, 7);
  const isOutOfWindow =
    selectedMonth !== currentMonth && selectedMonth !== nextJstMonth;

  const monthStart = `${selectedMonth}-01`;
  const monthEndExclusive = nextMonth + "-01";

  // ── fetch room catalog ───────────────────────────────────────────────────
  const supabase = await getSupabaseServerClient();
  const [roomCatalog, roomMasterRooms] = await Promise.all([
    getActiveRoomCatalog(session.organization.id, supabase),
    getActiveRoomLabels(session.organization.id, supabase),
  ]);

  // ── build property options ───────────────────────────────────────────────
  const propertyOptions: string[] = sortBuildings(
    [...new Set((roomCatalog ?? []).map((c) => c.propertyName))].filter(
      (p) => !isExcludedOperationalProperty(p),
    ),
  );

  const effectiveProperty =
    selectedProperty && propertyOptions.includes(selectedProperty)
      ? selectedProperty
      : null;

  const roomAxisRows = buildAdminRoomAxisRows(roomCatalog, effectiveProperty, locale);

  // ── fetch reservations ───────────────────────────────────────────────────
  const operationalItems: CalItem[] = [];
  const items: CalItem[] = [];

  if (!isOutOfWindow && !isNaN(y)) {
    const roomLookups = buildPropertyRoomLookups(roomCatalog ?? []);
    const globalExternalRoomToCanonical = new Map<string, string>(
      (roomCatalog ?? [])
        .filter((c) => c.externalRoomId !== null)
        .map((c) => [c.externalRoomId as string, c.canonicalRoomLabel]),
    );

    const { data } = await supabase
      .from("reservations")
      .select("id, check_in_date, check_out_date, guest_name, property_name, room_label, status, raw_payload")
      .eq("organization_id", session.organization.id)
      .lt("check_in_date", opWindowEnd)
      .gte("check_out_date", opWindowStart)
      .neq("status", "cancelled")
      .neq("status", "no_show")
      .order("check_in_date", { ascending: true });

    const rows = (data ?? []) as ReservationRow[];
    const isAuthoritative = roomMasterRooms !== undefined;

    for (const row of rows) {
      if (isExcludedOperationalProperty(row.property_name)) continue;
      if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;

      const canonicalProperty = getCanonicalPropertyName(row.property_name);
      const rawLabelMap = roomLookups.canonicalByRawLabel[canonicalProperty] ?? {};
      const externalIdMap = roomLookups.canonicalByExternalId[canonicalProperty] ?? {};

      // resolve internal room key (mirrors mobile calendar page logic)
      const payloadUnitId = (() => {
        if (!row.raw_payload || typeof row.raw_payload !== "object" || Array.isArray(row.raw_payload)) return null;
        const r = row.raw_payload as Record<string, unknown>;
        for (const k of ["roomId", "room_id", "unitId", "unit_id"]) {
          if (typeof r[k] === "string") return r[k] as string;
          if (typeof r[k] === "number") return String(r[k]);
        }
        return null;
      })();

      let internalKey: string | null = null;
      const allowed = roomLookups.allowedCanonicalByProperty[canonicalProperty] ?? new Set<string>();

      if (payloadUnitId) {
        const fromExternal =
          externalIdMap[payloadUnitId] ??
          globalExternalRoomToCanonical.get(payloadUnitId) ??
          null;
        if (fromExternal && allowed.has(fromExternal)) {
          internalKey = fromExternal;
        } else if (isAuthoritative && fromExternal) {
          continue;
        }
      }

      if (!internalKey) {
        const exactMatch = rawLabelMap[row.room_label];
        if (exactMatch && allowed.has(exactMatch)) {
          internalKey = exactMatch;
        }
      }

      if (!internalKey) {
        const normalized = (() => {
          try { return getDisplayRoomLabel(canonicalProperty, row.room_label); } catch { return row.room_label; }
        })();
        if (normalized && allowed.has(normalized)) {
          internalKey = normalized;
        } else if (isAuthoritative) {
          continue;
        } else {
          internalKey = normalized || row.room_label;
        }
      }

      const displayRoom = getDisplayRoomLabel(canonicalProperty, internalKey);

      if (effectiveProperty && canonicalProperty !== effectiveProperty) continue;

      const calItem: CalItem = {
        id: row.id,
        checkInDate: row.check_in_date,
        checkOutDate: row.check_out_date,
        guestName: row.guest_name,
        propertyName: canonicalProperty,
        roomLabel: displayRoom,
        roomKey: toRoomAxisKey(canonicalProperty, displayRoom),
        status: row.status,
      };

      operationalItems.push(calItem);

      if (row.check_in_date >= monthEndExclusive) continue;
      if (row.check_out_date <= monthStart) continue;

      items.push(calItem);
    }
  }

  // ── date axis ────────────────────────────────────────────────────────────
  const dates = buildDates(selectedMonth);
  // ── build room×day grid ──────────────────────────────────────────────────
  const byRoom = new Map<string, CalItem[]>();
  for (const item of items) {
    if (!byRoom.has(item.roomKey)) byRoom.set(item.roomKey, []);
    byRoom.get(item.roomKey)!.push(item);
  }

  function getDayCell(roomKey: string, dateStr: string): DayCell {
    const rsvs = byRoom.get(roomKey) ?? [];
    const hit = rsvs.find((r) => r.checkInDate <= dateStr && r.checkOutDate > dateStr);
    if (!hit) return null;
    return { guestName: hit.guestName, status: hit.status, id: hit.id };
  }

  // ── stats: operational window uses real today snapshot (not selected month day 1) ──
  const refDate = today;
  const checkInsToday = operationalItems.filter((r) => r.checkInDate === refDate);
  const checkOutsToday = operationalItems.filter((r) => r.checkOutDate === refDate);
  const stayingToday = operationalItems.filter(
    (r) => r.checkInDate <= refDate && r.checkOutDate > refDate,
  );

  const roomAxisKeys = roomAxisRows.map((row) => row.key);
  const occupiedSet = new Set(stayingToday.map((r) => r.roomKey));
  const emptyCount = Math.max(0, roomAxisKeys.filter((key) => !occupiedSet.has(key)).length);

  // ── nav hrefs ─────────────────────────────────────────────────────────────
  function calHref(month: string, property: string | null) {
    const p = new URLSearchParams({ month });
    if (property) p.set("property", property);
    return `/admin/calendar?${p.toString()}`;
  }

  return (
    <AdminShell activeItem="calendar" title={monthLabel}>
      <div className="space-y-6">

        {/* ── month navigation + property filter ─────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              href={calHref(prevMonth, effectiveProperty)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
            <span className="min-w-36 text-center text-base font-black">{monthLabel}</span>
            <Link
              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              href={calHref(nextMonth, effectiveProperty)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isOutOfWindow ? (
              <ExportCsvLink
                label={dict.common.exportCsv}
                resource="reservations"
                searchParams={{
                  month: selectedMonth,
                  property: effectiveProperty ?? undefined,
                }}
              />
            ) : null}
          </div>

          {/* Property selector */}
          <div className="flex flex-wrap gap-2">
            <Link
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                !effectiveProperty
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
              href={calHref(selectedMonth, null)}
            >
              {copy.allProperties}
            </Link>
            {propertyOptions.map((p) => (
              <Link
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  effectiveProperty === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
                href={calHref(selectedMonth, p)}
                key={p}
              >
                {localizeProperty(p, locale)}
              </Link>
            ))}
          </div>
        </div>

        {/* ── out-of-window notice ────────────────────────────────────── */}
        {isOutOfWindow && (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <CalendarDays className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-muted-foreground">{copy.outOfWindow}</p>
          </Card>
        )}

        {!isOutOfWindow && (
          <>
            {/* ── stats row ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: stats.checkIns, value: checkInsToday.length, color: "text-blue-700" },
                { label: stats.checkOuts, value: checkOutsToday.length, color: "text-slate-700" },
                { label: stats.stayingToday, value: stayingToday.length, color: "text-green-700" },
                { label: stats.emptyToday, value: emptyCount, color: "text-amber-700" },
              ].map(({ label, value, color }) => (
                <Card className="p-4" key={label}>
                  <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                  <p className={`mt-1 text-3xl font-black ${color}`}>{value}</p>
                </Card>
              ))}
            </div>

            {/* ── reservation grid ────────────────────────────────────── */}
            <Card className="overflow-hidden">
              {roomAxisRows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <CalendarDays className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-semibold text-muted-foreground">{copy.noActiveRooms}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-max border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="sticky left-0 z-10 min-w-[120px] border-r border-border bg-muted/40 px-3 py-2 text-left font-black text-muted-foreground">
                          {copy.room}
                        </th>
                        {dates.map((d) => {
                          const day = d.slice(8);
                          const isToday = d === today;
                          return (
                            <th
                              className={`min-w-[40px] px-1 py-2 text-center font-bold ${
                                isToday
                                  ? "bg-amber-50 text-amber-800"
                                  : "text-muted-foreground"
                              }`}
                              key={d}
                            >
                              {day}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {roomAxisRows.map((roomRow) => (
                        <tr className="border-b border-border last:border-0" key={roomRow.key}>
                          <td className="sticky left-0 z-10 border-r border-border bg-white px-3 py-1.5 font-black">
                            {roomRow.label}
                          </td>
                          {dates.map((d) => {
                            const cell = getDayCell(roomRow.key, d);
                            const isToday = d === today;
                            return (
                              <td
                                className={`px-0.5 py-1 text-center ${isToday ? "bg-amber-50/60" : ""}`}
                                key={d}
                              >
                                {cell ? (
                                  <span
                                    className={`inline-block w-full max-w-[38px] truncate rounded px-0.5 py-0.5 text-[10px] font-semibold leading-tight ${STATUS_CELL[cell.status]}`}
                                    title={`${cell.guestName} (${statusLabels[cell.status]})`}
                                  >
                                    {cell.guestName.slice(0, 4)}
                                  </span>
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* ── check-in / check-out lists ──────────────────────────── */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Check-ins */}
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-black">
                  {copy.checkIn}
                  <Badge className="border-blue-200 bg-blue-50 text-blue-700">{checkInsToday.length}</Badge>
                </h2>
                {checkInsToday.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <Card className="divide-y divide-border overflow-hidden">
                    {checkInsToday.map((r) => (
                      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm" key={r.id}>
                        <div className="min-w-0">
                          <p className="truncate font-black">{r.guestName}</p>
                          <p className="text-xs text-muted-foreground">
                            {localizeProperty(r.propertyName, locale)} · {r.roomLabel}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge className={STATUS_BADGE[r.status]}>{statusLabels[r.status]}</Badge>
                          <span className="text-xs text-muted-foreground">→ {r.checkOutDate.slice(5)}</span>
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </div>

              {/* Check-outs */}
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-black">
                  {copy.checkOut}
                  <Badge className="border-border bg-muted/50 text-muted-foreground">{checkOutsToday.length}</Badge>
                </h2>
                {checkOutsToday.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <Card className="divide-y divide-border overflow-hidden">
                    {checkOutsToday.map((r) => (
                      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm" key={r.id}>
                        <div className="min-w-0">
                          <p className="truncate font-black">{r.guestName}</p>
                          <p className="text-xs text-muted-foreground">
                            {localizeProperty(r.propertyName, locale)} · {r.roomLabel}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge className={STATUS_BADGE[r.status]}>{statusLabels[r.status]}</Badge>
                          <span className="text-xs text-muted-foreground">{r.checkInDate.slice(5)} →</span>
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
