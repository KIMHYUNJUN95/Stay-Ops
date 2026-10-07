/**
 * 매출 · 가동률 **저쪽(STAY ARI Manager)과 숫자 대조** — 읽기 전용 (2026-10-07).
 *
 * 저쪽 Firestore `reservations` 를 읽어 **저쪽 화면 식 그대로** 건물 × 월을 내고, 우리 매출 화면과 같은 읽기 · 같은 식
 * (`readOpsSalesInputs` → `buildOpsSalesSummary`, 마이너스 금액 포함)으로 낸 값과 칸마다 비교한다. 다른 칸만 찍는다.
 *
 * | 저쪽 식 | 출처 |
 * | --- | --- |
 * | 매출 = `totalPrice \|\| price` ÷ 박수 × 달과 겹친 밤(마이너스 포함), 다이쿄초 제외, 객실 목록 밖 방도 | `src/RevenueDashboard.jsx` `processRevenue` |
 * | 판매 박 = 하드코딩 객실 목록(`BUILDING_ROOMS`)의 건물+방 이름별 날짜 Set, 전체 박 = 방 수 × 일수 | `src/components/OccupancyRateDashboard.jsx` |
 *
 * 우리 쪽 전체 박은 **원래 값**(문 열기 전 달도 방 수 × 일수)으로 비교한다 — 매출 화면의 「문 열기 전 달 분모 0」은
 * 표시 규칙이라 대조에서 뺀다(34번 「매출 화면」).
 *
 * ```bash
 * npx tsx scripts/dev/ops-metrics-legacy-compare.ts                    # 2024-07 ~ 지난달
 * npx tsx scripts/dev/ops-metrics-legacy-compare.ts --from 2025-01 --to 2026-10   # 끝 달 제외
 * STAY_ARI_DIR=/mnt/c/-stay-ari-manager-main npx tsx scripts/dev/ops-metrics-legacy-compare.ts
 * ```
 *
 * - 저쪽은 `firebase-admin`(저쪽 `functions/node_modules`)과 저쪽 서비스 계정 파일로 **읽기만** 한다. 인덱스도 만들지 않는다
 *   (`departure` 한 조건으로 읽고 나머지는 메모리에서 거른다).
 * - 저쪽 동기화는 2026-10-06 에 멈췄다 — 그 뒤에 바뀐 예약 때문에 **10월 이후 칸은 원래 다르다.** 지난 달까지만 본다.
 * - `server-only` 를 쓰는 모듈을 읽으므로 Next 밖에서는 빈 `server-only` 를 `NODE_PATH` 로 준다(아래 「실행 전」).
 *
 * 실행 전(한 번): `mkdir -p /tmp/shim/server-only && echo '{"main":"i.js"}' > /tmp/shim/server-only/package.json && touch /tmp/shim/server-only/i.js`
 * 그리고 `NODE_PATH=/tmp/shim npx tsx …`.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
import { createClient } from "@supabase/supabase-js";
import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";
import { readOpsSalesInputs } from "@/lib/ops-calendar";
import { buildOpsSalesSummary, type SalesRawPayload } from "@/lib/ops-sales-summary";
import { toJstDateString } from "@/lib/admin-calendar-dashboard";

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
};
const today = toJstDateString(new Date());
const fromMonth = argValue("--from") ?? "2024-07";
const toMonth = argValue("--to") ?? today.slice(0, 7);
const legacyDir = process.env.STAY_ARI_DIR ?? "/mnt/c/-stay-ari-manager-main";

/** 저쪽 `OccupancyRateDashboard` 의 `BUILDING_ROOMS` 그대로(다이쿄초는 화면에서 빠진다). */
const LEGACY_ROOMS: Record<string, string[]> = {
  "아라키초A": ["201호", "202호", "301호", "302호", "401호", "402호", "501호", "502호", "602호", "701호", "702호"],
  "아라키초B": ["101호", "102호", "201호", "202호", "301호", "302호", "401호", "402호"],
  "가부키초": ["202호", "203호", "302호", "303호", "402호", "403호", "502호", "603호", "802호", "803호"],
  "오쿠보A동": ["오쿠보A"],
  "오쿠보B동": ["오쿠보B"],
  "오쿠보C동": ["오쿠보C"],
  "사노시": ["사노"],
  "다카다노바바": ["201호", "301호", "401호", "501호", "601호", "701호", "801호", "901호"],
  "STAY ARI Apartment Hotel": [
    "101", "102", "103", "105", "106", "107", "108", "109", "110",
    "201", "202", "203", "205", "206", "207", "208", "209", "210",
    "302", "303", "305", "306", "307", "308", "309", "310",
  ],
};
/** 저쪽 건물 이름 → 우리 건물 이름. */
const OURS_NAME: Record<string, string> = {
  "STAY ARI Apartment Hotel": "STAY ARI Apartment Hotel",
  "가부키초": "가부키초",
  "다카다노바바": "다카다노바바",
  "사노시": "사노",
  "아라키초A": "아라키초A",
  "아라키초B": "아라키초B",
  "오쿠보A동": "오쿠보A",
  "오쿠보B동": "오쿠보B",
  "오쿠보C동": "오쿠보C",
};

type LegacyReservation = { status?: string; building?: string; room?: string; arrival?: string; departure?: string; price?: unknown; totalPrice?: unknown };
type Cell = { revenue: number; occupied: number; available: number };

const DAY = 86_400_000;
const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};
const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

function legacyCells(reservations: LegacyReservation[], month: string): Map<string, Cell> {
  const days = daysIn(month);
  const start = dayNumber(`${month}-01`);
  const end = start + days - 1;
  const cells = new Map<string, Cell>();
  const cell = (name: string) => cells.get(name) ?? cells.set(name, { available: 0, occupied: 0, revenue: 0 }).get(name)!;
  for (const r of reservations) {
    if (!r.arrival || !r.departure || r.building === "다이쿄초" || !r.building) continue;
    const total = Number(r.totalPrice || r.price) || 0;
    const arrival = dayNumber(r.arrival);
    const departure = dayNumber(r.departure);
    const nights = departure - arrival;
    if (nights <= 0) continue;
    const overlapStart = Math.max(arrival, start);
    const overlapEnd = Math.min(departure - 1, end);
    if (overlapStart > overlapEnd) continue;
    cell(r.building).revenue += (total / nights) * (overlapEnd - overlapStart + 1);
  }
  for (const [building, rooms] of Object.entries(LEGACY_ROOMS)) {
    const target = cell(building);
    for (const room of rooms) {
      const occupied = new Set<number>();
      for (const r of reservations) {
        if (r.building !== building || r.room !== room || !r.arrival || !r.departure) continue;
        for (let day = Math.max(dayNumber(r.arrival), start); day <= Math.min(dayNumber(r.departure) - 1, end); day += 1) occupied.add(day);
      }
      target.occupied += occupied.size;
      target.available += days;
    }
  }
  return cells;
}

async function main() {
  const months: string[] = [];
  for (let month = fromMonth; month < toMonth; month = shiftMonthKey(month, 1)) months.push(month);
  if (months.length === 0) throw new Error("빈 기간");

  // ── 저쪽: 읽기 전용 ──
  const legacyRequire = createRequire(`${legacyDir}/functions/package.json`);
  const admin = legacyRequire("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(`${legacyDir}/serviceAccountKey.json`, "utf8"))) });
  const snapshot = await admin.firestore().collection("reservations").where("departure", ">", `${months[0]}-01`).get();
  const legacy = (snapshot.docs as Array<{ data(): LegacyReservation }>).map((doc) => doc.data()).filter((r) => r.status === "confirmed");

  // ── 우리: 매출 화면과 같은 읽기 · 같은 식 ──
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: orgs, error } = await supabase.from("organizations").select("id");
  if (error || !orgs?.length) throw new Error(error?.message ?? "조직 없음");
  const window = { endExclusive: `${toMonth}-01`, start: `${months[0]}-01` };
  const inputs = await readOpsSalesInputs({ organizationId: orgs[0].id, properties: [], supabase: supabase as never, window });
  const reservations = inputs.reservations.map((r) => ({ ...r, raw: r.raw as SalesRawPayload }));

  let mismatches = 0;
  for (const month of months) {
    const theirs = legacyCells(legacy, month);
    const summary = buildOpsSalesSummary({
      blocks: [],
      endExclusive: `${shiftMonthKey(month, 1)}-01`,
      negativeAmounts: "include",
      properties: inputs.properties,
      reservations,
      rooms: inputs.rooms,
      start: `${month}-01`,
      today,
    });
    const ours = new Map(summary.byProperty.map((row) => [row.propertyName, row]));
    for (const [legacyName, oursName] of Object.entries(OURS_NAME)) {
      const a = theirs.get(legacyName) ?? { available: 0, occupied: 0, revenue: 0 };
      const b = ours.get(oursName);
      const revenue = Math.round(b?.revenue ?? 0);
      const occupied = b?.occupiedNights ?? 0;
      const available = b?.availableNights ?? 0;
      // 1엔 — 달마다 쪼갠 소수 합의 반올림 차이.
      if (Math.abs(revenue - Math.round(a.revenue)) > 1 || occupied !== a.occupied || available !== a.available) {
        mismatches += 1;
        console.log(
          `${month} ${oursName.padEnd(26)} 매출 ${Math.round(a.revenue)} → ${revenue} · 판매 박 ${a.occupied} → ${occupied} · 전체 박 ${a.available} → ${available}`,
        );
      }
    }
  }
  console.log(`\n${months[0]} ~ ${months.at(-1)} · 건물 ${Object.keys(OURS_NAME).length} × ${months.length}달 · 다른 칸 ${mismatches}`);
  console.log(`(저쪽 확정 예약 ${legacy.length}건 · 우리 예약 ${reservations.length}건)`);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
