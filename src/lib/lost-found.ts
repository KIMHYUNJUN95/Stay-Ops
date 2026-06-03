import type { AppSession } from "@/lib/session";
import { getTimestampRange, type RequestDateFilter } from "@/lib/request-filters";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type LostItemRow = Database["public"]["Tables"]["lost_items"]["Row"];
export type LostItemStatus = Database["public"]["Enums"]["lost_item_status"];

export const lostItemStatuses: readonly LostItemStatus[] = [
  "registered",
  "stored",
  "disposal_scheduled",
  "disposed",
];

export type LostItemWithReporter = LostItemRow & { reporter_name: string };

type ProfileName = { id: string; name: string };

type LostItemFilters = RequestDateFilter & {
  status?: LostItemStatus;
};

async function attachReporterNames(
  items: LostItemRow[],
): Promise<LostItemWithReporter[]> {
  if (items.length === 0) return [];
  const supabase = await getSupabaseServerClient();
  const reporterIds = Array.from(new Set(items.map((i) => i.reported_by_user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", reporterIds);
  const names = new Map(
    ((profiles ?? []) as ProfileName[]).map((p) => [p.id, p.name] as const),
  );
  return items.map((item) => ({
    ...item,
    reporter_name: names.get(item.reported_by_user_id) ?? "",
  }));
}

export async function getOrgLostItems(
  session: AppSession,
  filters: LostItemFilters = {},
): Promise<LostItemWithReporter[]> {
  const supabase = await getSupabaseServerClient();
  const range = getTimestampRange(filters);
  let query = supabase
    .from("lost_items")
    .select("*")
    .eq("organization_id", session.organization.id);
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (range.from) {
    query = query.gte("found_at", range.from);
  }
  if (range.to) {
    query = query.lt("found_at", range.to);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return attachReporterNames((data ?? []) as LostItemRow[]);
}

export async function getLostItemById(
  session: AppSession,
  id: string,
): Promise<LostItemWithReporter | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("lost_items")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!data) return null;
  const item = data as LostItemRow;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("id", item.reported_by_user_id)
    .maybeSingle();
  return {
    ...item,
    reporter_name: (profile as ProfileName | null)?.name ?? "",
  };
}

export async function getMyLostItemById(
  session: AppSession,
  id: string,
): Promise<LostItemRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("lost_items")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .eq("reported_by_user_id", session.user.id)
    .maybeSingle();
  return (data as LostItemRow | null) ?? null;
}

export async function getMyLostItems(
  session: AppSession,
  filters: RequestDateFilter = {},
): Promise<LostItemRow[]> {
  const supabase = await getSupabaseServerClient();
  const range = getTimestampRange(filters);
  let query = supabase
    .from("lost_items")
    .select("*")
    .eq("organization_id", session.organization.id)
    .eq("reported_by_user_id", session.user.id);
  if (range.from) {
    query = query.gte("found_at", range.from);
  }
  if (range.to) {
    query = query.lt("found_at", range.to);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LostItemRow[];
}
