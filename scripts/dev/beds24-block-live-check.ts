/**
 * 블록(차단) 쓰기 **라이브 검증** — 실제 Beds24 에 걸었다가 바로 푼다.
 *
 * 되읽기 검증이 코드 안에 있지만, 그 코드 자체가 맞는지는 **한 번은 진짜로 써 봐야** 안다.
 * Beds24 는 아무것도 안 들어가도 `success: true` 를 준다.
 *
 * ## 안전장치
 *
 * - 대상은 **예약이 없는 먼 날짜**여야 한다. 아래 상수를 바꿀 때 반드시 예약을 먼저 확인할 것.
 * - 거는 순간 그 방이 **채널에서 판매 정지**된다. 확인 후 **즉시 해제**한다.
 * - 해제까지 실패하면 그 방이 막힌 채 남는다 — 그때는 Beds24 화면에서 직접 풀어야 한다.
 *
 * ```bash
 * BEDS24_BLOCK_LIVE_CHECK=yes npx tsx scripts/dev/beds24-block-live-check.ts
 * ```
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
import { createClient } from "@supabase/supabase-js";
import { clearRoomBlock, createRoomBlock } from "@/lib/beds24/block-write";
import type { Database } from "@/types/database";

/** 예약이 없는 먼 날짜. 바꿀 때는 예약을 먼저 확인할 것. */
const RANGE = { startDate: "2027-08-10", endDate: "2027-08-12" };
/** 사노 — 단일 유닛이라 결과가 가장 단순하다. */
const EXTERNAL_ROOM_ID = "481152";

if (process.env.BEDS24_BLOCK_LIVE_CHECK !== "yes") {
  console.error(
    "실제 Beds24 에 쓰는 스크립트다. 의도한 게 맞으면 BEDS24_BLOCK_LIVE_CHECK=yes 로 실행할 것.",
  );
  process.exit(1);
}

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function readOverride(externalRoomId: string) {
  const base = process.env.BEDS24_API_BASE_URL!.replace(/\/$/, "");
  const token = (
    await (
      await fetch(`${base}/authentication/token`, {
        headers: { accept: "application/json", refreshToken: process.env.BEDS24_API_REFRESH_TOKEN! },
      })
    ).json()
  ).token as string;
  const url = `${base}/inventory/rooms/calendar?roomId=${externalRoomId}&startDate=${RANGE.startDate}&endDate=${RANGE.endDate}&includeOverride=true&includeNumAvail=true`;
  const json = (await (await fetch(url, { headers: { accept: "application/json", token } })).json()) as {
    data?: Array<{ calendar?: Array<{ from: string; to: string; override?: string; numAvail?: number }> }>;
  };
  return (json.data ?? []).flatMap((row) =>
    (row.calendar ?? []).map((s) => `${s.from}~${s.to} override=${s.override ?? "-"} numAvail=${s.numAvail ?? "-"}`),
  );
}

async function main() {
  const room = await supabase
    .from("rooms")
    .select("id, organization_id, room_label, external_room_id, properties(name)")
    .eq("external_provider", "beds24")
    .eq("external_room_id", EXTERNAL_ROOM_ID)
    .maybeSingle();
  if (room.error || !room.data) throw new Error(`방을 못 찾음: ${room.error?.message}`);
  const row = room.data as unknown as {
    organization_id: string;
    room_label: string;
    external_room_id: string;
    properties: { name: string } | { name: string }[] | null;
  };
  const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
  const shared = {
    externalRoomIds: [row.external_room_id],
    organizationId: row.organization_id,
    propertyName: property?.name ?? "",
    range: RANGE,
    roomLabel: row.room_label,
    supabase,
  };
  console.log(`대상: ${property?.name} ${row.room_label} (${row.external_room_id})  ${RANGE.startDate}~${RANGE.endDate}`);
  console.log("① 걸기 전:", await readOverride(row.external_room_id));

  const blocked = await createRoomBlock({ ...shared, actorUserId: null });
  console.log("② createRoomBlock →", JSON.stringify(blocked));
  console.log("③ 건 뒤 Beds24:", await readOverride(row.external_room_id));

  const snap = await supabase
    .from("room_block_snapshots")
    .select("external_room_id, start_date, end_date, pre_block_num_avail")
    .eq("organization_id", row.organization_id)
    .eq("external_room_id", row.external_room_id);
  console.log("④ 스냅샷:", JSON.stringify(snap.data));

  const cleared = await clearRoomBlock(shared);
  console.log("⑤ clearRoomBlock →", JSON.stringify(cleared));
  console.log("⑥ 푼 뒤 Beds24:", await readOverride(row.external_room_id));

  const after = await supabase
    .from("room_block_snapshots")
    .select("id")
    .eq("organization_id", row.organization_id)
    .eq("external_room_id", row.external_room_id);
  console.log("⑦ 스냅샷 정리됐나:", (after.data ?? []).length === 0 ? "예 (0행)" : `아니오 (${after.data?.length}행)`);
}

main().catch((error) => {
  console.error("실패:", error);
  process.exit(1);
});
