"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/admin-session";
import { maintenanceStatuses, type MaintenanceStatus } from "@/lib/maintenance-reports";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isValidStatus(value: string): value is MaintenanceStatus {
  return (maintenanceStatuses as readonly string[]).includes(value);
}

export async function updateMaintenanceStatus(formData: FormData) {
  const session = await requireAdminSession();

  const reportId = String(formData.get("reportId") ?? "").trim();
  const newStatus = String(formData.get("status") ?? "").trim();

  if (!isValidUUID(reportId)) {
    redirect("/admin/maintenance?error=not_found");
  }
  if (!isValidStatus(newStatus)) {
    redirect(`/admin/maintenance/${reportId}?error=status_update_failed`);
  }

  const supabase = await getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("maintenance_reports")
    .select("id")
    .eq("id", reportId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (!existing) {
    redirect("/admin/maintenance?error=not_found");
  }

  const { error } = await supabase
    .from("maintenance_reports")
    .update({ status: newStatus } as never)
    .eq("id", reportId)
    .eq("organization_id", session.organization.id);

  if (error) {
    redirect(`/admin/maintenance/${reportId}?error=status_update_failed`);
  }

  redirect(`/admin/maintenance/${reportId}?statusUpdated=1`);
}

export async function deleteMaintenanceReportById(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();

  if (!isValidUUID(id)) {
    return { ok: false, error: "not_found" };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("maintenance_reports")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .select("id");

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "not_found" };
  }

  return { ok: true };
}
