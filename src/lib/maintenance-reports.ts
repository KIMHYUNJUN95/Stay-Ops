import type { AppSession } from "@/lib/session";
import { getTimestampRange, type RequestDateFilter } from "@/lib/request-filters";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type MaintenanceReportRow =
  Database["public"]["Tables"]["maintenance_reports"]["Row"];
export type MaintenanceStatus = Database["public"]["Enums"]["maintenance_status"];

export const maintenanceStatuses: readonly MaintenanceStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

export type MaintenanceReportWithReporter = MaintenanceReportRow & {
  reporter_name: string;
};

type ProfileName = { id: string; name: string };

type MaintenanceReportFilters = RequestDateFilter & {
  status?: MaintenanceStatus;
};

async function attachReporterNames(
  items: MaintenanceReportRow[],
): Promise<MaintenanceReportWithReporter[]> {
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

export async function getOrgMaintenanceReports(
  session: AppSession,
  filters: MaintenanceReportFilters = {},
): Promise<MaintenanceReportWithReporter[]> {
  const supabase = await getSupabaseServerClient();
  const range = getTimestampRange(filters);
  let query = supabase
    .from("maintenance_reports")
    .select("*")
    .eq("organization_id", session.organization.id);
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (range.from) {
    query = query.gte("created_at", range.from);
  }
  if (range.to) {
    query = query.lt("created_at", range.to);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return attachReporterNames((data ?? []) as MaintenanceReportRow[]);
}

export async function getMaintenanceReportById(
  session: AppSession,
  id: string,
): Promise<MaintenanceReportWithReporter | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("maintenance_reports")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!data) return null;
  const item = data as MaintenanceReportRow;
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

export async function getMyMaintenanceReportById(
  session: AppSession,
  id: string,
): Promise<MaintenanceReportRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("maintenance_reports")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .eq("reported_by_user_id", session.user.id)
    .maybeSingle();
  return (data as MaintenanceReportRow | null) ?? null;
}

export async function getMyMaintenanceReports(
  session: AppSession,
  filters: RequestDateFilter = {},
): Promise<MaintenanceReportRow[]> {
  const supabase = await getSupabaseServerClient();
  const range = getTimestampRange(filters);
  let query = supabase
    .from("maintenance_reports")
    .select("*")
    .eq("organization_id", session.organization.id)
    .eq("reported_by_user_id", session.user.id);
  if (range.from) {
    query = query.gte("created_at", range.from);
  }
  if (range.to) {
    query = query.lt("created_at", range.to);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaintenanceReportRow[];
}
