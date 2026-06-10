"use server";

import { redirect } from "next/navigation";
import { getActiveLinenItems, isKnownBuilding } from "@/lib/linen-returns";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type RawLine = { itemId?: string; quantity?: unknown };

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseLines(value: string): RawLine[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l) => l && typeof l === "object") as RawLine[];
  } catch {
    return [];
  }
}

function newPath(building: string, error?: string) {
  const base = `/mobile/linen-return/new?building=${encodeURIComponent(building)}`;
  return error ? `${base}&error=${error}` : base;
}

export async function createLinenReturnRecord(formData: FormData) {
  const session = await getCurrentAppSession();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/linen-return")}`);
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const building = cleanText(formData.get("building"));
  if (!building) {
    redirect("/mobile/linen-return");
  }
  if (!(await isKnownBuilding(session, building))) {
    redirect(newPath(building, "invalid_building"));
  }

  const note = cleanText(formData.get("note"));
  const rawLines = parseLines(cleanText(formData.get("linesJson")));

  // Validate item ids against the building's active catalog (fail closed).
  const catalog = await getActiveLinenItems(session, building);
  const validItemIds = new Set(catalog.map((item) => item.id));

  const seen = new Set<string>();
  const lines: { itemId: string; quantity: number }[] = [];
  for (const raw of rawLines) {
    const itemId = String(raw.itemId ?? "").trim();
    const quantity = Number(raw.quantity);
    if (!itemId || !validItemIds.has(itemId)) {
      redirect(newPath(building, "invalid_item"));
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      redirect(newPath(building, "invalid_quantity"));
    }
    if (seen.has(itemId)) {
      redirect(newPath(building, "duplicate_item"));
    }
    seen.add(itemId);
    lines.push({ itemId, quantity });
  }

  if (lines.length === 0) {
    redirect(newPath(building, "missing_items"));
  }

  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v))
    .filter((u) => u.startsWith("https://") || u.startsWith("http://"));

  // Reuse the client-generated id (also used as the image folder) when valid so
  // photo storage paths and the record id stay aligned; otherwise generate one.
  const requestedId = cleanText(formData.get("id"));
  const recordId = requestedId && isValidUuid(requestedId) ? requestedId : crypto.randomUUID();
  const supabase = await getSupabaseServerClient();

  const recordInsert: Database["public"]["Tables"]["linen_return_records"]["Insert"] = {
    id: recordId,
    organization_id: session.organization.id,
    building_name: building,
    note: note || null,
    image_urls: imageUrls,
    registered_by_user_id: session.user.id,
  };

  const { error: recordError } = await supabase
    .from("linen_return_records")
    .insert(recordInsert as never);
  if (recordError) {
    redirect(newPath(building, "save_failed"));
  }

  const lineInserts: Database["public"]["Tables"]["linen_return_record_items"]["Insert"][] =
    lines.map((line, index) => ({
      return_record_id: recordId,
      linen_item_id: line.itemId,
      quantity: line.quantity,
      sort_order: index,
    }));

  const { error: linesError } = await supabase
    .from("linen_return_record_items")
    .insert(lineInserts as never);
  if (linesError) {
    // Roll back the orphan header so a failed save leaves no partial record.
    await supabase.from("linen_return_records").delete().eq("id", recordId);
    redirect(newPath(building, "save_failed"));
  }

  // Per the workflow spec: return to the building list with the new record on top
  // and surface a completion moment there (created=<id> drives the success overlay).
  redirect(
    `/mobile/linen-return/list?building=${encodeURIComponent(building)}&created=${recordId}`,
  );
}
