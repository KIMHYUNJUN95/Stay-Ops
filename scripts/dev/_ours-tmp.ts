import { readFileSync, writeFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
import { createClient } from "@supabase/supabase-js";
import { readOpsSalesInputs } from "@/lib/ops-calendar";
import { buildOpsSalesSummary, type SalesRawPayload } from "@/lib/ops-sales-summary";
import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";

const out = process.argv[2];
(async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const org = orgs![0];
  const months: string[] = [];
  for (let m = "2024-07"; m <= "2027-03"; m = shiftMonthKey(m, 1)) months.push(m);
  const window = { start: "2024-07-01", endExclusive: "2027-04-01" };
  const inputs = await readOpsSalesInputs({ organizationId: org.id, properties: [], supabase: supabase as never, window });
  const reservations = inputs.reservations.map((r) => ({ ...r, raw: r.raw as SalesRawPayload }));
  const result: Record<string, Record<string, unknown>> = {};
  for (const month of months) {
    const next = shiftMonthKey(month, 1);
    const s = buildOpsSalesSummary({ blocks: [], endExclusive: `${next}-01`, properties: inputs.properties, reservations, rooms: inputs.rooms, start: `${month}-01`, today: "2026-10-07" });
    result[month] = Object.fromEntries(s.byProperty.map((p) => [p.propertyName, { revenue: p.revenue, occ: p.occupiedNights, avail: p.availableNights, rooms: Object.fromEntries(p.rooms.map((r) => [r.label, { revenue: r.revenue, occ: r.occupiedNights, inCatalog: r.inCatalog }])) }]));
  }
  writeFileSync(out, JSON.stringify({ orgs: orgs!.length, properties: inputs.properties, rooms: inputs.rooms, result }));
  console.log("orgs", orgs!.length, "props", inputs.properties, "reservations", reservations.length);
})().catch((e) => { console.error(e); process.exit(1); });
