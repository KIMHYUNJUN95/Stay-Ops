"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/admin-session";
import { lostItemStatuses, type LostItemStatus } from "@/lib/lost-found";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isValidStatus(value: string): value is LostItemStatus {
  return (lostItemStatuses as readonly string[]).includes(value);
}

export async function updateLostItemStatus(formData: FormData) {
  const session = await requireAdminSession();

  const itemId = String(formData.get("itemId") ?? "").trim();
  const newStatus = String(formData.get("status") ?? "").trim();

  if (!isValidUUID(itemId)) {
    redirect("/admin/lost-found?error=not_found");
  }
  if (!isValidStatus(newStatus)) {
    redirect(`/admin/lost-found/${itemId}?error=status_update_failed`);
  }

  const supabase = await getSupabaseServerClient();

  // Confirm the record belongs to this org before updating (defense-in-depth; RLS also guards).
  const { data: existing } = await supabase
    .from("lost_items")
    .select("id")
    .eq("id", itemId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (!existing) {
    redirect(`/admin/lost-found?error=not_found`);
  }

  const { error } = await supabase
    .from("lost_items")
    .update({ status: newStatus } as never)
    .eq("id", itemId)
    .eq("organization_id", session.organization.id);

  if (error) {
    redirect(`/admin/lost-found/${itemId}?error=status_update_failed`);
  }

  redirect(`/admin/lost-found/${itemId}?statusUpdated=1`);
}
