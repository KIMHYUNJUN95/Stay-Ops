"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { enqueueBeds24PriceJob, type PriceJobCellRequest } from "@/lib/beds24/price-job-queue";
import { runNextPriceJob } from "@/lib/beds24/price-job-worker";
import {
  clearRoomBlock,
  createRoomBlock,
  type BlockWriteFailure,
} from "@/lib/beds24/block-write";
import { groupSelectionIntoRanges } from "@/lib/ops-calendar-selection";
import { canAccessOpsAdmin } from "@/lib/ops-admin";
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

  void kickWorker();
  revalidatePath(CONSOLE_PATH);
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

  void kickWorker();
  revalidatePath(CONSOLE_PATH);
  return {
    cells: args.cells.length,
    jobId: queued.jobId,
    ok: true,
    skippedDates: queued.skippedDates,
    targetRooms: queued.targetRooms,
  };
}

/**
 * 접수 직후 워커를 깨운다 — **기다리지 않는다.**
 *
 * 사람이 방금 누른 것은 몇 초 안에 나가야 하는데, 여기서 끝까지 기다리면 응답이 그만큼
 * 늦어진다. 실패해도 조용히 넘긴다 — 크론이 안전망이다.
 */
async function kickWorker(): Promise<void> {
  try {
    await runNextPriceJob(getSupabaseServiceClient());
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
