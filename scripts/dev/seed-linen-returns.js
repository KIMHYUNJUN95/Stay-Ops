/**
 * 개발용 — 어드민 린넨 반품 콘솔(/admin/linen-return) 확인용 샘플 기록 생성.
 *
 * 실제 조직의 건물 목록 · 활성 린넨 품목 · 활성 멤버를 읽어서, Tokyo 기준 이번 달(+ 지난 달 2건)에
 * 걸친 반품 기록을 만든다. 메모에는 `[샘플]` 접두사를 붙여 나중에 화면에서 찾아 지우기 쉽게 한다.
 * 사진은 실제 스토리지 객체가 필요하므로 넣지 않는다(빈 배열).
 *
 * 사용:
 *   node scripts/dev/seed-linen-returns.js            # 실행 계획만 출력 (dry run)
 *   node scripts/dev/seed-linen-returns.js --apply    # 실제 insert
 *   node scripts/dev/seed-linen-returns.js --apply --org <organization_id>
 *
 * 삭제는 콘솔에서 직접 하거나, 필요하면 메모 접두사로 찾아서 지운다.
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const env = Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const APPLY = process.argv.includes("--apply");
const ORG_ARG = (() => {
  const i = process.argv.indexOf("--org");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const NOTE_PREFIX = "[샘플]";

/**
 * 건물명 정규화 — 앱이 쓰는 값과 반드시 같아야 한다.
 * `rooms → properties.name` 은 원본 표기("Arakicho A", "Okubo_A (B棟)")지만, 앱은
 * `getActiveRoomCatalog` 가 `getCanonicalPropertyName` 으로 정규화한 한국어 표기를 건물 키로 쓴다.
 * 여기서 정규화를 빼먹으면 시드 기록이 건물 필터/카탈로그와 매칭되지 않는다.
 * 원본: src/lib/room-label-normalization.ts (규칙이 바뀌면 여기도 같이 고칠 것).
 */
function normalizeKey(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[_()\-]/g, "")
    .toLowerCase();
}
function hasAny(key, needles) {
  return needles.some((needle) => key.includes(needle));
}
function getCanonicalPropertyName(propertyName) {
  const key = normalizeKey(propertyName);
  if (hasAny(key, ["아라키초a", "arakichoa", "荒木町a"])) return "아라키초A";
  if (hasAny(key, ["아라키초b", "arakichob", "荒木町b"])) return "아라키초B";
  if (hasAny(key, ["가부키초", "kabukicho", "歌舞伎町"])) return "가부키초";
  if (hasAny(key, ["다카다노바바", "takadanobaba", "高田馬場"])) return "다카다노바바";
  if (hasAny(key, ["오쿠보a", "okuboa", "大久保a"])) return "오쿠보A";
  if (hasAny(key, ["오쿠보b", "okubob", "大久保b"])) return "오쿠보B";
  if (hasAny(key, ["오쿠보c", "okuboc", "大久保c"])) return "오쿠보C";
  if (hasAny(key, ["사노", "sano", "佐野"])) return "사노";
  return String(propertyName || "").trim();
}
/** 사노는 운영 카탈로그에서 제외된다(isExcludedOperationalProperty). */
function isExcludedOperationalProperty(propertyName) {
  return getCanonicalPropertyName(propertyName) === "사노";
}

/** Tokyo 벽시계 → UTC ISO. JST = UTC+9. */
function tokyoIso(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0)).toISOString();
}

function tokyoToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

/** 결정적 의사난수 — 실행할 때마다 같은 조합이 나오게 한다. */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const NOTES = [
  "3층 객실 정리분. 이불커버 2장은 얼룩이 심해 별도로 표시해 두었습니다.",
  "세탁업체 수거 카트 2번 사용.",
  "주말 체크아웃분 일괄 반품.",
  "엘리베이터 점검으로 수거가 하루 늦어졌습니다.",
  "",
  "",
  "",
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // ── 조직 ────────────────────────────────────────────────────────────────
  let organizationId = ORG_ARG;
  let organizationName = "";
  {
    const { data, error } = await supabase.from("organizations").select("id, name").order("created_at");
    if (error) throw new Error(`organizations: ${error.message}`);
    if (!data || data.length === 0) throw new Error("조직이 없습니다.");
    if (!organizationId) {
      organizationId = data[0].id;
      if (data.length > 1) {
        console.log("조직이 여러 개입니다. 첫 번째를 사용합니다. 다른 조직은 --org <id> 로 지정하세요:");
        for (const org of data) console.log(`  · ${org.name} — ${org.id}`);
      }
    }
    organizationName = (data.find((o) => o.id === organizationId) || {}).name || "(unknown)";
  }

  // ── 건물 (rooms → properties.name) ──────────────────────────────────────
  const { data: roomRows, error: roomError } = await supabase
    .from("rooms")
    .select("properties(name)")
    .eq("organization_id", organizationId);
  if (roomError) throw new Error(`rooms: ${roomError.message}`);
  const buildings = [
    ...new Set(
      (roomRows || [])
        .map((row) => (Array.isArray(row.properties) ? row.properties[0] : row.properties))
        .map((p) => (p && p.name ? getCanonicalPropertyName(p.name) : ""))
        .filter(Boolean)
        .filter((name) => !isExcludedOperationalProperty(name)),
    ),
  ].sort();
  if (buildings.length === 0) throw new Error("객실 마스터에 건물이 없습니다.");

  // ── 활성 린넨 품목 (전역 카탈로그) ──────────────────────────────────────
  const { data: itemRows, error: itemError } = await supabase
    .from("linen_items")
    .select("id, code, name, building_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("display_order");
  if (itemError) throw new Error(`linen_items: ${itemError.message}`);
  const items = (itemRows || []).filter((row) => row.building_name === null);
  if (items.length === 0) throw new Error("활성 린넨 품목이 없습니다.");

  // ── 등록자 (활성 멤버) ──────────────────────────────────────────────────
  const { data: memberRows, error: memberError } = await supabase
    .from("memberships")
    .select("user_id, role, profiles(name)")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (memberError) throw new Error(`memberships: ${memberError.message}`);
  const registrants = (memberRows || [])
    .map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return { id: row.user_id, name: (profile && profile.name) || "(이름 없음)", role: row.role };
    })
    .filter((r) => r.id);
  if (registrants.length === 0) throw new Error("활성 멤버가 없습니다.");

  // ── 기록 생성 ───────────────────────────────────────────────────────────
  const today = tokyoToday();
  const prev = today.month === 1 ? { year: today.year - 1, month: 12 } : { year: today.year, month: today.month - 1 };
  const prevLastDay = new Date(Date.UTC(prev.year, prev.month, 0)).getUTCDate();
  const rng = makeRng(20260730);

  // 이번 달: 오늘까지의 날짜에 12건을 고르게 뿌린다. 지난 달: 기간 필터 확인용 2건.
  const thisMonthDays = [];
  const wanted = Math.min(12, today.day);
  for (let i = 0; i < wanted; i += 1) {
    const day = Math.max(1, Math.round(((i + 1) / wanted) * today.day));
    if (!thisMonthDays.includes(day)) thisMonthDays.push(day);
  }

  const plan = [];
  const push = (year, month, day) => {
    let hour = 8 + Math.floor(rng() * 12);
    const minute = Math.floor(rng() * 60);
    // 오늘 자 기록이 미래 시각으로 찍히지 않게 현재 Tokyo 시각으로 자른다.
    const isToday = year === today.year && month === today.month && day === today.day;
    if (isToday && hour > today.hour) hour = Math.max(0, today.hour - 1);
    const building = buildings[Math.floor(rng() * buildings.length)];
    const registrant = registrants[Math.floor(rng() * registrants.length)];
    const lineCount = 1 + Math.floor(rng() * Math.min(4, items.length));
    const pool = items.slice().sort(() => rng() - 0.5);
    const lines = pool.slice(0, lineCount).map((item) => ({
      itemId: item.id,
      name: item.name,
      quantity: 2 + Math.floor(rng() * 18),
    }));
    const note = NOTES[Math.floor(rng() * NOTES.length)];
    plan.push({
      registeredAt: tokyoIso(year, month, day, hour, minute),
      label: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      building,
      registrant,
      lines,
      note: note ? `${NOTE_PREFIX} ${note}` : NOTE_PREFIX,
    });
  };

  for (const day of thisMonthDays) push(today.year, today.month, day);
  push(prev.year, prev.month, Math.min(21, prevLastDay));
  push(prev.year, prev.month, Math.min(27, prevLastDay));

  console.log(`조직: ${organizationName} (${organizationId})`);
  console.log(`건물 ${buildings.length}개: ${buildings.join(" · ")}`);
  console.log(`품목 ${items.length}종: ${items.map((i) => i.name).join(" · ")}`);
  console.log(`등록자 ${registrants.length}명: ${registrants.map((r) => r.name).join(" · ")}`);
  console.log(`생성할 기록 ${plan.length}건 (이번 달 ${thisMonthDays.length} · 지난 달 2)\n`);
  for (const row of plan) {
    console.log(
      `  ${row.label}  ${row.building}  ${row.registrant.name}  ` +
        row.lines.map((l) => `${l.name} ${l.quantity}`).join(", "),
    );
  }

  if (!APPLY) {
    console.log("\n(dry run) 실제로 넣으려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }

  let inserted = 0;
  for (const row of plan) {
    const { data: header, error: headerError } = await supabase
      .from("linen_return_records")
      .insert({
        organization_id: organizationId,
        building_name: row.building,
        note: row.note,
        image_urls: [],
        registered_by_user_id: row.registrant.id,
        registered_at: row.registeredAt,
      })
      .select("id")
      .single();
    if (headerError) {
      console.error(`  ✗ ${row.label} 헤더 실패: ${headerError.message}`);
      continue;
    }
    const { error: lineError } = await supabase.from("linen_return_record_items").insert(
      row.lines.map((line, index) => ({
        return_record_id: header.id,
        linen_item_id: line.itemId,
        quantity: line.quantity,
        sort_order: index,
      })),
    );
    if (lineError) {
      console.error(`  ✗ ${row.label} 품목 실패: ${lineError.message} — 헤더 롤백`);
      await supabase.from("linen_return_records").delete().eq("id", header.id);
      continue;
    }
    inserted += 1;
    console.log(`  ✓ ${row.label}  ${header.id}`);
  }
  console.log(`\n완료: ${inserted}/${plan.length}건 생성.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
