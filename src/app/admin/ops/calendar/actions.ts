"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdminSession } from "@/lib/admin-session";
import { enqueueBeds24PriceJob, type PriceJobCellRequest } from "@/lib/beds24/price-job-queue";
import { runNextPriceJob } from "@/lib/beds24/price-job-worker";
import {
  Beds24HttpError,
  postBeds24Booking,
  postBeds24BookingCancel,
} from "@/lib/beds24/calendar-client";
import { processBeds24WebhookBooking } from "@/lib/beds24/process-webhook-booking";
import { activateBeds24Cooldown } from "@/lib/beds24/sync-locks";
import { isActiveUnitMinStay } from "@/lib/ops-gap-detection";
import {
  readBeds24CancelTargetId,
  resolveStayUnit,
  splitGuestName,
  stayNights,
  validateManualBooking,
  type ManualBookingError,
  type ManualBookingInput,
} from "@/lib/ops-manual-booking";
import { toJstDateString } from "@/lib/admin-calendar-dashboard";
import {
  clearRoomBlock,
  createRoomBlock,
  type BlockWriteFailure,
} from "@/lib/beds24/block-write";
import { groupSelectionIntoRanges } from "@/lib/ops-calendar-selection";
import { canAccessOpsAdmin } from "@/lib/ops-admin";
import { readOpsRoomUnavailableNights } from "@/lib/ops-calendar";
import { buildOpsReservationDetail, type OpsReservationDetail } from "@/lib/ops-reservation-detail";
import {
  buildAdjustmentPreview,
  type AdjustmentInput,
  type AdjustmentCellInput,
} from "@/lib/ops-price-adjustment";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * 판매 캘린더의 **쓰기**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md
 *
 * **권한을 매번 다시 본다.** service-role 은 RLS 를 우회하므로 화면에서 버튼을 감추는 것만
 * 으로는 막은 게 아니다(CLAUDE.md §6).
 *
 * 여기서는 **큐에 넣기만** 한다. Beds24 로는 워커가 보낸다 — 크레딧이 계정 단위라 즉시
 * 순차 POST 하면 예약 동기화와 다투고 429 가 난다. 접수 직후 워커를 한 번 깨우되
 * **기다리지 않는다**: 화면은 몇 초 안에 응답을 받아야 하고, 작업이 길면 크론이 이어받는다.
 */

const CONSOLE_PATH = "/admin/ops/calendar";

/**
 * 실패 사유는 **코드로** 돌려준다. 문구는 화면이 사전에서 고른다 — 서버 액션이 한국어를
 * 직접 돌려주면 일본어·영어 사용자에게 한국어가 뜬다(CLAUDE.md §2).
 */
export type PriceChangeError =
  | "forbidden"
  | "no_cells"
  | "no_priced_cells"
  | "bad_min_stay"
  | "no_writable_room"
  | "invalid_values"
  | "enqueue_failed";

export type PriceChangeResult =
  | { ok: false; error: PriceChangeError }
  | { ok: true; jobId: string; cells: number; targetRooms: number; skippedDates: string[] };

/** 화면이 보내오는 칸. **어느 Beds24 유닛에 쓸지는 서버가 정한다.** */
export type PriceChangeCell = {
  roomKey: string;
  roomLabel: string;
  /** 그 캘린더 행 뒤의 우리 `rooms.id` 전부. 유닛이 여럿일 수 있다. */
  roomIds: string[];
  date: string;
  /** 지금 화면에 보이는 가격. 퍼센트 계산의 기준이다. */
  currentPrice: number | null;
};

async function requireOpsWriter() {
  const session = await requireAdminSession();
  if (!canAccessOpsAdmin(session)) return null;
  return session;
}

/**
 * 가격 수정.
 *
 * **`p1`·`p3` 에 같은 값을 쓰고 `p2`(부킹닷컴)는 건드리지 않는다.** 부킹닷컴 가격은 Beds24 가
 * 에어비앤비 가격에서 규칙으로 파생시키므로, 우리가 직접 쓰면 그 규칙과 충돌한다
 * (저쪽이 `p1`·`p3` 만 쓰는 이유다).
 */
export async function submitPriceChange(args: {
  cells: PriceChangeCell[];
  input: AdjustmentInput;
}): Promise<PriceChangeResult> {
  const session = await requireOpsWriter();
  if (!session) return { error: "forbidden", ok: false };
  if (args.cells.length === 0) return { error: "no_cells", ok: false };

  // **화면이 보낸 금액을 그대로 믿지 않는다.** 같은 계산을 서버에서 다시 한다 —
  // 보이는 것과 보내는 것이 갈라지면 「¥30,000 으로 바꿨다」는데 다른 값이 나간다.
  const preview = buildAdjustmentPreview(
    args.cells.map(
      (cell): AdjustmentCellInput => ({
        date: cell.date,
        price: cell.currentPrice,
        roomKey: cell.roomKey,
        roomLabel: cell.roomLabel,
      }),
    ),
    args.input,
  );
  if (preview.rows.length === 0) {
    return { error: "no_priced_cells", ok: false };
  }

  const roomIdsByCell = new Map(
    args.cells.map((cell) => [`${cell.roomKey}|${cell.date}`, cell.roomIds]),
  );
  const requests: PriceJobCellRequest[] = preview.rows.map((row) => ({
    roomIds: roomIdsByCell.get(`${row.roomKey}|${row.date}`) ?? [],
    roomLabel: row.roomLabel,
    stayDate: row.date,
    // p1 = 에어비앤비, p3 = 대체가. p2 는 **넣지 않는다**(키가 없으면 Beds24 가 유지한다).
    values: { p1: row.newPrice, p3: row.newPrice },
  }));

  const supabase = getSupabaseServiceClient();
  const queued = await enqueueBeds24PriceJob({
    adjustMode: args.input.kind,
    cells: requests,
    jobType: "price",
    percentValue: args.input.kind === "percent" ? args.input.percent : null,
    organizationId: session.organization.id,
    requestedBy: session.user.id,
    requestedByName: session.user.name,
    supabase,
  });
  if (!queued.ok) return { error: queued.error, ok: false };

  // **응답 뒤에 워커를 돌린다**(`after`) — `void` 로 흘려 두면 배포 환경은 응답과 함께 함수를
  // 멈춰서, 다음 크론(실측 수십 분 지연)까지 반영이 밀렸다(2026-09-28).
  //
  // `revalidatePath` 는 **하지 않는다.** 이 시점엔 접수만 했고 바뀐 데이터가 없는데, 하면 응답에
  // 페이지 전체 재렌더가 실려 「저장」 응답만 느려진다. 반영 뒤에 화면이 스스로 다시 받는다
  // (`ops-write-tracker.ts`).
  after(kickWorker);
  return {
    cells: preview.rows.length,
    jobId: queued.jobId,
    ok: true,
    skippedDates: queued.skippedDates,
    targetRooms: queued.targetRooms,
  };
}

/**
 * 최소 숙박일 수정 — **「1박으로」가 이것이다.**
 *
 * 1박 갭(하루만 비었는데 최소 2박이라 아무도 못 사는 날)을 실제로 팔 수 있게 만드는 버튼이다.
 * 가격과 달리 **그 날짜에 운영 중인 유닛**으로 간다(`price-job-queue.ts`).
 */
export async function submitMinStayChange(args: {
  cells: Array<{ roomKey: string; roomLabel: string; roomIds: string[]; date: string }>;
  minStay: number;
}): Promise<PriceChangeResult> {
  const session = await requireOpsWriter();
  if (!session) return { error: "forbidden", ok: false };
  if (args.cells.length === 0) return { error: "no_cells", ok: false };
  // 0은 Beds24 에서 「비활성」과 구별이 안 된다. 상한은 비활성 문턱(50) 바로 아래.
  if (!Number.isInteger(args.minStay) || args.minStay < 1 || args.minStay > 49) {
    return { error: "bad_min_stay", ok: false };
  }

  const supabase = getSupabaseServiceClient();
  const queued = await enqueueBeds24PriceJob({
    adjustMode: "min_stay",
    cells: args.cells.map((cell) => ({
      roomIds: cell.roomIds,
      roomLabel: cell.roomLabel,
      stayDate: cell.date,
      values: { m: args.minStay },
    })),
    jobType: "min_stay",
    organizationId: session.organization.id,
    requestedBy: session.user.id,
    requestedByName: session.user.name,
    supabase,
  });
  if (!queued.ok) return { error: queued.error, ok: false };

  // **응답 뒤에 워커를 돌린다**(`after`) — `void` 로 흘려 두면 배포 환경은 응답과 함께 함수를
  // 멈춰서, 다음 크론(실측 수십 분 지연)까지 반영이 밀렸다(2026-09-28).
  //
  // `revalidatePath` 는 **하지 않는다.** 이 시점엔 접수만 했고 바뀐 데이터가 없는데, 하면 응답에
  // 페이지 전체 재렌더가 실려 「저장」 응답만 느려진다. 반영 뒤에 화면이 스스로 다시 받는다
  // (`ops-write-tracker.ts`).
  after(kickWorker);
  return {
    cells: args.cells.length,
    jobId: queued.jobId,
    ok: true,
    skippedDates: queued.skippedDates,
    targetRooms: queued.targetRooms,
  };
}

/**
 * 접수 직후 워커를 깨운다 — **응답은 기다리지 않는다**(`after` 로 부른다).
 *
 * 사람이 방금 누른 것은 몇 초 안에 나가야 한다. 큐에 **앞선 작업이 있으면** 하나만 돌고 끝나면
 * 방금 넣은 것이 다음 크론까지 밀리므로, 큐가 빌 때까지(시간 예산 안에서) 이어서 돈다.
 * 실패해도 조용히 넘긴다 — 크론이 안전망이다.
 */
const KICK_MAX_JOBS = 5;
const KICK_BUDGET_MS = 50_000;

async function kickWorker(): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const startedAt = Date.now();
  try {
    for (let index = 0; index < KICK_MAX_JOBS; index += 1) {
      if (Date.now() - startedAt > KICK_BUDGET_MS) break;
      const outcome = await runNextPriceJob(supabase);
      // 비었거나, 쿨다운이거나, 남이 돌고 있으면(그쪽이 이어서 처리한다) 멈춘다.
      if (!outcome.ran) break;
    }
  } catch (error) {
    // 크론이 안전망이므로 여기서 실패해도 작업은 남아 있다.
    console.error("[ops/calendar] worker kick failed; cron will pick it up", error);
  }
}

export type PriceJobStatus = {
  status: string;
  processedCount: number;
  totalCount: number;
  failedRoomIds: string[];
  error: string | null;
};

/** 화면이 폴링한다. 「처리 중」이 언제 끝나는지 사람이 알아야 한다. */
export async function getPriceJobStatus(jobId: string): Promise<PriceJobStatus | null> {
  const session = await requireOpsWriter();
  if (!session) return null;

  const result = await getSupabaseServiceClient()
    .from("beds24_price_jobs")
    .select("status, processed_count, total_count, failed_room_ids, error, organization_id")
    .eq("id", jobId)
    .maybeSingle();
  const row = result.data as {
    status: string;
    processed_count: number;
    total_count: number;
    failed_room_ids: string[];
    error: string | null;
    organization_id: string;
  } | null;
  // service-role 로 읽었으므로 **조직 확인을 직접 한다.**
  if (!row || row.organization_id !== session.organization.id) return null;

  return {
    error: row.error,
    failedRoomIds: row.failed_room_ids,
    processedCount: row.processed_count,
    status: row.status,
    totalCount: row.total_count,
  };
}

/**
 * 블록(차단) 걸기·해제.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「저쪽 블록의 실제 규칙」
 * 쓰기 계층: `src/lib/beds24/block-write.ts` (되읽기 검증 · 보상 롤백)
 *
 * ## 가격·최소숙박과 달리 **큐에 넣지 않는다**
 *
 * 가격은 수천 칸을 한 번에 바꾸므로 큐·배치가 필요하다. 블록은 방 몇 개 × 밤 며칠이고,
 * 무엇보다 **사람이 화면 앞에서 결과를 기다린다** — 「막혔나 안 막혔나」를 모른 채 넘어가면
 * 그 자리에서 초과예약이 난다. 저쪽도 동기로 한다.
 *
 * ## 모든 유닛에 건다
 *
 * 최소숙박과 달리 **활성 유닛만 고르지 않는다.** 막는 것은 「그 물리적 방을 팔지 않는다」는
 * 뜻이고, 잠긴 유닛에 `override: blackout` 을 걸어도 잠금(minStay)은 그대로라 부작용이 없다.
 * 오히려 한 유닛만 막으면 나머지 listing 으로 그 방이 팔린다.
 */
export type BlockChangeError = BlockWriteFailure | "forbidden" | "no_cells" | "unknown_room";

export type BlockChangeResult =
  | { ok: false; error: BlockChangeError; detail?: string }
  | { ok: true; ranges: number; nights: number };

export type BlockChangeCell = { roomKey: string; roomLabel: string; roomIds: string[]; date: string };

/** 한 번에 처리하는 구간 수. 실수로 격자 전체를 고르고 누르는 것을 서버에서도 막는다. */
const MAX_BLOCK_RANGES = 60;

type BlockRoomRow = {
  id: string;
  external_room_id: string | null;
  room_label: string;
  properties: { name: string } | { name: string }[] | null;
};

async function runBlockChange(
  args: { cells: BlockChangeCell[] },
  mode: "block" | "unblock",
): Promise<BlockChangeResult> {
  const session = await requireOpsWriter();
  if (!session) return { error: "forbidden", ok: false };
  if (args.cells.length === 0) return { error: "no_cells", ok: false };

  const ranges = groupSelectionIntoRanges(
    args.cells.map((cell) => ({ date: cell.date, roomKey: cell.roomKey })),
  );
  if (ranges.length === 0) return { error: "no_cells", ok: false };
  if (ranges.length > MAX_BLOCK_RANGES) {
    return { detail: `${ranges.length}`, error: "no_cells", ok: false };
  }

  // 화면이 보낸 `roomIds` 는 우리 `rooms.id` 다. Beds24 roomId 는 **서버가 찾는다** —
  // 클라이언트가 외부 식별자를 들고 다니면 조작된 값이 그대로 Beds24 로 나간다.
  const roomIdsByKey = new Map<string, string[]>();
  for (const cell of args.cells) roomIdsByKey.set(cell.roomKey, cell.roomIds);
  const allRoomIds = [...new Set(args.cells.flatMap((cell) => cell.roomIds))];

  const supabase = getSupabaseServiceClient();
  const roomsResult = await supabase
    .from("rooms")
    .select("id, external_room_id, room_label, properties(name)")
    .eq("organization_id", session.organization.id)
    .in("id", allRoomIds);
  if (roomsResult.error) return { error: "unknown_room", ok: false };

  const unitById = new Map<string, BlockRoomRow>();
  for (const row of (roomsResult.data ?? []) as BlockRoomRow[]) unitById.set(row.id, row);

  let nights = 0;
  for (const range of ranges) {
    const units = (roomIdsByKey.get(range.roomKey) ?? [])
      .map((id) => unitById.get(id))
      .filter((row): row is BlockRoomRow => !!row && !!row.external_room_id);
    if (units.length === 0) return { error: "unknown_room", ok: false };

    const property = Array.isArray(units[0].properties) ? units[0].properties[0] : units[0].properties;
    const shared = {
      externalRoomIds: units.map((unit) => String(unit.external_room_id)),
      organizationId: session.organization.id,
      propertyName: property?.name ?? "",
      range: { endDate: range.endDate, startDate: range.startDate },
      roomLabel: units[0].room_label,
      supabase,
    };

    const result =
      mode === "block"
        ? await createRoomBlock({ ...shared, actorUserId: session.user.id })
        : await clearRoomBlock(shared);

    // **첫 실패에서 멈춘다.** 이어서 더 쓰면 「어디까지 됐는지」를 사람이 알 수 없다.
    // 이미 성공한 구간은 되읽기로 검증된 상태라 그대로 두어도 안전하다.
    if (!result.ok) return { detail: result.detail, error: result.reason, ok: false };
    nights += result.nights;
  }

  revalidatePath(CONSOLE_PATH);
  return { nights, ok: true, ranges: ranges.length };
}

export async function submitRoomBlock(args: { cells: BlockChangeCell[] }): Promise<BlockChangeResult> {
  return runBlockChange(args, "block");
}

export async function submitRoomUnblock(args: { cells: BlockChangeCell[] }): Promise<BlockChangeResult> {
  return runBlockChange(args, "unblock");
}

/**
 * 수동 예약 생성.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「수동 예약 생성」
 * 규칙: `src/lib/ops-manual-booking.ts` (순수 · 테스트로 고정)
 *
 * ## 저쪽과 다르게 한 것 하나
 *
 * 저쪽은 **손님 이름에 `blackout` / `room block` 이 들어가면 차단을 만든다.** 화면 어디에도
 * 안 적힌 매직 문자열이라 빼기로 했다(2026-09-28 사용자 확인). 우리는 차단 전용 모드가
 * 따로 있고, 그쪽은 되읽기 검증·재고 스냅샷·보상 롤백까지 갖췄다. 여기서는 **예약만** 만든다.
 *
 * ## 예약은 roomId 하나에 붙는다
 *
 * 숙박 전체에서 살아 있는 유닛을 하나 고른다. 중간에 갈리면 **거부하고 갈리는 날짜를
 * 돌려준다** — 저쪽도 거부하지만 「안 된다」만 말해서, 사람이 무엇을 고쳐야 할지 몰랐다.
 */
export type ManualBookingResult =
  | { ok: true; bookingId: string }
  | {
      ok: false;
      error:
        | ManualBookingError
        | "forbidden"
        | "unknown_room"
        | "beds24_failed"
        | "cooldown"
        /** 숙박 중간에 파는 유닛이 갈린다 — `conflictDates` 에 갈리는 밤이 담긴다. */
        | "unit_changes"
        /** 그 밤에 파는 유닛이 하나도 없다. */
        | "no_active_unit"
        /** 이미 예약·블록이 있는 밤이 끼어 있다 — `conflictDates` 에 그 밤이 담긴다. */
        | "occupied";
      /** 유닛이 갈리거나 팔 수 없는 밤. 화면이 날짜를 적어 준다. */
      conflictDates?: string[];
      detail?: string;
    };

export type RoomAvailabilityResult =
  | { ok: true; booked: string[]; unsellable: string[] }
  | { ok: false; error: "forbidden" | "bad_range" | "read_failed" };

/** 한 번에 읽는 최대 기간. 피커는 한 달씩 넘기므로 두 달이면 충분하다. */
const AVAILABILITY_MAX_DAYS = 62;

/**
 * 수동 예약 패널의 날짜 피커가 **팔 수 없는 밤**을 회색으로 칠하려고 부른다.
 *
 * 격자가 가진 예약은 화면 창(30일·한 달)뿐이라, 피커로 다음 달을 넘기면 모른다. 그래서
 * 피커가 여는 달마다 여기서 읽는다. 겹침 검사와 **같은 함수**다.
 */
export async function loadRoomAvailability(args: {
  roomKey: string;
  roomIds: string[];
  from: string;
  toExclusive: string;
}): Promise<RoomAvailabilityResult> {
  const session = await requireOpsWriter();
  if (!session) return { error: "forbidden", ok: false };

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(args.from) || !datePattern.test(args.toExclusive)) {
    return { error: "bad_range", ok: false };
  }
  if (args.toExclusive <= args.from || stayNights(args.from, args.toExclusive).length > AVAILABILITY_MAX_DAYS) {
    return { error: "bad_range", ok: false };
  }

  const supabase = getSupabaseServiceClient();
  // 넘어온 유닛이 **이 조직의 것인지** 확인한다 — 서비스 키로 읽으므로 RLS 가 막아 주지 않는다.
  const ownedResult = await supabase
    .from("rooms")
    .select("id")
    .eq("organization_id", session.organization.id)
    .in("id", args.roomIds);
  if (ownedResult.error) return { error: "read_failed", ok: false };
  const roomIds = (ownedResult.data ?? []).map((row) => row.id as string);

  try {
    const result = await readOpsRoomUnavailableNights({
      from: args.from,
      organizationId: session.organization.id,
      roomIds,
      roomKey: args.roomKey,
      supabase,
      toExclusive: args.toExclusive,
    });
    return { ...result, ok: true };
  } catch (error) {
    console.error("[ops-calendar] availability read failed", error);
    return { error: "read_failed", ok: false };
  }
}

export async function submitManualBooking(args: {
  input: ManualBookingInput;
  /** 그 캘린더 행 뒤의 우리 `rooms.id` 전부. Beds24 roomId 는 서버가 찾는다. */
  roomIds: string[];
  guestEmail: string;
  guestPhone: string;
  comments: string;
}): Promise<ManualBookingResult> {
  const session = await requireOpsWriter();
  if (!session) return { error: "forbidden", ok: false };

  const today = toJstDateString(new Date());
  const invalid = validateManualBooking(args.input, today);
  if (invalid) return { error: invalid, ok: false };

  const nights = stayNights(args.input.arrival, args.input.departure);
  const supabase = getSupabaseServiceClient();

  const unitsResult = await supabase
    .from("rooms")
    .select("id, external_room_id, properties(external_property_id)")
    .eq("organization_id", session.organization.id)
    .in("id", args.roomIds);
  if (unitsResult.error) return { error: "unknown_room", ok: false };

  type UnitRow = {
    id: string;
    external_room_id: string | null;
    properties: { external_property_id: string | null } | { external_property_id: string | null }[] | null;
  };
  const units = ((unitsResult.data ?? []) as unknown as UnitRow[]).filter(
    (row) => !!row.external_room_id,
  );
  if (units.length === 0) return { error: "unknown_room", ok: false };

  // 밤마다 **그때 살아 있는** 유닛을 센다. `rooms.status` 는 오늘 하루의 스냅샷이라
  // 「10월 3일에 이 유닛이 팔렸나」에는 답하지 못한다.
  const ratesResult = await supabase
    .from("room_daily_rates")
    .select("room_id, stay_date, min_stay")
    .eq("organization_id", session.organization.id)
    .in("room_id", units.map((unit) => unit.id))
    .in("stay_date", nights);
  const minStayByKey = new Map<string, number | null>();
  for (const row of (ratesResult.data ?? []) as Array<{
    room_id: string;
    stay_date: string;
    min_stay: number | null;
  }>) {
    minStayByKey.set(`${row.room_id}|${row.stay_date}`, row.min_stay);
  }

  const activeByNight = new Map<string, string[]>();
  for (const night of nights) {
    const active = units
      .filter((unit) => isActiveUnitMinStay(minStayByKey.get(`${unit.id}|${night}`) ?? null))
      .map((unit) => String(unit.external_room_id));
    activeByNight.set(night, active);
  }

  // **겹침은 서버가 한 번 더 막는다.** 패널이 회색으로 칠해 두지만 화면은 몇 초 전의 사정이다
  // — 그 사이에 채널 예약이 들어올 수 있고, Beds24 는 수기 예약의 겹침을 막아 주지 않는다.
  // 격자와 **같은 매칭**(`readOpsRoomUnavailableNights`)으로 본다.
  let unavailable: Awaited<ReturnType<typeof readOpsRoomUnavailableNights>>;
  try {
    unavailable = await readOpsRoomUnavailableNights({
      from: args.input.arrival,
      organizationId: session.organization.id,
      roomIds: units.map((unit) => unit.id),
      roomKey: args.input.roomKey,
      supabase,
      toExclusive: args.input.departure,
    });
  } catch (error) {
    // 확인을 못 했으면 만들지 않는다 — 「비어 있을 것이다」로 보내면 그대로 초과예약이다.
    return { detail: (error as Error).message, error: "beds24_failed", ok: false };
  }
  if (unavailable.booked.length > 0) {
    return { conflictDates: unavailable.booked, error: "occupied", ok: false };
  }

  const resolved = resolveStayUnit(activeByNight);
  if (!resolved.ok) {
    return { conflictDates: resolved.conflictDates, error: resolved.reason, ok: false };
  }

  const target = units.find((unit) => String(unit.external_room_id) === resolved.externalRoomId);
  const property = Array.isArray(target?.properties) ? target?.properties[0] : target?.properties;
  const propertyId = Number(property?.external_property_id ?? "");
  if (!target || !Number.isInteger(propertyId)) return { error: "unknown_room", ok: false };

  const { firstName, lastName } = splitGuestName(args.input.guestName);
  let created: Awaited<ReturnType<typeof postBeds24Booking>>;
  try {
    created = await postBeds24Booking({
      apiSource: "Direct",
      arrival: args.input.arrival,
      comments: args.comments.trim(),
      departure: args.input.departure,
      email: args.guestEmail.trim(),
      firstName,
      lastName,
      numAdult: args.input.numAdult,
      numChild: args.input.numChild,
      phone: args.guestPhone.trim(),
      price: args.input.totalPrice ?? 0,
      propertyId,
      roomId: Number(resolved.externalRoomId),
    });
  } catch (error) {
    if (error instanceof Beds24HttpError && error.isRateLimit) {
      await activateBeds24Cooldown(supabase, { reason: "rate_limit", resetInSec: error.resetInSec });
      return { error: "cooldown", ok: false };
    }
    return {
      detail: error instanceof Error ? error.message : "unknown",
      error: "beds24_failed",
      ok: false,
    };
  }

  if ("skipped" in created) return { detail: created.skipped, error: "beds24_failed", ok: false };
  if (!created.ok) return { detail: created.error, error: "beds24_failed", ok: false };

  // **웹훅을 기다리지 않는다.** 방금 만든 예약이 화면에 안 보이면 사람은 또 만든다.
  // 예약 웹훅과 **같은 처리기**를 태워 형식이 갈리지 않게 한다.
  try {
    await processBeds24WebhookBooking({
      organizationIdDefault: session.organization.id,
      payload: created.raw,
      supabase,
    });
  } catch (error) {
    // 만들어진 것은 사실이다. 우리 표에 늦게 들어올 뿐이라 실패로 돌리지 않는다.
    console.error("[ops/manual-booking] local upsert failed", error);
  }

  revalidatePath(CONSOLE_PATH);
  return { bookingId: created.bookingId, ok: true };
}

/**
 * 예약 취소.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「예약 취소」
 * 원본: `BuildingCalendar.jsx`(확인창) + `functions/index.js` → `cancelBooking`
 *
 * **되돌릴 수 없다.** 채널에도 그대로 나가고, Beds24 에서 다시 `confirmed` 로 돌려도 손님에게
 * 간 취소 통지는 취소되지 않는다. 화면이 확인 단계를 두고, 서버는 그 위에 두 가지를 더 본다 —
 *
 * 1. **이미 취소된 예약은 다시 취소하지 않는다.** 같은 요청을 두 번 보내면 Beds24 에
 *    「Cancelled by User」 주석만 덧씌워진다.
 * 2. **예약번호가 숫자일 때만 부른다.** 우리 표의 `apiReference` 는 채널 예약코드라,
 *    그걸로 부르면 엉뚱한 예약이 취소되거나 조용히 아무 일도 안 일어난다
 *    (`readBeds24CancelTargetId`).
 */
/**
 * 예약 상세 패널이 연다 — 막대를 누르면 **그 한 건만** 읽는다.
 *
 * 격자의 막대는 이름·날짜·채널만 들고 있다. 전부를 격자에 실으면 30일 창의 예약 수백 건
 * 원본이 매번 오가므로, 누른 것만 여기서 읽는다.
 *
 * **원본을 통째로 돌려주지 않는다** — 결제 토큰이 들어 있다. 이름을 지정한 필드만
 * (`buildOpsReservationDetail`).
 */
export async function loadReservationDetail(
  reservationId: string,
): Promise<{ ok: true; detail: OpsReservationDetail } | { ok: false; error: "forbidden" | "not_found" }> {
  const session = await requireOpsWriter();
  if (!session) return { error: "forbidden", ok: false };

  const result = await getSupabaseServiceClient()
    .from("reservations")
    .select("id, status, guest_name, check_in_date, check_out_date, property_name, room_label, raw_payload")
    // service-role 로 읽으므로 **조직을 직접 건다** — RLS 가 막아 주지 않는다.
    .eq("organization_id", session.organization.id)
    .eq("id", reservationId)
    .maybeSingle();
  if (result.error || !result.data) return { error: "not_found", ok: false };

  return { detail: buildOpsReservationDetail(result.data), ok: true };
}

export type CancelReservationResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "forbidden"
        | "not_found"
        | "already_cancelled"
        | "no_booking_id"
        | "beds24_failed"
        | "cooldown";
      detail?: string;
    };

export async function submitReservationCancel(args: {
  /** 우리 `reservations.id`. Beds24 예약번호는 **서버가 찾는다.** */
  reservationId: string;
  reason?: string | null;
}): Promise<CancelReservationResult> {
  const session = await requireOpsWriter();
  if (!session) return { error: "forbidden", ok: false };

  const supabase = getSupabaseServiceClient();
  const found = await supabase
    .from("reservations")
    .select("id, status, raw_payload")
    .eq("organization_id", session.organization.id)
    .eq("id", args.reservationId)
    .maybeSingle();
  if (found.error || !found.data) return { error: "not_found", ok: false };

  const row = found.data as { id: string; status: string; raw_payload: unknown };
  if (row.status === "cancelled") return { error: "already_cancelled", ok: false };

  const bookingId = readBeds24CancelTargetId(row.raw_payload);
  if (!bookingId) return { error: "no_booking_id", ok: false };

  let result: Awaited<ReturnType<typeof postBeds24BookingCancel>>;
  try {
    result = await postBeds24BookingCancel({ bookingId, reason: args.reason });
  } catch (error) {
    if (error instanceof Beds24HttpError && error.isRateLimit) {
      await activateBeds24Cooldown(supabase, { reason: "rate_limit", resetInSec: error.resetInSec });
      return { error: "cooldown", ok: false };
    }
    return {
      detail: error instanceof Error ? error.message : "unknown",
      error: "beds24_failed",
      ok: false,
    };
  }
  if ("skipped" in result) return { detail: result.skipped, error: "beds24_failed", ok: false };
  if (!result.ok) return { detail: result.error, error: "beds24_failed", ok: false };

  // Beds24 가 받아들였으므로 화면을 바로 바꾼다. 웹훅이 오면 같은 값으로 덮인다.
  await supabase
    .from("reservations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("organization_id", session.organization.id)
    .eq("id", row.id);

  revalidatePath(CONSOLE_PATH);
  return { ok: true };
}
