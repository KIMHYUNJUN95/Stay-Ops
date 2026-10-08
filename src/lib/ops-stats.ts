import "server-only";

import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";
import { readOpsSalesInputs } from "@/lib/ops-calendar";
import { buildOpsSalesSummary, isSalesCountedReservation, type SalesRawPayload } from "@/lib/ops-sales-summary";
import { readAllPages } from "@/lib/supabase/read-all-pages";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * 객실 × 월 집계 표(`ops_room_month_stats`) — 만들기 · 확인하기 · 읽기. **서버 전용**(service role).
 *
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「객실 × 월 집계 표」 · 마이그레이션 `202610080002`
 *
 * 계산은 매출 화면이 쓰던 **그 함수 그대로**(`readOpsSalesInputs` → `buildOpsSalesSummary`, 마이너스 금액 포함)를 달마다 돌려
 * 객실 행으로 저장한다. 어느 달을 다시 계산할지는 DB 트리거가 적는다(예약 전 · 후 날짜의 달, 객실 목록 변경 = 전부).
 * 읽는 쪽은 `ensureOpsStatsMonths` 로 dirty · 없는 · 판이 다른 달을 먼저 계산한 뒤 읽는다 — 낡은 숫자가 나올 수 없다.
 */

/** 계산 규칙 판. 규칙(식 · 객실 축)이 바뀌면 올린다 — 판이 다른 달은 다시 계산된다. */
export const OPS_STATS_VERSION = 1;

/** dirty 를 지울 때 이만큼 앞의 표시까지만 지운다 — 앱 서버와 DB 시계가 조금 달라도 계산 중에 온 표시를 지우지 않게. */
const CLEAR_MARGIN_MS = 10_000;

type Client = SupabaseClient<Database>;

export type OpsStatsRow = {
  month: string; // YYYY-MM
  roomKey: string;
  propertyName: string;
  roomLabel: string;
  inCatalog: boolean;
  revenue: number;
  commission: number;
  occupiedNights: number;
  availableNights: number;
  airbnb: number;
  booking: number;
  direct: number;
  other: number;
  firstCheckIn: string | null;
};

const monthDate = (month: string) => `${month}-01`;

/** 붙은 달끼리 묶는다 — 한 번 읽어 여러 달을 계산하게. */
function contiguousRuns(months: readonly string[]): string[][] {
  const sorted = [...new Set(months)].sort();
  const runs: string[][] = [];
  for (const month of sorted) {
    const last = runs.at(-1);
    if (last && shiftMonthKey(last.at(-1)!, 1) === month) last.push(month);
    else runs.push([month]);
  }
  return runs;
}

/**
 * 달들을 다시 계산해 표에 쓴다. 계산 중에 새로 dirty 가 된 달은 dirty 로 남는다(다음 확인이 또 계산한다).
 * @returns 계산한 달 수
 */
export async function buildOpsStatsMonths(supabase: Client, organizationId: string, months: readonly string[]): Promise<number> {
  if (months.length === 0) return 0;
  const cutoff = new Date(Date.now() - CLEAR_MARGIN_MS).toISOString();
  for (const run of contiguousRuns(months)) {
    const window = { endExclusive: monthDate(shiftMonthKey(run.at(-1)!, 1)), start: monthDate(run[0]) };
    const inputs = await readOpsSalesInputs({ concurrency: 6, organizationId, properties: [], supabase, window, withBlocks: false });
    const reservations = inputs.reservations.map((r) => ({ ...r, raw: r.raw as SalesRawPayload }));
    const rows: Database["public"]["Tables"]["ops_room_month_stats"]["Insert"][] = [];
    for (const month of run) {
      const start = monthDate(month);
      const endExclusive = monthDate(shiftMonthKey(month, 1));
      const overlapping = reservations.filter((r) => r.checkIn < endExclusive && r.checkOut > start);
      const summary = buildOpsSalesSummary({
        blocks: [],
        endExclusive,
        negativeAmounts: "include",
        properties: inputs.properties,
        reservations: overlapping,
        rooms: inputs.rooms,
        start,
        today: start,
      });
      // 그 달에 체크인한 확정 예약 중 가장 이른 날 — 객실 첫 판매일 재료.
      const firstCheckIn = new Map<string, string>();
      for (const r of overlapping) {
        if (r.checkIn < start || r.checkIn >= endExclusive || r.checkOut <= r.checkIn) continue;
        if (!isSalesCountedReservation(r) || String(r.raw.status).toLowerCase() === "black") continue;
        const seen = firstCheckIn.get(r.roomKey);
        if (!seen || r.checkIn < seen) firstCheckIn.set(r.roomKey, r.checkIn);
      }
      for (const property of summary.byProperty) {
        for (const room of property.rooms) {
          if (!room.inCatalog && room.revenue === 0 && room.occupiedNights === 0) continue;
          rows.push({
            airbnb: room.channelRevenue.airbnb,
            available_nights: room.availableNights,
            booking: room.channelRevenue.booking,
            commission: room.commission,
            direct: room.channelRevenue.direct,
            first_check_in: firstCheckIn.get(room.key) ?? null,
            in_catalog: room.inCatalog,
            month: start,
            occupied_nights: room.occupiedNights,
            organization_id: organizationId,
            other: room.channelRevenue.other,
            property_name: property.propertyName,
            revenue: room.revenue,
            room_key: room.key,
            room_label: room.label,
          });
        }
      }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const result = await supabase.from("ops_room_month_stats").upsert(rows.slice(i, i + 500), { onConflict: "organization_id,month,room_key" });
      if (result.error) throw new Error(`ops stats upsert: ${result.error.message}`);
    }
    // 이번 계산에 없는 객실 행은 지운다(목록에서 빠진 방 · 매출이 없어진 목록 밖 방).
    const kept = new Set(rows.map((row) => `${row.month}|${row.room_key}`));
    const existing = await readAllPages<{ month: string; room_key: string }>((from, to) =>
      supabase
        .from("ops_room_month_stats")
        .select("month, room_key")
        .eq("organization_id", organizationId)
        .gte("month", window.start)
        .lt("month", window.endExclusive)
        .order("month")
        .order("room_key")
        .range(from, to),
    );
    if (existing.error) throw new Error(`ops stats read keys: ${existing.error.message}`);
    const stale = existing.data.filter((row) => !kept.has(`${row.month}|${row.room_key}`));
    for (const row of stale) {
      const result = await supabase
        .from("ops_room_month_stats")
        .delete()
        .eq("organization_id", organizationId)
        .eq("month", row.month)
        .eq("room_key", row.room_key);
      if (result.error) throw new Error(`ops stats delete: ${result.error.message}`);
    }
    const runDates = run.map(monthDate);
    // 표에 없던 달은 표시 시각을 아주 옛날로 넣는다 — 아래 「계산 시작 전 표시만 지우기」에 같이 걸리게.
    const seed = await supabase
      .from("ops_stats_months")
      .upsert(
        runDates.map((month) => ({ dirty: true, dirty_at: "1970-01-01T00:00:00Z", month, organization_id: organizationId })),
        { ignoreDuplicates: true, onConflict: "organization_id,month" },
      );
    if (seed.error) throw new Error(`ops stats months seed: ${seed.error.message}`);
    const stamp = await supabase
      .from("ops_stats_months")
      .update({ built_at: new Date().toISOString(), version: OPS_STATS_VERSION })
      .eq("organization_id", organizationId)
      .in("month", runDates);
    if (stamp.error) throw new Error(`ops stats months stamp: ${stamp.error.message}`);
    // 계산을 시작하기 전에 적힌 표시만 지운다 — 계산 중에 트리거가 다시 적은 달은 dirty 로 남아 다음에 또 계산된다.
    const clear = await supabase
      .from("ops_stats_months")
      .update({ dirty: false })
      .eq("organization_id", organizationId)
      .in("month", runDates)
      .lte("dirty_at", cutoff);
    if (clear.error) throw new Error(`ops stats months clear: ${clear.error.message}`);
  }
  return months.length;
}

/** 이 달들이 표에 최신으로 있는가 — 없거나 dirty 거나 판이 다르면 지금 계산한다. */
export async function ensureOpsStatsMonths(supabase: Client, organizationId: string, months: readonly string[]): Promise<number> {
  const wanted = [...new Set(months)];
  if (wanted.length === 0) return 0;
  const result = await supabase
    .from("ops_stats_months")
    .select("month, version, dirty")
    .eq("organization_id", organizationId)
    .in("month", wanted.map(monthDate));
  if (result.error) throw new Error(`ops stats months read: ${result.error.message}`);
  const fresh = new Set(
    (result.data ?? []).filter((row) => !row.dirty && row.version === OPS_STATS_VERSION).map((row) => String(row.month).slice(0, 7)),
  );
  const need = wanted.filter((month) => !fresh.has(month));
  return buildOpsStatsMonths(supabase, organizationId, need);
}

export async function readOpsStatsRows(supabase: Client, organizationId: string, months: readonly string[]): Promise<OpsStatsRow[]> {
  const wanted = [...new Set(months)].sort();
  if (wanted.length === 0) return [];
  const rows: OpsStatsRow[] = [];
  // `in` 목록이 길어지지 않게 붙은 달끼리 범위로 읽는다.
  const runs = contiguousRuns(wanted);
  const results = await Promise.all(
    runs.map((run) =>
      readAllPages<Database["public"]["Tables"]["ops_room_month_stats"]["Row"]>(
        (from, to) =>
          supabase
            .from("ops_room_month_stats")
            .select("*")
            .eq("organization_id", organizationId)
            .gte("month", monthDate(run[0]))
            .lt("month", monthDate(shiftMonthKey(run.at(-1)!, 1)))
            .order("month")
            .order("room_key")
            .range(from, to),
        { concurrency: 4 },
      ),
    ),
  );
  for (const result of results) {
    if (result.error) throw new Error(`ops stats read: ${result.error.message}`);
    for (const row of result.data) {
      rows.push({
        airbnb: Number(row.airbnb),
        availableNights: row.available_nights,
        booking: Number(row.booking),
        commission: Number(row.commission),
        direct: Number(row.direct),
        firstCheckIn: row.first_check_in,
        inCatalog: row.in_catalog,
        month: String(row.month).slice(0, 7),
        occupiedNights: row.occupied_nights,
        other: Number(row.other),
        propertyName: row.property_name,
        revenue: Number(row.revenue),
        roomKey: row.room_key,
        roomLabel: row.room_label,
      });
    }
  }
  return rows;
}

/** 이 조직 예약 기록의 첫 달(예약이 하나도 없으면 `null`). */
export async function firstReservationMonth(supabase: Client, organizationId: string): Promise<string | null> {
  const result = await supabase
    .from("reservations")
    .select("check_in_date")
    .eq("organization_id", organizationId)
    .order("check_in_date", { ascending: true })
    .limit(1);
  if (result.error) throw new Error(`first reservation: ${result.error.message}`);
  return result.data?.[0]?.check_in_date?.slice(0, 7) ?? null;
}

/** dirty 달을 오래된 표시부터 최대 `limit` 개 — 1분 틱이 미리 계산한다. */
export async function processDirtyOpsStats(supabase: Client, limit: number): Promise<Array<{ organizationId: string; months: number }>> {
  const dirty = await supabase
    .from("ops_stats_months")
    .select("organization_id, month")
    .eq("dirty", true)
    .order("dirty_at", { ascending: true })
    .limit(limit);
  if (dirty.error) throw new Error(`ops stats dirty read: ${dirty.error.message}`);
  const byOrg = new Map<string, string[]>();
  for (const row of dirty.data ?? []) {
    const list = byOrg.get(row.organization_id) ?? [];
    list.push(String(row.month).slice(0, 7));
    byOrg.set(row.organization_id, list);
  }
  const done: Array<{ organizationId: string; months: number }> = [];
  for (const [organizationId, months] of byOrg) {
    done.push({ months: await buildOpsStatsMonths(supabase, organizationId, months), organizationId });
  }
  return done;
}
