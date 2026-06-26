"use server";

// Transport Reimbursement — worker-facing server actions (per-user monthly ledger).
//
// Self-only: every mutation acts on the authenticated user's OWN report/items, never another user's.
// All writes use the service-role client (RLS denies direct authenticated writes). Org isolation is
// enforced on every query. This ledger is fully separate from payroll — no wage values are read here.
// Reports are editable only while `draft` or `rejected`; once submitted they lock until an admin acts.

import { revalidatePath } from "next/cache";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  getOrCreateTransportReport,
  getTransportReport,
  syncReportTotalAmount,
  type TransportEntryMode,
} from "@/lib/transport-reimbursement";

const TRANSPORT_PATH = "/mobile/attendance/transport";
const IMAGE_BUCKET = "request-images";

type Service = ReturnType<typeof getSupabaseServiceClient>;

// The transport_reimbursement_* tables are not yet in the generated Database types; service-client
// table access is cast through `untyped`. Remove once src/types/database.ts is regenerated.
function untyped(service: Service) {
  return service as unknown as {
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: (...args: any[]) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert: (...args: any[]) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (...args: any[]) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete: (...args: any[]) => any;
    };
  };
}

const EDITABLE_STATUSES = new Set(["draft", "rejected"]);

/** Convert a 'YYYY-MM' month key to the 'YYYY-MM-01' first-day form used by target_month. */
function monthKeyToFirstDay(targetMonth: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) return null;
  return `${targetMonth}-01`;
}

// ── Create ─────────────────────────────────────────────────────────────────

export type CreateTransportItemInput = {
  targetMonth: string; // 'YYYY-MM'
  usageDate: string; // 'YYYY-MM-DD'
  amountYen: number;
  entryMode: TransportEntryMode;
  attendanceSessionId?: string | null;
  propertyId?: string | null;
  buildingLabel?: string;
  contextSummary?: string;
  memo?: string | null;
};

export type CreateTransportItemResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string };

export async function createTransportItemAction(
  input: CreateTransportItemInput,
): Promise<CreateTransportItemResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  const targetMonthDate = monthKeyToFirstDay(input.targetMonth);
  if (!targetMonthDate) return { ok: false, error: "invalid_month" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.usageDate)) return { ok: false, error: "invalid_date" };
  if (!Number.isInteger(input.amountYen) || input.amountYen <= 0) {
    return { ok: false, error: "invalid_amount" };
  }
  if (input.entryMode !== "linked" && input.entryMode !== "manual") {
    return { ok: false, error: "invalid_entry_mode" };
  }

  const report = await getOrCreateTransportReport(service, organizationId, userId, targetMonthDate);
  if (!EDITABLE_STATUSES.has(report.status)) return { ok: false, error: "report_not_editable" };

  const workContext: Record<string, string> = {};
  if (input.buildingLabel?.trim()) workContext.buildingLabel = input.buildingLabel.trim();
  if (input.contextSummary?.trim()) workContext.contextSummary = input.contextSummary.trim();

  const ins = await untyped(service)
    .from("transport_reimbursement_items")
    .insert({
      organization_id: organizationId,
      report_id: report.id,
      user_id: userId,
      usage_date: input.usageDate,
      amount_yen: input.amountYen,
      entry_mode: input.entryMode,
      attendance_session_id: input.attendanceSessionId ?? null,
      property_id: input.propertyId ?? null,
      work_context: workContext,
      memo: input.memo?.trim() ? input.memo.trim() : null,
    })
    .select("id")
    .maybeSingle();
  if (ins.error || !ins.data) return { ok: false, error: "insert_failed" };

  await syncReportTotalAmount(service, report.id);
  revalidatePath(TRANSPORT_PATH);
  return { ok: true, itemId: (ins.data as { id: string }).id };
}

// ── Update ─────────────────────────────────────────────────────────────────

export type UpdateTransportItemInput = {
  itemId: string;
  amountYen?: number;
  memo?: string | null;
  buildingLabel?: string;
  contextSummary?: string;
};

export type TransportActionResult = { ok: true } | { ok: false; error: string };

/**
 * Resolve a self-owned item + its report status (org-scoped). Returns an error code when the item is
 * missing, owned by someone else, or its report is not editable.
 */
async function loadEditableOwnItem(
  service: Service,
  organizationId: string,
  userId: string,
  itemId: string,
): Promise<
  | {
      ok: true;
      item: { id: string; report_id: string; work_context: Record<string, string> | null };
    }
  | { ok: false; error: string }
> {
  const res = await untyped(service)
    .from("transport_reimbursement_items")
    .select("id, report_id, user_id, organization_id, work_context")
    .eq("id", itemId)
    .maybeSingle();
  const row = res.data as {
    id: string;
    report_id: string;
    user_id: string;
    organization_id: string;
    work_context: Record<string, string> | null;
  } | null;
  if (!row || row.organization_id !== organizationId || row.user_id !== userId) {
    return { ok: false, error: "forbidden" };
  }

  const reportRes = await untyped(service)
    .from("transport_reimbursement_reports")
    .select("status")
    .eq("id", row.report_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const report = reportRes.data as { status: string } | null;
  if (!report) return { ok: false, error: "forbidden" };
  if (!EDITABLE_STATUSES.has(report.status)) return { ok: false, error: "report_not_editable" };

  return {
    ok: true,
    item: { id: row.id, report_id: row.report_id, work_context: row.work_context },
  };
}

export async function updateTransportItemAction(
  input: UpdateTransportItemInput,
): Promise<TransportActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  const loaded = await loadEditableOwnItem(service, organizationId, userId, input.itemId);
  if (!loaded.ok) return loaded;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (input.amountYen !== undefined) {
    if (!Number.isInteger(input.amountYen) || input.amountYen <= 0) {
      return { ok: false, error: "invalid_amount" };
    }
    update.amount_yen = input.amountYen;
  }
  if (input.memo !== undefined) {
    update.memo = input.memo?.trim() ? input.memo.trim() : null;
  }
  if (input.buildingLabel !== undefined || input.contextSummary !== undefined) {
    const workContext = { ...(loaded.item.work_context ?? {}) };
    if (input.buildingLabel !== undefined) {
      if (input.buildingLabel.trim()) workContext.buildingLabel = input.buildingLabel.trim();
      else delete workContext.buildingLabel;
    }
    if (input.contextSummary !== undefined) {
      if (input.contextSummary.trim()) workContext.contextSummary = input.contextSummary.trim();
      else delete workContext.contextSummary;
    }
    update.work_context = workContext;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const upd = await untyped(service)
    .from("transport_reimbursement_items")
    .update(update)
    .eq("id", loaded.item.id)
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (upd.error) return { ok: false, error: "update_failed" };

  await syncReportTotalAmount(service, loaded.item.report_id);
  revalidatePath(TRANSPORT_PATH);
  return { ok: true };
}

// ── Delete item ──────────────────────────────────────────────────────────────

export async function deleteTransportItemAction(itemId: string): Promise<TransportActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  const loaded = await loadEditableOwnItem(service, organizationId, userId, itemId);
  if (!loaded.ok) return loaded;
  const reportId = loaded.item.report_id;

  // Hard-delete the item's storage files first (DB cascade removes the image rows).
  const imgRes = await untyped(service)
    .from("transport_reimbursement_item_images")
    .select("storage_path")
    .eq("item_id", itemId)
    .eq("organization_id", organizationId);
  const paths = ((imgRes.data ?? []) as { storage_path: string }[])
    .map((r) => r.storage_path)
    .filter(Boolean);
  if (paths.length > 0) {
    const { error } = await service.storage.from(IMAGE_BUCKET).remove(paths);
    if (error) {
      // Non-fatal: a stray file is the worst case; the DB rows are removed by cascade below.
      console.error("[deleteTransportItemAction] storage remove failed:", error.message);
    }
  }

  const del = await untyped(service)
    .from("transport_reimbursement_items")
    .delete()
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (del.error) return { ok: false, error: "delete_failed" };

  await syncReportTotalAmount(service, reportId);
  revalidatePath(TRANSPORT_PATH);
  return { ok: true };
}

// ── Item images ────────────────────────────────────────────────────────────

export async function addTransportItemImageAction(
  itemId: string,
  storagePath: string,
): Promise<TransportActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  if (!storagePath || !storagePath.startsWith(`${organizationId}/transport-reimbursements/`)) {
    return { ok: false, error: "invalid_path" };
  }

  const loaded = await loadEditableOwnItem(service, organizationId, userId, itemId);
  if (!loaded.ok) return loaded;

  // Next sort_order: append after existing images.
  const countRes = await untyped(service)
    .from("transport_reimbursement_item_images")
    .select("id")
    .eq("item_id", itemId)
    .eq("organization_id", organizationId);
  const nextOrder = ((countRes.data ?? []) as { id: string }[]).length;

  const ins = await untyped(service)
    .from("transport_reimbursement_item_images")
    .insert({
      organization_id: organizationId,
      report_id: loaded.item.report_id,
      item_id: itemId,
      user_id: userId,
      storage_path: storagePath,
      sort_order: nextOrder,
    });
  if (ins.error) return { ok: false, error: "insert_failed" };

  revalidatePath(TRANSPORT_PATH);
  return { ok: true };
}

export async function deleteTransportItemImageAction(
  imageId: string,
): Promise<TransportActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  const imgRes = await untyped(service)
    .from("transport_reimbursement_item_images")
    .select("id, item_id, storage_path, user_id, organization_id")
    .eq("id", imageId)
    .maybeSingle();
  const image = imgRes.data as {
    id: string;
    item_id: string;
    storage_path: string;
    user_id: string;
    organization_id: string;
  } | null;
  if (!image || image.organization_id !== organizationId || image.user_id !== userId) {
    return { ok: false, error: "forbidden" };
  }

  // The owning report must still be editable.
  const loaded = await loadEditableOwnItem(service, organizationId, userId, image.item_id);
  if (!loaded.ok) return loaded;

  if (image.storage_path) {
    const { error } = await service.storage.from(IMAGE_BUCKET).remove([image.storage_path]);
    if (error) {
      console.error("[deleteTransportItemImageAction] storage remove failed:", error.message);
    }
  }

  const del = await untyped(service)
    .from("transport_reimbursement_item_images")
    .delete()
    .eq("id", imageId)
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (del.error) return { ok: false, error: "delete_failed" };

  revalidatePath(TRANSPORT_PATH);
  return { ok: true };
}

// ── Submit ─────────────────────────────────────────────────────────────────

export async function submitTransportReportAction(
  targetMonth: string,
): Promise<TransportActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  const targetMonthDate = monthKeyToFirstDay(targetMonth);
  if (!targetMonthDate) return { ok: false, error: "invalid_month" };

  const report = await getTransportReport(service, organizationId, userId, targetMonthDate);
  if (!report) return { ok: false, error: "no_report" };
  if (!EDITABLE_STATUSES.has(report.status)) return { ok: false, error: "report_not_editable" };

  // At least one item.
  const itemsRes = await untyped(service)
    .from("transport_reimbursement_items")
    .select("id")
    .eq("report_id", report.id)
    .eq("organization_id", organizationId);
  const itemIds = ((itemsRes.data ?? []) as { id: string }[]).map((r) => r.id);
  if (itemIds.length === 0) return { ok: false, error: "no_items" };

  // Every item must carry at least one evidence image.
  const imgRes = await untyped(service)
    .from("transport_reimbursement_item_images")
    .select("item_id")
    .in("item_id", itemIds)
    .eq("organization_id", organizationId);
  const withImage = new Set(
    ((imgRes.data ?? []) as { item_id: string }[]).map((r) => r.item_id),
  );
  const missing = itemIds.some((id) => !withImage.has(id));
  if (missing) return { ok: false, error: "missing_evidence" };

  const upd = await untyped(service)
    .from("transport_reimbursement_reports")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", report.id)
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (upd.error) return { ok: false, error: "submit_failed" };

  revalidatePath(TRANSPORT_PATH);
  return { ok: true };
}
