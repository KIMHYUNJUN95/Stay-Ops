"use server";

import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type DeleteResult = { ok: true } | { ok: false; error: "unauthorized" | "not_found" | "delete_failed" };

export async function deleteLostItem(id: string): Promise<DeleteResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return { ok: false, error: "unauthorized" };
  }
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("lost_items")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}

export async function deleteMaintenanceReport(id: string): Promise<DeleteResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return { ok: false, error: "unauthorized" };
  }
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("maintenance_reports")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}

export async function deleteOrderRequest(id: string): Promise<DeleteResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return { ok: false, error: "unauthorized" };
  }
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("order_requests")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}
