import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Beds24HttpError,
  fetchBeds24Calendar,
  LOW_CREDIT_THRESHOLD,
  postBeds24Calendar,
  type CalendarRoomData,
} from "@/lib/beds24/calendar-client";
import { buildCalendarSegments, type CalendarDateValues } from "@/lib/beds24/calendar-write-payload";
import {
  isWithinCoalesceWindow,
  mergePriceJobRoomUpdates,
  type MergeableJob,
  type PriceJobRoomUpdate,
} from "@/lib/beds24/price-job-merge";
import {
  describeMismatches,
  diffCalendarReadback,
  toLinkedUnitExpectation,
  type CalendarReadSegment,
  type ExpectedDateValues,
} from "@/lib/beds24/price-write-verification";
import {
  acquireBeds24Lock,
  activateBeds24Cooldown,
  getBeds24Cooldown,
  PRICE_JOB_LOCK,
  PRICE_JOB_LOCK_TTL_MS,
  releaseBeds24Lock,
  shouldCooldownForCredit,
} from "@/lib/beds24/sync-locks";
import type { Database } from "@/types/database";

/**
 * 가격·최소숙박 작업 워커.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「작업 큐」·「쓰기 안전장치」
 * 원본: STAY ARI Manager `functions/index.js` — `processPriceJob`, `scheduledPriceJobWorker`
 *
 * ## 한 번에 하나만 돈다
 *
 * Beds24 V2 는 **계정 단위 5분 크레딧**을 예약·가격·캘린더가 함께 쓴다. 여러 작업이 동시에
 * POST 하면 주기 동기화·웹훅과 크레딧을 다투고 429 가 난다. 그래서 락 하나로 직렬화한다.
 *
 * ## 쓰고 나서 **반드시 다시 읽는다**
 *
 * Beds24 는 값을 반영하지 않고도 `success: true` 를 돌려준다. 되읽어 대조하지 않으면
 * 반영 실패가 「성공」으로 기록되고, 화면에는 바뀐 값이 뜨는데 채널에 나가는 가격은 옛것이다.
 */

const JOB_LOCK_OWNER = "price-job-worker";
/** 한 번에 Beds24 로 묶어 보낼 객실 수. 저쪽과 같다. */
const WRITE_BATCH_SIZE = 50;
/** 되읽기 한 번에 물어볼 객실 수. */
const VERIFY_BATCH_SIZE = 20;
/** 링크 전파에 시간이 걸린다 — 바로 안 맞으면 조금 쉬고 다시 읽는다. */
const VERIFY_ATTEMPTS = 3;
/** 15분 넘게 `processing` 이면 죽은 것으로 보고 되돌린다. */
const STUCK_JOB_MS = 15 * 60 * 1000;

type Client = SupabaseClient<Database>;

type JobRow = Database["public"]["Tables"]["beds24_price_jobs"]["Row"];

export type PriceJobOutcome =
  | { ran: false; reason: "cooldown" | "lock_busy" | "lock_error" | "empty" }
  | {
      ran: true;
      jobId: string;
      status: "completed" | "partial_failed" | "failed";
      coalescedJobIds: string[];
      succeeded: number;
      failed: number;
    };

function asRoomUpdates(value: unknown): PriceJobRoomUpdate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PriceJobRoomUpdate => {
    const record = entry as PriceJobRoomUpdate | null;
    return !!record && typeof record.externalRoomId === "string" && !!record.dates;
  });
}

function toReadSegments(room: CalendarRoomData | undefined): CalendarReadSegment[] {
  return (room?.calendar ?? []).map((entry) => ({
    from: String(entry.from ?? ""),
    minStay: (entry.minStay ?? null) as number | string | null,
    price1: (entry.price1 ?? null) as number | string | null,
    to: String(entry.to ?? ""),
  }));
}

/**
 * 멈춘 작업을 되돌린다.
 *
 * 서버리스에서는 **함수가 중간에 사라지는 일이 정상 범주다.** 되돌리지 않으면 그 작업은
 * 영영 `processing` 으로 남고, 사람은 「처리 중」만 보며 기다린다.
 */
async function recoverStuckJobs(supabase: Client): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_JOB_MS).toISOString();
  const result = await supabase
    .from("beds24_price_jobs")
    .update({ started_at: null, status: "queued" })
    .eq("status", "processing")
    .lt("started_at", cutoff)
    .select("id");
  if (result.error) {
    console.error("[beds24/price-job] stuck recovery failed", result.error);
    return 0;
  }
  const rows = (result.data ?? []) as Array<{ id: string }>;
  if (rows.length > 0) {
    console.warn("[beds24/price-job] 멈춘 작업 회수", { ids: rows.map((row) => row.id) });
  }
  return rows.length;
}

/**
 * 가장 오래된 `queued` 하나를 **원자적으로** 가져온다.
 *
 * 조건부 갱신이라 두 워커가 동시에 시도해도 하나만 가져간다 — 가져간 쪽만 행을 돌려받는다.
 */
async function claimNextJob(supabase: Client): Promise<JobRow | null> {
  const candidate = await supabase
    .from("beds24_price_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (candidate.error || !candidate.data) return null;

  const claimed = await supabase
    .from("beds24_price_jobs")
    .update({ started_at: new Date().toISOString(), status: "processing" })
    .eq("id", (candidate.data as { id: string }).id)
    // **여기가 원자성의 핵심** — 아직 queued 일 때만 내 것이 된다.
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimed.error || !claimed.data) return null;

  const row = claimed.data as JobRow;
  await supabase
    .from("beds24_price_jobs")
    .update({ attempt_count: row.attempt_count + 1 })
    .eq("id", row.id);
  return row;
}

/** 같은 건물·같은 종류의 `queued` 작업을 2분 창 안에서 흡수한다. */
async function absorbSiblingJobs(
  supabase: Client,
  job: JobRow,
): Promise<{ roomUpdates: PriceJobRoomUpdate[]; coalescedJobIds: string[] }> {
  const primary: MergeableJob = {
    createdAt: job.created_at,
    id: job.id,
    roomUpdates: asRoomUpdates(job.room_updates),
  };
  if (!job.property_id) return { coalescedJobIds: [], roomUpdates: primary.roomUpdates };

  const siblings = await supabase
    .from("beds24_price_jobs")
    .select("id, created_at, room_updates")
    .eq("status", "queued")
    .eq("organization_id", job.organization_id)
    .eq("property_id", job.property_id)
    .eq("job_type", job.job_type)
    .neq("id", job.id);
  if (siblings.error) return { coalescedJobIds: [], roomUpdates: primary.roomUpdates };

  const inWindow = ((siblings.data ?? []) as Array<{
    id: string;
    created_at: string;
    room_updates: unknown;
  }>).filter((row) => isWithinCoalesceWindow(job.created_at, row.created_at));
  if (inWindow.length === 0) return { coalescedJobIds: [], roomUpdates: primary.roomUpdates };

  // 흡수한다고 표시해 둔다 — 다른 워커가 같은 것을 또 집지 않게.
  const coalescedJobIds: string[] = [];
  for (const row of inWindow) {
    const taken = await supabase
      .from("beds24_price_jobs")
      .update({ started_at: new Date().toISOString(), status: "processing" })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!taken.error && taken.data) coalescedJobIds.push(row.id);
  }

  const merged = mergePriceJobRoomUpdates([
    primary,
    ...inWindow
      .filter((row) => coalescedJobIds.includes(row.id))
      .map((row) => ({
        createdAt: row.created_at,
        id: row.id,
        roomUpdates: asRoomUpdates(row.room_updates),
      })),
  ]);
  if (coalescedJobIds.length > 0) {
    console.log("[beds24/price-job] 합치기", { absorbed: coalescedJobIds, primary: job.id });
  }
  return { coalescedJobIds, roomUpdates: merged };
}

/** 되읽기 — 안 맞으면 잠깐 쉬고 다시. 링크 전파에 시간이 걸린다. */
async function verifyWrites(args: {
  expectationByRoomId: Map<string, Record<string, ExpectedDateValues>>;
  includeLinkedPrices: boolean;
}): Promise<Map<string, string>> {
  const roomIds = [...args.expectationByRoomId.keys()];
  const allDates = roomIds.flatMap((roomId) =>
    Object.keys(args.expectationByRoomId.get(roomId) ?? {}),
  );
  const errors = new Map<string, string>();
  if (roomIds.length === 0 || allDates.length === 0) return errors;

  const sorted = [...new Set(allDates)].sort();
  const startDate = sorted[0];
  const endDate = sorted[sorted.length - 1];

  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    errors.clear();
    const roomsById = new Map<string, CalendarRoomData>();
    let truncated = false;

    for (let index = 0; index < roomIds.length; index += VERIFY_BATCH_SIZE) {
      const chunk = roomIds.slice(index, index + VERIFY_BATCH_SIZE);
      const result = await fetchBeds24Calendar({
        endDate,
        externalRoomIds: chunk,
        includeLinkedPrices: args.includeLinkedPrices,
        includeMinStay: true,
        includePrices: true,
        startDate,
      });
      if ("skipped" in result) {
        for (const roomId of chunk) errors.set(roomId, `되읽기 실패: ${result.skipped}`);
        continue;
      }
      if (result.truncated) truncated = true;
      for (const [roomId, room] of result.roomsById) roomsById.set(roomId, room);
    }

    // **잘린 응답으로는 「일치한다」를 증명할 수 없다.** 검증 실패로 다룬다.
    if (truncated) {
      for (const roomId of roomIds) errors.set(roomId, "되읽기 응답이 잘렸습니다(쪽 넘김)");
      return errors;
    }

    for (const roomId of roomIds) {
      const mismatches = diffCalendarReadback({
        expected: args.expectationByRoomId.get(roomId) ?? {},
        segments: toReadSegments(roomsById.get(roomId)),
      });
      if (mismatches.length > 0) errors.set(roomId, describeMismatches(mismatches));
    }

    if (errors.size === 0) break;
    if (attempt < VERIFY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  return errors;
}

/**
 * 검증까지 끝난 값을 **우리 표에도** 반영한다.
 *
 * 다음 요금 동기화(최대 15분 뒤)를 기다리면 그동안 화면이 옛 값을 보여준다. 사람은
 * 「반영이 안 됐다」며 한 번 더 바꾼다. 검증을 통과한 값만 쓰므로 거짓을 심을 일은 없다.
 */
async function patchLocalRates(args: {
  supabase: Client;
  organizationId: string;
  roomIdByExternal: Map<string, string>;
  externalRoomId: string;
  dates: Record<string, CalendarDateValues>;
}): Promise<void> {
  const roomId = args.roomIdByExternal.get(args.externalRoomId);
  if (!roomId) return;
  const syncedAt = new Date().toISOString();

  for (const [stayDate, values] of Object.entries(args.dates)) {
    const patch: Record<string, unknown> = {
      organization_id: args.organizationId,
      room_id: roomId,
      stay_date: stayDate,
      synced_at: syncedAt,
    };
    if (values.p1 !== undefined) patch.price1 = values.p1 === "REMOVE" ? null : values.p1;
    if (values.p2 !== undefined) patch.price2 = values.p2 === "REMOVE" ? null : values.p2;
    if (values.p3 !== undefined) patch.price3 = values.p3 === "REMOVE" ? null : values.p3;
    if (values.m !== undefined) patch.min_stay = values.m;
    if (values.mx !== undefined) patch.max_stay = values.mx;
    if (values.na !== undefined) patch.num_avail = values.na;
    if (values.ov !== undefined) patch.override_kind = values.ov || "none";

    const result = await args.supabase
      .from("room_daily_rates")
      .upsert(patch as never, { onConflict: "room_id,stay_date" });
    if (result.error) {
      console.error("[beds24/price-job] 로컬 반영 실패", {
        error: result.error,
        externalRoomId: args.externalRoomId,
        stayDate,
      });
    }
  }
}

/**
 * 큐에서 하나를 집어 끝까지 처리한다.
 *
 * 아무것도 안 했으면 `ran: false` 와 이유를 돌려준다 — 크론이 이유를 로그로 남길 수 있어야
 * 「왜 안 도는가」를 사람이 알 수 있다.
 */
export async function runNextPriceJob(supabase: Client): Promise<PriceJobOutcome> {
  const cooldown = await getBeds24Cooldown(supabase);
  if (cooldown.active) {
    console.log(`[beds24/price-job] 쿨다운 ${cooldown.remainingSec}초 남음 — 쉰다`);
    return { ran: false, reason: "cooldown" };
  }

  const lock = await acquireBeds24Lock(
    supabase,
    PRICE_JOB_LOCK,
    JOB_LOCK_OWNER,
    PRICE_JOB_LOCK_TTL_MS,
  );
  if (!lock.acquired) {
    // **확인을 못 한 것과 남이 들고 있는 것을 구별한다.** 뭉치면 「왜 안 도는지」를 엉뚱한
    // 곳에서 찾게 된다.
    return { ran: false, reason: lock.reason === "error" ? "lock_error" : "lock_busy" };
  }

  try {
    await recoverStuckJobs(supabase);
    const job = await claimNextJob(supabase);
    if (!job) return { ran: false, reason: "empty" };

    const { coalescedJobIds, roomUpdates } = await absorbSiblingJobs(supabase, job);
    const results: Array<{ externalRoomId: string; success: boolean; error: string | null }> = [];

    // 우리 방 마스터에 있는 것만 로컬 반영 대상이다.
    const roomsResult = await supabase
      .from("rooms")
      .select("id, external_room_id")
      .eq("organization_id", job.organization_id)
      .eq("external_provider", "beds24")
      .not("external_room_id", "is", null);
    const roomIdByExternal = new Map<string, string>();
    for (const row of (roomsResult.data ?? []) as Array<{ id: string; external_room_id: string }>) {
      roomIdByExternal.set(String(row.external_room_id), row.id);
    }

    const updateByRoomId = new Map(roomUpdates.map((update) => [update.externalRoomId, update]));
    const targetRoomIds = [...updateByRoomId.keys()];

    /*
     * **쓰기 전에 현재 값을 읽어 둔다.** 이력의 「이전 값」이고, 쓴 뒤에는 영영 알 수 없다.
     *
     * 우리 표가 Beds24 보다 뒤처져 있을 수 있지만 그게 **화면이 보여준 값**이고, 사람이
     * 「얼마에서 바꿨다」고 기억하는 것도 그 값이다.
     */
    const beforeByCell = new Map<string, { price1: number | null; minStay: number | null }>();
    {
      const roomUuids = targetRoomIds
        .map((externalRoomId) => roomIdByExternal.get(externalRoomId))
        .filter((value): value is string => !!value);
      const stayDates = [
        ...new Set(roomUpdates.flatMap((update) => Object.keys(update.dates ?? {}))),
      ];
      if (roomUuids.length > 0 && stayDates.length > 0) {
        const before = await supabase
          .from("room_daily_rates")
          .select("room_id, stay_date, price1, min_stay")
          .eq("organization_id", job.organization_id)
          .in("room_id", roomUuids)
          .in("stay_date", stayDates);
        for (const rowValue of (before.data ?? []) as Array<{
          room_id: string;
          stay_date: string;
          price1: number | null;
          min_stay: number | null;
        }>) {
          beforeByCell.set(`${rowValue.room_id}|${rowValue.stay_date}`, {
            minStay: rowValue.min_stay,
            price1: rowValue.price1,
          });
        }
      }
    }

    for (let index = 0; index < targetRoomIds.length; index += WRITE_BATCH_SIZE) {
      const chunk = targetRoomIds.slice(index, index + WRITE_BATCH_SIZE);
      const payload = chunk.map((externalRoomId) => ({
        calendar: buildCalendarSegments(updateByRoomId.get(externalRoomId)?.dates ?? {}),
        roomId: Number.parseInt(externalRoomId, 10),
      }));

      let written;
      try {
        written = await postBeds24Calendar(payload);
      } catch (error) {
        if (error instanceof Beds24HttpError && error.isRateLimit) {
          await activateBeds24Cooldown(supabase, {
            reason: "rate_limit",
            resetInSec: error.resetInSec,
          });
        }
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        for (const externalRoomId of chunk) {
          results.push({ error: message, externalRoomId, success: false });
        }
        continue;
      }
      if ("skipped" in written) {
        for (const externalRoomId of chunk) {
          results.push({ error: written.skipped, externalRoomId, success: false });
        }
        continue;
      }

      // 크레딧이 바닥나기 **전에** 쉰다. 다음 배치는 다음 주기가 맡는다.
      if (shouldCooldownForCredit(written.credit, LOW_CREDIT_THRESHOLD)) {
        await activateBeds24Cooldown(supabase, {
          fallbackSec: 30,
          reason: "low_credit",
          resetInSec: written.credit.resetInSec,
        });
      }

      const accepted = written.items.filter((item) => item.accepted).map((item) => item.externalRoomId);
      for (const item of written.items) {
        if (!item.accepted) results.push({ error: item.error, externalRoomId: item.externalRoomId, success: false });
      }
      if (accepted.length === 0) continue;

      // ── 되읽기 검증 ──────────────────────────────────────────────────
      //
      // 우리가 POST 한 유닛은 **직접 설정값만** 본다(`includeLinkedPrices: false`) —
      // 연결된 Daily Price 쪽에 잘못 쓰인 요청을 성공으로 오인하지 않기 위해서다.
      const expectationByRoomId = new Map<string, Record<string, ExpectedDateValues>>();
      for (const externalRoomId of accepted) {
        expectationByRoomId.set(
          externalRoomId,
          (updateByRoomId.get(externalRoomId)?.dates ?? {}) as Record<string, ExpectedDateValues>,
        );
      }
      const errors = await verifyWrites({ expectationByRoomId, includeLinkedPrices: false });

      for (const externalRoomId of accepted) {
        const error = errors.get(externalRoomId) ?? null;
        results.push({ error, externalRoomId, success: !error });
        if (!error) {
          const dates = updateByRoomId.get(externalRoomId)?.dates ?? {};
          // **이력이 먼저다.** 로컬 반영이 끝나면 이전 값을 읽을 수 없다.
          await writeChangeLogs({
            beforeByCell,
            dates,
            externalRoomId,
            job,
            roomIdByExternal,
            roomLabel: updateByRoomId.get(externalRoomId)?.roomLabel ?? null,
            supabase,
          });
          await patchLocalRates({
            dates,
            externalRoomId,
            organizationId: job.organization_id,
            roomIdByExternal,
            supabase,
          });
        }
      }

      // 연결 유닛까지 퍼졌는지도 본다. **안 퍼졌다고 작업을 실패로 만들지는 않는다** —
      // 소스 쓰기는 성공했고 Beds24 의 전파가 늦은 것일 수 있다. 크게 남기고,
      // **그 유닛의 로컬 값은 건드리지 않아** 다음 동기화가 실제 값으로 채우게 둔다.
      if (job.job_type === "price") {
        await warnUnpropagatedLinks(supabase, job.organization_id, accepted, updateByRoomId);
      }
    }

    const failed = results.filter((item) => !item.success);
    const status = failed.length === 0
      ? "completed"
      : failed.length === results.length
        ? "failed"
        : "partial_failed";

    const completion = {
      completed_at: new Date().toISOString(),
      error: failed.length > 0 ? failed.map((item) => `${item.externalRoomId}: ${item.error}`).join(" / ") : null,
      failed_room_ids: failed.map((item) => item.externalRoomId),
      processed_count: results.length,
      results: results as never,
      status,
      total_count: targetRoomIds.length,
    };
    await supabase.from("beds24_price_jobs").update(completion).eq("id", job.id);
    for (const siblingId of coalescedJobIds) {
      await supabase.from("beds24_price_jobs").update(completion).eq("id", siblingId);
    }

    return {
      coalescedJobIds,
      failed: failed.length,
      jobId: job.id,
      ran: true,
      status,
      succeeded: results.length - failed.length,
    };
  } finally {
    await releaseBeds24Lock(supabase, PRICE_JOB_LOCK, lock.lockId);
  }
}

/**
 * 바꾼 칸을 **한 칸씩** 이력에 남긴다.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「이력을 남긴다」
 *
 * **검증을 통과한 것만 적는다.** Beds24 가 안 받아들인 값을 「바꿨다」고 적으면 이력이
 * 거짓말을 하고, 그건 이력이 없는 것보다 나쁘다.
 *
 * 값이 그대로인 칸은 건너뛴다 — 같은 값을 다시 보낸 것까지 남기면 진짜 변경이 묻힌다.
 */
async function writeChangeLogs(args: {
  beforeByCell: Map<string, { price1: number | null; minStay: number | null }>;
  dates: Record<string, CalendarDateValues>;
  externalRoomId: string;
  job: JobRow;
  roomIdByExternal: Map<string, string>;
  roomLabel: string | null;
  supabase: Client;
}): Promise<void> {
  const roomId = args.roomIdByExternal.get(args.externalRoomId) ?? null;
  const rows: Database["public"]["Tables"]["price_change_logs"]["Insert"][] = [];

  for (const [stayDate, values] of Object.entries(args.dates)) {
    const before = roomId ? args.beforeByCell.get(`${roomId}|${stayDate}`) : undefined;
    const shared = {
      adjust_mode: args.job.adjust_mode,
      changed_by: args.job.requested_by,
      changed_by_name: args.job.requested_by_name,
      external_room_id: args.externalRoomId,
      job_id: args.job.id,
      organization_id: args.job.organization_id,
      percent_value: args.job.percent_value,
      room_id: roomId,
      room_label: args.roomLabel,
      stay_date: stayDate,
    };

    if (values.p1 !== undefined) {
      const newValue = values.p1 === "REMOVE" ? null : values.p1;
      const oldValue = before?.price1 ?? null;
      if (oldValue !== newValue) {
        rows.push({ ...shared, field: "price1", new_value: newValue, old_value: oldValue });
      }
    }
    if (values.m !== undefined) {
      const oldValue = before?.minStay ?? null;
      if (oldValue !== values.m) {
        rows.push({ ...shared, field: "min_stay", new_value: values.m, old_value: oldValue });
      }
    }
  }

  if (rows.length === 0) return;
  const result = await args.supabase.from("price_change_logs").insert(rows);
  if (result.error) {
    // 이력을 못 남겼다고 **작업을 실패로 만들지는 않는다** — 값은 이미 Beds24 에 들어갔다.
    console.error("[beds24/price-job] 이력 기록 실패", { error: result.error, job: args.job.id });
  }
}

/** 연결 유닛에 가격이 퍼졌는지 확인하고, 안 퍼졌으면 크게 남긴다. */
async function warnUnpropagatedLinks(
  supabase: Client,
  organizationId: string,
  sourceRoomIds: string[],
  updateByRoomId: Map<string, PriceJobRoomUpdate>,
): Promise<void> {
  const linked = await supabase
    .from("rooms")
    .select("external_room_id, external_price_source_room_id")
    .eq("organization_id", organizationId)
    .in("external_price_source_room_id", sourceRoomIds);
  const rows = (linked.data ?? []) as Array<{
    external_room_id: string;
    external_price_source_room_id: string;
  }>;
  if (rows.length === 0) return;

  const expectationByRoomId = new Map<string, Record<string, ExpectedDateValues>>();
  for (const row of rows) {
    const source = updateByRoomId.get(row.external_price_source_room_id);
    if (!source) continue;
    const expectation = toLinkedUnitExpectation(source.dates as Record<string, ExpectedDateValues>);
    if (Object.keys(expectation).length > 0) {
      expectationByRoomId.set(String(row.external_room_id), expectation);
    }
  }
  if (expectationByRoomId.size === 0) return;

  const errors = await verifyWrites({ expectationByRoomId, includeLinkedPrices: true });
  for (const [externalRoomId, error] of errors) {
    console.error("[beds24/price-job] Daily Price 링크 미전파 의심", { error, externalRoomId });
  }
}
