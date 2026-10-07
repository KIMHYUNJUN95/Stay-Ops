import { readFileSync, writeFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
import { createClient } from "@supabase/supabase-js";
import { readAllPages } from "@/lib/supabase/read-all-pages";
(async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const r = await readAllPages<Record<string, unknown>>((from, to) => supabase.from("reservations")
    .select("id, source_reservation_id, check_in_date, check_out_date, property_name, room_label, status, updated_at, price:raw_payload->price, rstatus:raw_payload->status, roomId:raw_payload->roomId, masterId:raw_payload->masterId, bid:raw_payload->id, bookId:raw_payload->bookId")
    .gt("check_out_date", "2024-06-01").order("id").range(from, to) as never);
  if (r.error) throw r.error;
  writeFileSync(process.argv[2], JSON.stringify(r.data));
  console.log(r.data.length);
})();
