import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProcessWebhookBookingResult } from "@/lib/beds24/process-webhook-booking";
import type { Beds24ReservationsBackfillResult } from "@/lib/beds24/reservations-backfill";

// Observability for Beds24 ingestion. Every inbound webhook batch and every
// reconciliation run is recorded in public.beds24_webhook_events so that a dropped
// or never-processed booking is detectable instead of silently missing.
//
// Recording must never break the caller: a logging failure is swallowed and logged
// to the server console only. The webhook/cron response is unaffected.

/**
 * Record one inbound Beds24 webhook batch and its per-booking processing results.
 */
export async function recordBeds24WebhookEvent(params: {
  supabase: SupabaseClient<Database>;
  httpStatus: number;
  results: ProcessWebhookBookingResult[];
  organizationId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const { results } = params;
    const succeeded = results.filter((result) => result.ok).length;
    const failed = results.length - succeeded;
    const modes = Array.from(new Set(results.map((result) => result.mode)));
    const bookingSummary = results.map((result) => ({
      bookId: result.ok ? result.originalReservationId ?? result.sourceReservationId : result.sourceReservationId,
      status: result.ok ? result.mappedStatus : null,
      mode: result.mode,
    }));

    await params.supabase.from("beds24_webhook_events").insert({
      organization_id: params.organizationId ?? null,
      trigger_source: "webhook",
      http_status: params.httpStatus,
      processed_count: results.length,
      succeeded_count: succeeded,
      failed_count: failed,
      modes,
      booking_summary: bookingSummary as never,
      error_message: params.errorMessage ?? null,
    } as never);
  } catch (error) {
    console.error("[beds24/webhook-events] failed to record webhook event", error);
  }
}

/**
 * Record one reconciliation (scheduled cron or manual) catch-up sync.
 */
export async function recordBeds24ReconciliationEvent(params: {
  supabase: SupabaseClient<Database>;
  httpStatus: number;
  result: Beds24ReservationsBackfillResult;
  organizationId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const { result } = params;
    const modes = ["reconciliation"];
    if (result.partial) modes.push("partial");
    if (!result.attempted) modes.push("not_attempted");

    const bookingSummary = {
      window: { from: result.from, toExclusive: result.toExclusive },
      upsertedRows: result.upsertedRows,
      cancelledUpsertedRows: result.cancelledUpsertedRows,
      recoveredRows: result.recoveredRows,
      skipped: result.skipped,
      skippedReasons: result.skippedReasons,
    };

    await params.supabase.from("beds24_webhook_events").insert({
      organization_id: params.organizationId ?? null,
      trigger_source: "reconciliation",
      http_status: params.httpStatus,
      processed_count: result.fetchedRows,
      succeeded_count: result.upsertedRows,
      failed_count: result.skippedRows,
      modes,
      booking_summary: bookingSummary as never,
      error_message: params.errorMessage ?? null,
    } as never);
  } catch (error) {
    console.error("[beds24/webhook-events] failed to record reconciliation event", error);
  }
}
