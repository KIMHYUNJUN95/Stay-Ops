const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
for (const [key, value] of Object.entries(env)) process.env[key] = value;

const SEP = "::room::";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const looksBeds24 = (raw) =>
  raw &&
  typeof raw === "object" &&
  !Array.isArray(raw) &&
  ("apiReference" in raw || "bookId" in raw || "roomId" in raw || "unitId" in raw || "propertyId" in raw || "arrival" in raw);

const toOriginal = (value) => {
  const input = String(value);
  const index = input.indexOf(SEP);
  return index === -1 ? input : input.slice(0, index);
};

const toStored = (sourceReservationId, roomLabel) => `${toOriginal(sourceReservationId)}${SEP}${roomLabel}`;

(async () => {
  const { data, error } = await supabase
    .from("reservations")
    .select("id, source_reservation_id, room_label, raw_payload");
  if (error) throw error;

  const rows = (data || []).filter(
    (row) => looksBeds24(row.raw_payload) && typeof row.room_label === "string" && row.room_label.trim().length > 0,
  );

  let updated = 0;
  let skippedExisting = 0;
  let deletedRedundant = 0;
  for (const row of rows) {
    const next = toStored(row.source_reservation_id, row.room_label);
    if (next === row.source_reservation_id) continue;

    const { error: updateError } = await supabase
      .from("reservations")
      .update({ source_reservation_id: next })
      .eq("id", row.id);
    if (updateError) {
      if (updateError.code === "23505") {
        const { error: deleteError } = await supabase
          .from("reservations")
          .delete()
          .eq("id", row.id);
        if (deleteError) throw deleteError;
        skippedExisting += 1;
        deletedRedundant += 1;
        continue;
      }
      throw updateError;
    }
    updated += 1;
  }

  console.log(JSON.stringify({ scanned: rows.length, updated, skippedExisting, deletedRedundant }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
