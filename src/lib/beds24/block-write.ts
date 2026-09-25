/**
 * 블록(차단) 걸기·풀기 — Beds24 왕복 + 되읽기 검증 + 보상 롤백.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「저쪽 블록의 실제 규칙」
 * 페이로드 규칙: `block-write-payload.ts` (순수 함수 · 테스트로 고정)
 * 원본: `functions/index.js` → `createBooking`(isBlock 분기) · `cancelBooking`(override 분기)
 *
 * ## 왜 가격처럼 큐에 넣지 않는가
 *
 * 가격은 「67객실 × 3개월」처럼 한 번에 수천 칸을 바꾸므로 큐·배치·크레딧 조율이 필요하다.
 * 블록은 **방 몇 개 × 밤 며칠**이고, 무엇보다 사람이 화면 앞에서 결과를 기다린다 —
 * 「막혔나 안 막혔나」를 모른 채 넘어가면 그 자리에서 초과예약이 난다. 저쪽도 동기로 한다.
 *
 * ## 순서가 곧 안전장치다
 *
 * ```
 * ① 되읽기(전)  numAvail 스냅샷 + 이미 막혀 있는지 확인
 * ② POST        override: blackout
 * ③ 되읽기(후)  정말 들어갔는지 — Beds24 는 안 들어가도 success 를 준다
 * ④ 로컬 저장   스냅샷 · room_blocks · room_daily_rates
 * ⑤ 실패하면    ②를 되돌린다 (보상 롤백)
 * ```
 *
 * ⑤가 없으면 **「화면엔 아무것도 없는데 방은 판매 정지」인 고아 블록**이 남는다. 해제할 행이
 * 없으니 UI 로는 손댈 방법이 없고, Beds24 화면에 직접 들어가야 풀린다.
 *
 * ## 스냅샷은 Beds24 에서 읽는다
 *
 * 저쪽은 자기 캐시(`price_sync`)에서 numAvail 을 읽는다. 우리는 **Beds24 에서 직접 읽는다** —
 * `room_daily_rates` 는 15분 주기 동기화라 낡았을 수 있고, 이 값은 나중에 **그대로 다시
 * 써넣을 값**이다. 낡은 값을 복원하면 재고가 틀린 채로 고정된다. ①은 어차피 「이미 막혀
 * 있는가」를 보려고 읽어야 하므로 왕복이 늘지도 않는다.
 */

import {
  type BlockRange,
  buildBlockSegments,
  buildUnblockSegments,
  diffBlockReadback,
  eachNight,
  validateBlockRange,
} from "@/lib/beds24/block-write-payload";
import {
  Beds24HttpError,
  type CalendarRoomData,
  fetchBeds24Calendar,
  postBeds24Calendar,
} from "@/lib/beds24/calendar-client";
import { activateBeds24Cooldown, getBeds24Cooldown } from "@/lib/beds24/sync-locks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * 실패 사유는 **코드로** 돌려준다. 화면 문구는 i18n 사전이 만든다 — 서버가 한국어 문자열을
 * 돌려주면 `no-hardcoded-i18n` 가드에 걸리고, 무엇보다 ja/en 에서 한국어가 튀어나온다.
 */
export type BlockWriteFailure =
  | "invalid_date"
  | "range_reversed"
  | "invalid_room_id"
  | "no_rooms"
  | "cooldown"
  | "beds24_unavailable"
  | "beds24_rejected"
  | "verify_mismatch"
  | "readback_truncated"
  | "save_failed_rolled_back"
  | "save_failed_not_rolled_back";

export type BlockWriteResult =
  | { ok: true; nights: number; roomIds: string[] }
  | { ok: false; reason: BlockWriteFailure; detail?: string };

/** 한 번에 막을 수 있는 밤 수. 실수로 1년을 막는 일을 서버에서도 막는다. */
export const MAX_BLOCK_NIGHTS = 370;

type NightOverrides = Map<string, string | null>;
type NightNumAvail = Record<string, number>;

function readCalendarNights(room: CalendarRoomData | undefined): {
  overrides: NightOverrides;
  numAvail: NightNumAvail;
} {
  const overrides: NightOverrides = new Map();
  const numAvail: NightNumAvail = {};
  for (const entry of room?.calendar ?? []) {
    const from = typeof entry.from === "string" ? entry.from : null;
    const to = typeof entry.to === "string" ? entry.to : from;
    if (!from || !to) continue;
    const override = typeof entry.override === "string" ? entry.override : null;
    const available =
      typeof entry.numAvail === "number" && Number.isInteger(entry.numAvail)
        ? entry.numAvail
        : null;
    // Beds24 는 구간으로 돌려준다 — 밤 단위로 펼쳐야 날짜별로 비교할 수 있다.
    for (const night of eachNight({ startDate: from, endDate: to })) {
      overrides.set(night, override);
      if (available !== null) numAvail[night] = available;
    }
  }
  return { overrides, numAvail };
}

async function readNights(args: {
  externalRoomIds: string[];
  range: BlockRange;
}): Promise<
  | { ok: true; byRoom: Map<string, { overrides: NightOverrides; numAvail: NightNumAvail }> }
  | { ok: false; reason: BlockWriteFailure; detail?: string }
> {
  const fetched = await fetchBeds24Calendar({
    externalRoomIds: args.externalRoomIds,
    startDate: args.range.startDate,
    endDate: args.range.endDate,
    includeNumAvail: true,
    includeOverride: true,
  });
  if ("skipped" in fetched) {
    return { ok: false, reason: "beds24_unavailable", detail: fetched.skipped };
  }
  // 잘린 응답으로는 「일치한다」를 증명할 수 없다. 성공으로 치면 안 막힌 방이 막힌 것으로 남는다.
  if (fetched.truncated) return { ok: false, reason: "readback_truncated" };

  const byRoom = new Map<string, { overrides: NightOverrides; numAvail: NightNumAvail }>();
  for (const roomId of args.externalRoomIds) {
    byRoom.set(roomId, readCalendarNights(fetched.roomsById.get(roomId)));
  }
  return { ok: true, byRoom };
}

/** 429 를 만나면 쿨다운을 켠다 — 다른 경로(요금 동기화·가격 워커)도 같이 물러나게. */
async function postWithCooldownGuard(
  supabase: Client,
  payload: { roomId: number; calendar: unknown[] }[],
): Promise<{ ok: true; rejected: string[] } | { ok: false; reason: BlockWriteFailure; detail?: string }> {
  try {
    const result = await postBeds24Calendar(payload);
    if ("skipped" in result) {
      return { ok: false, reason: "beds24_unavailable", detail: result.skipped };
    }
    const rejected = result.items.filter((item) => !item.accepted);
    if (rejected.length > 0) {
      return {
        ok: false,
        reason: "beds24_rejected",
        detail: rejected.map((item) => `${item.externalRoomId}:${item.error ?? "?"}`).join(", "),
      };
    }
    return { ok: true, rejected: [] };
  } catch (error) {
    if (error instanceof Beds24HttpError && error.isRateLimit) {
      await activateBeds24Cooldown(supabase, { reason: "rate_limit", resetInSec: error.resetInSec });
      return { ok: false, reason: "cooldown" };
    }
    return {
      ok: false,
      reason: "beds24_unavailable",
      detail: error instanceof Error ? error.message : "unknown",
    };
  }
}

/**
 * 블록을 건다.
 *
 * `externalRoomIds` 는 **같은 물리적 방의 모든 유닛**이어야 한다. 하나만 막으면 나머지 유닛으로
 * 그 방이 그대로 팔린다 — 듀얼 ID 객실에서 실제로 일어나는 일이다.
 */
export async function createRoomBlock(args: {
  supabase: Client;
  organizationId: string;
  /** 같은 물리적 방의 모든 Beds24 roomId. */
  externalRoomIds: string[];
  /** 막을 **밤** 범위 (양끝 포함). 체크아웃 날짜가 아니다. */
  range: BlockRange;
  actorUserId?: string | null;
  propertyName: string;
  roomLabel: string;
}): Promise<BlockWriteResult> {
  const rangeError = validateBlockRange(args.range);
  if (rangeError) return { ok: false, reason: rangeError };

  const roomIds = [...new Set(args.externalRoomIds.map((id) => String(id ?? "").trim()))].filter(
    Boolean,
  );
  if (roomIds.length === 0) return { ok: false, reason: "no_rooms" };

  const nights = eachNight(args.range);
  if (nights.length > MAX_BLOCK_NIGHTS) {
    return { ok: false, reason: "range_reversed", detail: `${nights.length} nights` };
  }

  const cooldown = await getBeds24Cooldown(args.supabase);
  if (cooldown.active) {
    return { ok: false, reason: "cooldown", detail: `${cooldown.remainingSec}s` };
  }

  // ① 막기 전 상태 — 되돌릴 numAvail 을 여기서 찍는다.
  const before = await readNights({ externalRoomIds: roomIds, range: args.range });
  if (!before.ok) return before;

  const payload = buildBlockSegments({ externalRoomIds: roomIds, range: args.range });
  if (payload.length === 0) return { ok: false, reason: "invalid_room_id" };

  // ② 쓰기
  const posted = await postWithCooldownGuard(args.supabase, payload);
  if (!posted.ok) return posted;

  // ③ 되읽기 — Beds24 는 아무것도 안 들어가도 success 를 준다.
  const after = await readNights({ externalRoomIds: roomIds, range: args.range });
  if (!after.ok) return after;

  const mismatched: string[] = [];
  for (const roomId of roomIds) {
    const missing = diffBlockReadback({
      nights,
      actual: after.byRoom.get(roomId)?.overrides ?? new Map(),
      expect: "blackout",
    });
    if (missing.length > 0) mismatched.push(`${roomId}:${missing.length}`);
  }
  if (mismatched.length > 0) {
    return { ok: false, reason: "verify_mismatch", detail: mismatched.join(", ") };
  }

  // ④ 로컬 저장
  const nowIso = new Date().toISOString();
  const snapshotRows = roomIds.map((roomId) => ({
    organization_id: args.organizationId,
    external_room_id: roomId,
    start_date: args.range.startDate,
    end_date: args.range.endDate,
    pre_block_num_avail: before.byRoom.get(roomId)?.numAvail ?? {},
    created_by_user_id: args.actorUserId ?? null,
  }));

  const snapshotSaved = await args.supabase
    .from("room_block_snapshots")
    .upsert(snapshotRows, { onConflict: "organization_id,external_room_id,start_date,end_date" });

  if (snapshotSaved.error) {
    // ⑤ 보상 롤백 — Beds24 에는 걸렸는데 우리는 되돌릴 값을 잃었다. 그대로 두면 고아 블록이다.
    const rolledBack = await rollbackBlackout({
      supabase: args.supabase,
      roomIds,
      range: args.range,
      before: before.byRoom,
    });
    return {
      ok: false,
      reason: rolledBack ? "save_failed_rolled_back" : "save_failed_not_rolled_back",
      detail: snapshotSaved.error.message,
    };
  }

  // `room_blocks` 는 Beds24 동기화가 주인이라 **넣지 않아도 다음 동기화에 들어온다.** 다만 그
  // 사이(최대 15분) 화면에 안 보이면 「안 막혔나?」 하고 또 누른다. 같은 규칙으로 미리 넣어 둔다.
  await args.supabase.from("room_blocks").upsert(
    {
      organization_id: args.organizationId,
      source: "beds24",
      property_name: args.propertyName,
      room_label: args.roomLabel,
      external_room_id: roomIds[0],
      start_date: args.range.startDate,
      end_date: args.range.endDate,
      override_kind: "blackout",
      synced_at: nowIso,
    },
    { onConflict: "organization_id,source,property_name,room_label,start_date" },
  );

  return { ok: true, nights: nights.length, roomIds };
}

/** Beds24 만 되돌린다. 성공 여부를 돌려주되 **던지지 않는다** — 롤백 실패도 보고할 사실이다. */
async function rollbackBlackout(args: {
  supabase: Client;
  roomIds: string[];
  range: BlockRange;
  before: Map<string, { overrides: NightOverrides; numAvail: NightNumAvail }>;
}): Promise<boolean> {
  try {
    const payload = args.roomIds
      .map((roomId) =>
        buildUnblockSegments({
          externalRoomId: roomId,
          range: args.range,
          preBlockNumAvail: args.before.get(roomId)?.numAvail ?? null,
        }),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (payload.length === 0) return false;
    const result = await postBeds24Calendar(payload);
    return !("skipped" in result) && result.items.every((item) => item.accepted);
  } catch {
    return false;
  }
}

/**
 * 블록을 푼다.
 *
 * 스냅샷이 없으면 **사람이 Beds24 화면에서 직접 건 블록**이다. 그때는 재고를 건드리지 않고
 * 오버라이드만 푼다 — 모르는 값을 추측해 쓰는 것보다 그대로 두는 쪽이 안전하다.
 */
export async function clearRoomBlock(args: {
  supabase: Client;
  organizationId: string;
  externalRoomIds: string[];
  range: BlockRange;
  propertyName: string;
  roomLabel: string;
}): Promise<BlockWriteResult> {
  const rangeError = validateBlockRange(args.range);
  if (rangeError) return { ok: false, reason: rangeError };

  const roomIds = [...new Set(args.externalRoomIds.map((id) => String(id ?? "").trim()))].filter(
    Boolean,
  );
  if (roomIds.length === 0) return { ok: false, reason: "no_rooms" };

  const cooldown = await getBeds24Cooldown(args.supabase);
  if (cooldown.active) {
    return { ok: false, reason: "cooldown", detail: `${cooldown.remainingSec}s` };
  }

  const snapshots = await args.supabase
    .from("room_block_snapshots")
    .select("external_room_id, pre_block_num_avail")
    .eq("organization_id", args.organizationId)
    .in("external_room_id", roomIds)
    .eq("start_date", args.range.startDate)
    .eq("end_date", args.range.endDate);

  const restoreByRoom = new Map<string, Record<string, number>>();
  for (const row of (snapshots.data ?? []) as Array<{
    external_room_id: string;
    pre_block_num_avail: unknown;
  }>) {
    const value = row.pre_block_num_avail;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      restoreByRoom.set(row.external_room_id, value as Record<string, number>);
    }
  }

  const payload = roomIds
    .map((roomId) =>
      buildUnblockSegments({
        externalRoomId: roomId,
        range: args.range,
        preBlockNumAvail: restoreByRoom.get(roomId) ?? null,
      }),
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (payload.length === 0) return { ok: false, reason: "invalid_room_id" };

  const posted = await postWithCooldownGuard(args.supabase, payload);
  if (!posted.ok) return posted;

  const nights = eachNight(args.range);
  const after = await readNights({ externalRoomIds: roomIds, range: args.range });
  if (!after.ok) return after;

  const stillBlocked: string[] = [];
  for (const roomId of roomIds) {
    const remaining = diffBlockReadback({
      nights,
      actual: after.byRoom.get(roomId)?.overrides ?? new Map(),
      expect: "cleared",
    });
    if (remaining.length > 0) stillBlocked.push(`${roomId}:${remaining.length}`);
  }
  if (stillBlocked.length > 0) {
    return { ok: false, reason: "verify_mismatch", detail: stillBlocked.join(", ") };
  }

  // 풀렸으면 스냅샷은 쓸모가 없다. 남겨두면 다음에 같은 구간을 막을 때 **옛 재고**를 복원한다.
  await args.supabase
    .from("room_block_snapshots")
    .delete()
    .eq("organization_id", args.organizationId)
    .in("external_room_id", roomIds)
    .eq("start_date", args.range.startDate)
    .eq("end_date", args.range.endDate);

  await args.supabase
    .from("room_blocks")
    .delete()
    .eq("organization_id", args.organizationId)
    .eq("source", "beds24")
    .eq("property_name", args.propertyName)
    .eq("room_label", args.roomLabel)
    .eq("start_date", args.range.startDate);

  return { ok: true, nights: nights.length, roomIds };
}
