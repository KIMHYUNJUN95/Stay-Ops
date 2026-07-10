import { NextResponse, type NextRequest } from "next/server";
import { extractBeds24WebhookBookingCandidates } from "@/lib/beds24/booking-payload";
import { processBeds24WebhookBooking } from "@/lib/beds24/process-webhook-booking";
import { isBeds24SyncPaused } from "@/lib/beds24/sync-control";
import { recordBeds24WebhookEvent } from "@/lib/beds24/webhook-events";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function resolveWebhookSecret(request: NextRequest) {
  const fromHeader = request.headers.get("x-beds24-webhook-secret");
  const fromBearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromQuery = request.nextUrl.searchParams.get("secret");

  return fromHeader ?? fromBearer ?? fromQuery;
}

export async function POST(request: NextRequest) {
  if (isBeds24SyncPaused()) {
    return NextResponse.json({ ok: true, paused: true }, { status: 202 });
  }

  const requiredSecret = process.env.BEDS24_WEBHOOK_SECRET?.trim();
  if (requiredSecret) {
    const provided = resolveWebhookSecret(request);
    if (!provided || provided !== requiredSecret) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const bookingPayloads = extractBeds24WebhookBookingCandidates(body);
  if (bookingPayloads.length === 0) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const organizationIdDefault = process.env.BEDS24_DEFAULT_ORGANIZATION_ID?.trim() ?? null;

  const results = [];
  for (const payload of bookingPayloads) {
    const result = await processBeds24WebhookBooking({
      payload,
      organizationIdDefault,
      supabase,
    });
    results.push(result);
  }

  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  const allOk = failed === 0;
  const httpStatus = allOk ? 200 : failed === results.length ? 400 : 207;

  if (process.env.NODE_ENV === "development") {
    console.log("[beds24/webhook] batch processed", {
      total: results.length,
      succeeded,
      failed,
      modes: results.map((result) => (result.ok ? result.mode : result.mode)),
    });
  }

  // Observability: persist the batch result so a dropped/failed booking is traceable
  // (see public.beds24_webhook_events). Never blocks the webhook response.
  await recordBeds24WebhookEvent({ supabase, httpStatus, results });

  return NextResponse.json(
    {
      ok: allOk,
      processed: results.length,
      succeeded,
      failed,
      results,
    },
    { status: httpStatus },
  );
}
