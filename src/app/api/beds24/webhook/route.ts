import { NextResponse, type NextRequest } from "next/server";
import { extractBeds24WebhookBookingCandidates } from "@/lib/beds24/booking-payload";
import { processBeds24WebhookBooking } from "@/lib/beds24/process-webhook-booking";
import { isBeds24SyncPaused } from "@/lib/beds24/sync-control";
import {
  recordBeds24WebhookEvent,
  recordBeds24WebhookRejection,
} from "@/lib/beds24/webhook-events";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function resolveWebhookSecret(request: NextRequest) {
  const fromHeader = request.headers.get("x-beds24-webhook-secret");
  const fromBearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromQuery = request.nextUrl.searchParams.get("secret");

  return fromHeader ?? fromBearer ?? fromQuery;
}

/**
 * Parse an inbound webhook body defensively. Beds24 deliveries have shipped as
 * JSON *and* as `application/x-www-form-urlencoded` (sometimes with a field whose
 * value is itself a JSON string) depending on account/config. We read the raw
 * text once and try both so the ingestion path never rejects a delivery merely
 * because of its transport encoding.
 */
function parseWebhookBody(raw: string): { body: unknown; parsed: boolean } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { body: null, parsed: false };

  // 1) JSON (Beds24 API v2 webhooks).
  try {
    return { body: JSON.parse(trimmed), parsed: true };
  } catch {
    // fall through
  }

  // 2) Form-encoded. Each field value may itself be JSON.
  try {
    const params = new URLSearchParams(trimmed);
    const keys = Array.from(params.keys());
    if (keys.length > 0) {
      const obj: Record<string, unknown> = {};
      for (const [key, value] of params) {
        try {
          obj[key] = JSON.parse(value);
        } catch {
          obj[key] = value;
        }
      }
      return { body: obj, parsed: true };
    }
  } catch {
    // fall through
  }

  return { body: trimmed, parsed: false };
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

  const contentType = request.headers.get("content-type");
  const rawText = await request.text();
  const { body } = parseWebhookBody(rawText);

  const supabase = getSupabaseServiceClient();
  const bookingPayloads = extractBeds24WebhookBookingCandidates(body);

  // No booking could be extracted (unparseable body or unrecognized envelope).
  // NEVER drop this silently: persist the raw body so the shape is debuggable and
  // the delivery is replayable, then ACK so Beds24 does not retry-storm. The daily
  // reconciliation heals the missed reservation from the Beds24 API in the meantime.
  if (bookingPayloads.length === 0) {
    console.error("[beds24/webhook] no booking candidates in delivery", {
      contentType,
      topLevelKeys:
        body && typeof body === "object" && !Array.isArray(body)
          ? Object.keys(body as Record<string, unknown>)
          : Array.isArray(body)
            ? "(array)"
            : typeof body,
      rawSample: rawText.slice(0, 500),
    });
    await recordBeds24WebhookRejection({
      supabase,
      httpStatus: 200,
      reason: "no_booking_candidates",
      rawBody: body ?? rawText,
      contentType,
    });
    return NextResponse.json(
      { ok: true, accepted: true, processed: 0, note: "no_booking_candidates_captured" },
      { status: 200 },
    );
  }

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

  if (process.env.NODE_ENV === "development") {
    console.log("[beds24/webhook] batch processed", {
      total: results.length,
      succeeded,
      failed,
      modes: results.map((result) => result.mode),
    });
  }

  // Observability: persist the batch result so a dropped/failed booking is traceable
  // (see public.beds24_webhook_events). Never blocks the webhook response.
  // When some bookings failed to process, keep their raw body for replay/debug.
  const anyFailed = failed > 0;
  await recordBeds24WebhookEvent({
    supabase,
    httpStatus: anyFailed ? 207 : 200,
    results,
    rawBody: anyFailed ? body : undefined,
    contentType: anyFailed ? contentType : undefined,
  });

  // Always ACK with 2xx once we have durably recorded the outcome, so Beds24 does
  // not treat a partially-failed batch as a delivery failure and retry-storm; the
  // failed rows are captured above and healed by reconciliation.
  return NextResponse.json(
    {
      ok: !anyFailed,
      processed: results.length,
      succeeded,
      failed,
      results,
    },
    { status: 200 },
  );
}
