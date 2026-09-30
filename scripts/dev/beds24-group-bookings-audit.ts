/**
 * Beds24 그룹(다객실) 예약 누락 감사 — **기본은 읽기 전용** (2026-10-01).
 *
 * Booking.com 다객실 예약은 방마다 Beds24 예약이 따로 있고(`masterId` 로 묶임) 채널 번호
 * (`apiReference`)는 하나다. 2026-10-01 이전 코드는 채널 번호로 「같은 예약」을 판단해 그 방들을
 * 한 행으로 합쳐 버렸다(`docs/planning/06-current-status.md` → 2026-10-01). 이 스크립트는 기간 안의
 * 그룹 예약을 Beds24 에서 읽고, **각 예약(Beds24 id)이 우리 `reservations` 에 자기 행을 갖고 있는지**
 * 대조한다.
 *
 * ```bash
 * npx tsx scripts/dev/beds24-group-bookings-audit.ts                       # 드라이런(읽기 전용)
 * npx tsx scripts/dev/beds24-group-bookings-audit.ts --from 2026-07-01 --to 2027-10-01
 * npx tsx scripts/dev/beds24-group-bookings-audit.ts --json                # 목록을 JSON 으로
 * npx tsx scripts/dev/beds24-group-bookings-audit.ts --apply               # 누락분 복구(쓰기!)
 * ```
 *
 * - 기본 기간: 도쿄 기준 (어제 − 90일) ~ (오늘 + 365일). 체류가 기간과 겹치는 예약.
 * - Beds24 호출: 활성 1회 + 취소 1회(각각 페이지 수만큼). 크레딧을 거의 쓰지 않는다.
 * - Beds24 에는 **절대 쓰지 않는다.** `--apply` 도 우리 DB 에만 쓴다.
 * - `--apply` 는 **고친 백필 코드 경로**(`backfillBeds24Reservations`, 기간 명시)를 그대로 태운다 —
 *   별도 upsert 로직을 두지 않는다. 기간 명시 백필이라 증분 커서는 건드리지 않는다.
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
import { createClient } from "@supabase/supabase-js";
import { extractBeds24BookingCandidates } from "@/lib/beds24/booking-payload";
import { readBeds24MasterId, readBeds24OwnBookingId } from "@/lib/beds24/reservation-id";
import { resolveReservationStatusFromBeds24Record } from "@/lib/beds24/reservation-status";
import { backfillBeds24Reservations } from "@/lib/beds24/reservations-backfill";
import type { Database } from "@/types/database";

type JsonRecord = Record<string, unknown>;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const AS_JSON = args.includes("--json");
function argValue(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function tokyoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function addDays(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const isDateKey = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

const today = tokyoToday();
const from = isDateKey(argValue("--from")) ? argValue("--from")! : addDays(today, -91);
const toExclusive = isDateKey(argValue("--to")) ? argValue("--to")! : addDays(today, 365);

function str(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

async function getToken(base: string) {
  const refreshToken = process.env.BEDS24_API_REFRESH_TOKEN?.trim();
  if (refreshToken) {
    const response = await fetch(`${base}/authentication/token`, {
      headers: { accept: "application/json", refreshToken },
    });
    if (response.ok) {
      const json = (await response.json()) as { token?: string };
      if (json.token) return json.token;
    }
  }
  const token = process.env.BEDS24_API_TOKEN?.trim();
  if (!token) throw new Error("Beds24 토큰을 얻지 못했다 (BEDS24_API_REFRESH_TOKEN / BEDS24_API_TOKEN).");
  return token;
}

async function fetchAll(url: string, token: string) {
  const rows: JsonRecord[] = [];
  let next: string | null = url;
  let pages = 0;
  let lastRemaining: string | null = null;
  while (next && pages < 50) {
    pages += 1;
    const response = await fetch(next, { headers: { accept: "application/json", token } });
    lastRemaining = response.headers.get("x-five-min-limit-remaining") ?? lastRemaining;
    if (!response.ok) throw new Error(`Beds24 ${response.status} on page ${pages}`);
    const json = (await response.json()) as { pages?: { nextPageExists?: boolean; nextPageLink?: string } };
    rows.push(...extractBeds24BookingCandidates(json));
    next = json.pages?.nextPageExists && json.pages.nextPageLink ? json.pages.nextPageLink : null;
  }
  return { rows, pages, lastRemaining };
}

async function main() {
  const base = process.env.BEDS24_API_BASE_URL!.replace(/\/$/, "");
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const token = await getToken(base);
  const query = `arrivalTo=${toExclusive}&departureFrom=${from}&includeInvoiceItems=false`;
  const active = await fetchAll(`${base}/bookings?${query}`, token);
  const cancelled = await fetchAll(`${base}/bookings?${query}&status=cancelled`, token);

  const byId = new Map<string, JsonRecord>();
  for (const row of [...active.rows, ...cancelled.rows]) {
    const id = readBeds24OwnBookingId(row);
    if (id && !byId.has(id)) byId.set(id, row);
  }
  const bookings = [...byId.values()];

  // 그룹 판정: masterId 가 있거나, 누군가의 masterId 이거나, 채널 번호를 다른 예약과 공유한다.
  const masterIds = new Set(bookings.map((b) => readBeds24MasterId(b)).filter(Boolean) as string[]);
  const refCount = new Map<string, number>();
  for (const booking of bookings) {
    const ref = str(booking, "apiReference");
    if (ref) refCount.set(ref, (refCount.get(ref) ?? 0) + 1);
  }
  const group = bookings.filter((booking) => {
    const id = readBeds24OwnBookingId(booking)!;
    const ref = str(booking, "apiReference");
    return !!readBeds24MasterId(booking) || masterIds.has(id) || (!!ref && (refCount.get(ref) ?? 0) > 1);
  });

  // 우리 행: raw_payload 의 Beds24 id 로 찾는다(키 형식과 무관하게).
  const groupIds = group.map((b) => readBeds24OwnBookingId(b)!);
  const rowsById = new Map<string, Array<{ status: string; room_label: string; source_reservation_id: string }>>();
  for (let offset = 0; offset < groupIds.length; offset += 150) {
    const chunk = groupIds.slice(offset, offset + 150);
    const result = await supabase
      .from("reservations")
      .select("source_reservation_id, status, room_label, rid:raw_payload->>id")
      .in("raw_payload->>id", chunk);
    if (result.error) throw new Error(result.error.message);
    for (const row of (result.data ?? []) as unknown as Array<{
      rid: string;
      status: string;
      room_label: string;
      source_reservation_id: string;
    }>) {
      const list = rowsById.get(row.rid) ?? [];
      list.push(row);
      rowsById.set(row.rid, list);
    }
  }

  const rooms = await supabase.from("rooms").select("external_room_id, room_label, properties(name)");
  const roomByExternal = new Map<string, string>();
  for (const room of (rooms.data ?? []) as unknown as Array<{
    external_room_id: string | null;
    room_label: string;
    properties: { name: string } | { name: string }[] | null;
  }>) {
    if (!room.external_room_id) continue;
    const property = Array.isArray(room.properties) ? room.properties[0] : room.properties;
    roomByExternal.set(room.external_room_id, `${property?.name ?? "?"} ${room.room_label}`);
  }

  const report = group
    .map((booking) => {
      const id = readBeds24OwnBookingId(booking)!;
      const status = resolveReservationStatusFromBeds24Record(booking);
      const rows = rowsById.get(id) ?? [];
      return {
        bookingId: id,
        masterId: readBeds24MasterId(booking),
        apiReference: str(booking, "apiReference"),
        propertyId: str(booking, "propertyId"),
        room: roomByExternal.get(str(booking, "roomId") ?? "") ?? `roomId ${str(booking, "roomId")}`,
        arrival: str(booking, "arrival"),
        departure: str(booking, "departure"),
        price: str(booking, "price"),
        referer: str(booking, "referer") ?? str(booking, "channel"),
        beds24Status: status,
        ourRows: rows.map((r) => `${r.source_reservation_id} (${r.status})`),
        missing: rows.length === 0,
        statusMismatch: rows.length > 0 && !rows.some((r) => r.status === status),
      };
    })
    .sort((a, b) => (a.arrival ?? "").localeCompare(b.arrival ?? "") || a.bookingId.localeCompare(b.bookingId));

  const missing = report.filter((r) => r.missing);
  const missingActive = missing.filter((r) => r.beds24Status !== "cancelled");

  console.log(`기간(도쿄): ${from} ~ ${toExclusive} (끝 제외)`);
  console.log(
    `Beds24 예약 ${bookings.length}건 (활성 ${active.pages}p · 취소 ${cancelled.pages}p, 남은 5분 크레딧 ${cancelled.lastRemaining ?? "?"})`,
  );
  console.log(`그룹 예약 ${report.length}건 · 그룹 수 ${new Set(report.map((r) => r.masterId ?? r.bookingId)).size}`);
  console.log(`우리 행 없음 ${missing.length}건 (그중 활성 ${missingActive.length}건)`);
  console.log(`행은 있으나 상태 불일치 ${report.filter((r) => r.statusMismatch).length}건`);

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const r of missing) {
      console.log(
        `  MISSING  id=${r.bookingId} master=${r.masterId ?? "-"} ref=${r.apiReference ?? "-"} ` +
          `${r.room} ${r.arrival}→${r.departure} price=${r.price ?? "-"} ${r.beds24Status}`,
      );
    }
    for (const r of report.filter((x) => x.statusMismatch)) {
      console.log(`  STATUS   id=${r.bookingId} beds24=${r.beds24Status} ours=${r.ourRows.join(", ")}`);
    }
  }

  if (!APPLY) {
    console.log("\n드라이런 — 아무것도 쓰지 않았다. 복구하려면 --apply (우리 DB 에만 쓴다).");
    return;
  }
  if (missing.length === 0) {
    console.log("\n누락 없음 — --apply 할 것이 없다.");
    return;
  }
  console.log("\n--apply: 고친 백필 경로로 기간을 다시 받는다 (Beds24 읽기 · 우리 DB upsert)…");
  const result = await backfillBeds24Reservations(supabase, { from, toExclusive });
  console.log({
    fetchedRows: result.fetchedRows,
    upsertedRows: result.upsertedRows,
    skippedRows: result.skippedRows,
    recoveredRows: result.recoveredRows,
    skipped: result.skipped,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
