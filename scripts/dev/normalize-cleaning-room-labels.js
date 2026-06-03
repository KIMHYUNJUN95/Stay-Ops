const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const env = Object.fromEntries(
    fs.readFileSync(path, "utf8")
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

function normalizeInput(value) {
  return String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeKey(value) {
  return normalizeInput(value).replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龯]/g, "");
}

function getCanonicalPropertyName(propertyName) {
  const key = normalizeKey(propertyName);
  if (key.includes("arakicho") || key.includes("아라키초a") || key.includes("荒木町a")) return "아라키초A";
  if (key.includes("arakichob") || key.includes("아라키초b") || key.includes("荒木町b")) return "아라키초B";
  if (key.includes("kabukicho") || key.includes("가부키초") || key.includes("歌舞伎町")) return "가부키초";
  if (key.includes("takadanobaba") || key.includes("다카다노바바") || key.includes("高田馬場")) return "다카다노바바";
  if (key.includes("okuboa") || key.includes("오쿠보a") || key.includes("大久保a")) return "오쿠보A";
  if (key.includes("okubob") || key.includes("오쿠보b") || key.includes("大久保b")) return "오쿠보B";
  if (key.includes("okuboc") || key.includes("오쿠보c") || key.includes("大久保c")) return "오쿠보C";
  return String(propertyName || "").trim();
}

function dateKeyInTokyo(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(d);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const p = args.find((a) => a.startsWith(`${name}=`));
    return p ? p.slice(name.length + 1) : null;
  };
  return {
    apply: args.includes("--apply"),
    organizationId: getArg("--org"),
    days: Number(getArg("--days") ?? "14"),
  };
}

function buildAliasMap(rooms) {
  const map = new Map();
  for (const room of rooms) {
    const roomKey = `${room.property_name}_${room.canonical_room_label}`;
    const aliases = [
      room.property_name,
      room.canonical_property_name,
      room.canonical_room_label,
      room.room_label,
      room.canonical_room_label === room.property_name
        ? room.property_name
        : `${room.property_name} ${room.canonical_room_label}`,
      room.canonical_room_label === room.canonical_property_name
        ? room.canonical_property_name
        : `${room.canonical_property_name} ${room.canonical_room_label}`,
      room.room_label === room.property_name ? room.room_label : `${room.property_name} ${room.room_label}`,
      room.room_label === room.canonical_property_name
        ? room.room_label
        : `${room.canonical_property_name} ${room.room_label}`,
    ];
    const canonicalSessionRoomLabel =
      room.canonical_room_label === room.property_name
        ? room.property_name
        : `${room.property_name} ${room.canonical_room_label}`;

    for (const alias of aliases) {
      const normalized = normalizeInput(alias);
      if (!normalized) continue;
      if (!map.has(normalized)) map.set(normalized, { roomKey, sessionRoomLabel: canonicalSessionRoomLabel });
    }
  }
  return map;
}

(async () => {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const { apply, organizationId, days } = parseArgs();
  if (!organizationId) throw new Error("Missing required argument: --org=<organization_id>");
  if (!Number.isFinite(days) || days < 1 || days > 60) {
    throw new Error("Invalid --days value. Use 1..60");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const fromDate = dateKeyInTokyo(-(days - 1));
  const toDate = dateKeyInTokyo(0);

  const { data: roomRows, error: roomErr } = await supabase
    .from("rooms")
    .select("organization_id, room_label, properties(name)")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (roomErr) throw roomErr;

  const normalizedRooms = (roomRows ?? [])
    .map((r) => ({
      property_name: getCanonicalPropertyName(r.properties?.name ?? ""),
      canonical_property_name: getCanonicalPropertyName(r.properties?.name ?? ""),
      canonical_room_label: String(r.room_label ?? "").trim(),
      room_label: r.room_label ?? "",
    }))
    .filter((r) => r.property_name && r.canonical_property_name && r.canonical_room_label);

  const aliasMap = buildAliasMap(normalizedRooms);
  const roomKeyToCanonicalLabel = new Map(
    normalizedRooms.map((r) => {
      const sessionRoomLabel =
        r.canonical_room_label === r.property_name
          ? r.property_name
          : `${r.property_name} ${r.canonical_room_label}`;
      return [`${r.property_name}_${r.canonical_room_label}`, sessionRoomLabel];
    }),
  );

  const { data: sessions, error: sessionErr } = await supabase
    .from("cleaning_sessions")
    .select("id, room_label, cleaning_date, status")
    .eq("organization_id", organizationId)
    .gte("cleaning_date", fromDate)
    .lte("cleaning_date", toDate)
    .in("status", ["in_progress", "completed"])
    .order("cleaning_date", { ascending: false });
  if (sessionErr) throw sessionErr;

  const updates = [];
  const unresolvedSamples = [];
  let unresolvedCount = 0;
  for (const row of sessions ?? []) {
    const match = aliasMap.get(normalizeInput(row.room_label));
    if (!match) {
      unresolvedCount += 1;
      if (unresolvedSamples.length < 10) unresolvedSamples.push(row.room_label);
      continue;
    }
    const canonicalLabel = roomKeyToCanonicalLabel.get(match.roomKey);
    if (!canonicalLabel || canonicalLabel === row.room_label) continue;
    updates.push({
      id: row.id,
      from: row.room_label,
      to: canonicalLabel,
      cleaning_date: row.cleaning_date,
    });
  }

  let updatedCount = 0;
  if (apply && updates.length > 0) {
    for (const item of updates) {
      const { error } = await supabase
        .from("cleaning_sessions")
        .update({ room_label: item.to })
        .eq("id", item.id);
      if (error) throw error;
      updatedCount += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        organizationId,
        dateRange: { fromDate, toDate, days },
        activeRoomCount: normalizedRooms.length,
        scannedSessionCount: (sessions ?? []).length,
        candidateUpdateCount: updates.length,
        updatedCount,
        sampleUpdates: updates.slice(0, 10),
        unresolvedCount,
        unresolvedSamples,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
