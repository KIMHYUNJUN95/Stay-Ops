import { NextResponse, type NextRequest } from "next/server";
import { backfillBeds24Reservations } from "@/lib/beds24/reservations-backfill";
import { recordBeds24ReconciliationEvent } from "@/lib/beds24/webhook-events";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Production reconciliation safety net for Beds24 reservation ingestion.
//
// Webhooks remain the primary update path (see docs/planning/01-decision-log.md
// "Beds24 Webhook Strategy"). This endpoint is a low-frequency catch-up: it re-pulls
// the operational window (current month + next month) directly from the Beds24
// /bookings API and upserts anything missing, so a dropped/never-delivered webhook is
// healed on the next run instead of staying invisibly absent from the calendar.
//
// Driven daily by Vercel Cron (see vercel.json). Can also be triggered manually with
// the Beds24 webhook secret. This is NOT the dev-only backfill route — it is safe to
// run in production and is intentionally idempotent (pure upsert).

export const dynamic = "force-dynamic";
// Backfilling ~hundreds of rows in one window can exceed the default serverless
// timeout; allow up to 60s (Vercel Hobby-compatible ceiling).
export const maxDuration = 60;

function resolveProvidedSecret(request: NextRequest) {
  const fromBearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromHeader = request.headers.get("x-beds24-webhook-secret");
  const fromQuery = request.nextUrl.searchParams.get("secret");
  return fromBearer ?? fromHeader ?? fromQuery ?? null;
}

/**
 * Authorize a reconciliation call. Accepts either:
 *  - Vercel Cron's `Authorization: Bearer <CRON_SECRET>` header, or
 *  - the Beds24 webhook secret (manual trigger via header/query).
 * If neither secret is configured server-side, the endpoint stays closed (404).
 */
function authorize(request: NextRequest): { ok: true } | { ok: false; status: number } {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const webhookSecret = process.env.BEDS24_WEBHOOK_SECRET?.trim();
  if (!cronSecret && !webhookSecret) {
    return { ok: false, status: 404 };
  }

  const provided = resolveProvidedSecret(request);
  if (!provided) return { ok: false, status: 403 };
  if (cronSecret && provided === cronSecret) return { ok: true };
  if (webhookSecret && provided === webhookSecret) return { ok: true };
  return { ok: false, status: 403 };
}

function isUuid(value: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handle(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 404 ? "not_found" : "forbidden" }, { status: auth.status });
  }

  const organizationIdParam = request.nextUrl.searchParams.get("organizationId");
  if (organizationIdParam && !isUuid(organizationIdParam)) {
    return NextResponse.json({ ok: false, error: "invalid_organization_id" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  try {
    const result = await backfillBeds24Reservations(supabase, {
      organizationId: organizationIdParam ?? undefined,
    });

    const httpStatus = result.partial ? 207 : 200;
    await recordBeds24ReconciliationEvent({
      supabase,
      httpStatus,
      result,
      organizationId: organizationIdParam ?? null,
    });

    return NextResponse.json(
      {
        ok: !result.partial,
        mode: result.partial ? "partial_failure" : result.fetchedRows > 0 ? "success" : "no_data",
        ...result,
      },
      { status: httpStatus },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "reconcile_failed";
    console.error("[beds24/reconcile] failed", error);
    await recordBeds24ReconciliationEvent({
      supabase,
      httpStatus: 500,
      result: {
        attempted: true,
        endpointTried: null,
        from: "",
        toExclusive: "",
        partial: true,
        failedPageUrl: null,
        fetchedRows: 0,
        upsertedRows: 0,
        cancelledUpsertedRows: 0,
        skippedRows: 0,
        recoveredRows: 0,
        skipped: ["reconcile_failed"],
        skippedReasons: [],
      },
      organizationId: organizationIdParam ?? null,
      errorMessage: message,
    });
    return NextResponse.json({ ok: false, error: "reconcile_failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
