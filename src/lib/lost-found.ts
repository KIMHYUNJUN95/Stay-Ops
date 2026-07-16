import type { AppSession } from "@/lib/session";
import { getTimestampRange, type RequestDateFilter } from "@/lib/request-filters";
import type { LostItemStatus } from "@/lib/lost-found-constants";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// 상태 배열·가드·상한은 client-safe 파일 하나에서만 정의하고 여기서 재수출한다
// (서버 lib을 client가 import 하면 next/headers가 클라 번들로 새기 때문).
export {
  lostItemStatuses,
  lostItemLinearStatuses,
  isLostItemStatus,
  isLostItemTerminal,
  LOST_FOUND_HANDLING_IMAGE_LIMIT,
  lostItemCategories,
  lostReturnMethods,
  isLostItemCategory,
  isLostReturnMethod,
  LOST_FOUND_STORAGE_DAYS,
  LOST_FOUND_DUE_SOON_DAYS,
  LOST_FOUND_DISPOSAL_RETENTION_DAYS,
  LOST_FOUND_PURGE_SOON_DAYS,
} from "@/lib/lost-found-constants";
export type {
  LostItemStatus,
  LostItemCategory,
  LostReturnMethod,
} from "@/lib/lost-found-constants";

export type LostItemRow = Database["public"]["Tables"]["lost_items"]["Row"];

// reporter_name = 등록자, handled_by_name = 마지막 처리자(반환·폐기 등). 종결 이력 표시에 쓴다.
export type LostItemWithReporter = LostItemRow & {
  reporter_name: string;
  handled_by_name: string | null;
};

type ProfileName = { id: string; name: string };

type LostItemFilters = RequestDateFilter & {
  status?: LostItemStatus;
};

async function attachReporterNames(
  items: LostItemRow[],
): Promise<LostItemWithReporter[]> {
  if (items.length === 0) return [];
  const supabase = await getSupabaseServerClient();
  const ids = new Set<string>();
  for (const item of items) {
    ids.add(item.reported_by_user_id);
    if (item.handled_by) ids.add(item.handled_by);
  }
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", Array.from(ids));
  const names = new Map(
    ((profiles ?? []) as ProfileName[]).map((p) => [p.id, p.name] as const),
  );
  return items.map((item) => ({
    ...item,
    reporter_name: names.get(item.reported_by_user_id) ?? "",
    handled_by_name: item.handled_by ? (names.get(item.handled_by) ?? null) : null,
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

// 반환완료(returned) 분실물만 — 전용 목록 화면(/mobile/requests/lost-found/returned)용.
// found_at 기간 제한 없이 전량 반환하고, 처리 시각(handled_at) 최신순으로 정렬한다
// (오래전에 발견됐어도 최근에 반환된 건이 위로).
export async function getReturnedLostItems(
  session: AppSession,
): Promise<LostItemWithReporter[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("lost_items")
    .select("*")
    .eq("organization_id", session.organization.id)
    .eq("status", "returned")
    .order("handled_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return attachReporterNames((data ?? []) as LostItemRow[]);
}

// 폐기(disposed) 분실물만 — 전용 목록 화면(/mobile/requests/lost-found/disposed)용.
// getReturnedLostItems 미러. 자동 폐기(handled_by null)·수동 폐기 모두 포함하고, 처리 시각
// (handled_at) 최신순으로 정렬한다. 90일 자동삭제 전까지의 폐기 내역을 현장에서 조회한다.
export async function getDisposedLostItems(
  session: AppSession,
): Promise<LostItemWithReporter[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("lost_items")
    .select("*")
    .eq("organization_id", session.organization.id)
    .eq("status", "disposed")
    .order("handled_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });
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
  const ids = new Set<string>([item.reported_by_user_id]);
  if (item.handled_by) ids.add(item.handled_by);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", Array.from(ids));
  const names = new Map(
    ((profiles ?? []) as ProfileName[]).map((p) => [p.id, p.name] as const),
  );
  return {
    ...item,
    reporter_name: names.get(item.reported_by_user_id) ?? "",
    handled_by_name: item.handled_by ? (names.get(item.handled_by) ?? null) : null,
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
