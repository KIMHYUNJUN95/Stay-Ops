import { NextResponse, type NextRequest } from "next/server";
import { syncOrganizationReviews } from "@/lib/beds24/reviews-sync";
import { isBeds24SyncPaused } from "@/lib/beds24/sync-control";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Production collection trigger for Beds24 external reviews (Airbnb / Booking.com).
//
// Reviews have no webhook, so they are the one Beds24 read path that must be pulled on a
// schedule (see docs/engineering/01-beds24-integration.md → "External Reviews"). Both Beds24
// endpoints require a unit parameter, so one cycle costs (Airbnb-linked room types) +
// (Booking-linked properties) requests plus pagination. That is why the routine schedule is
// once a day with a 30-day window, and the deep sweep is opt-in via `?full=1`.
//
// Driven by Vercel Cron (see vercel.json). Can also be triggered manually with the Beds24
// webhook secret. Collection is a pure upsert on (organization_id, provider,
// external_review_id), so re-running is harmless.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 정기 실행 창. 하루 2회 주기라 짧게 잡아 페이지네이션을 줄인다. */
// Booking.com 전용 창(Airbnb는 `from`이 없어 항상 전량이 온다). 30일인 이유: 리뷰는 체크아웃
// 며칠 뒤에 달리고 `last_change_timestamp`가 있는 걸 보면 수정도 되므로, 7일 창은 늦게 달린
// 리뷰를 놓칠 수 있다. UPSERT라 겹쳐 받아도 무해하다.
const ROUTINE_SINCE_DAYS = 30;
/** 초기 도입/복구용 전량 수집 창. */
// `?full=1` — 초기 도입/복구용 6개월(180일). 첫 예약이 2026-04-22이라 영업 이력 자체가 약 3.5개월
// 이므로 6개월이면 사실상 전량을 덮는다. Airbnb에는 적용되지 않는다 — 날짜 파라미터가 없고 최대
// 50건이 전량으로 오며, 여기에 기간 컷을 걸면 상한 탓에 다시 못 가져올 데이터를 버리게 된다.
const FULL_SINCE_DAYS = 180;

function resolveProvidedSecret(request: NextRequest) {
  const fromBearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromHeader = request.headers.get("x-beds24-webhook-secret");
  const fromQuery = request.nextUrl.searchParams.get("secret");
  return fromBearer ?? fromHeader ?? fromQuery ?? null;
}

/**
 * Authorize a review-collection call. Same contract as /api/beds24/reconcile:
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

function isTruthyFlag(value: string | null) {
  if (!value) return false;
  const flag = value.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

async function resolveOrganizationIds(organizationId: string | null) {
  if (organizationId) return [organizationId];

  const supabase = getSupabaseServiceClient();
  const result = await supabase
    .from("organizations")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new Error(`reviews sync org query failed: ${result.error.message}`);
  }

  return ((result.data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function handle(request: NextRequest) {
  if (isBeds24SyncPaused()) {
    return NextResponse.json({ ok: true, paused: true }, { status: 202 });
  }

  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 404 ? "not_found" : "forbidden" },
      { status: auth.status },
    );
  }

  const organizationIdParam = request.nextUrl.searchParams.get("organizationId");
  if (organizationIdParam && !isUuid(organizationIdParam)) {
    return NextResponse.json({ ok: false, error: "invalid_organization_id" }, { status: 400 });
  }

  const full = isTruthyFlag(request.nextUrl.searchParams.get("full"));
  const sinceDays = full ? FULL_SINCE_DAYS : ROUTINE_SINCE_DAYS;

  let organizationIds: string[];
  try {
    organizationIds = await resolveOrganizationIds(organizationIdParam);
  } catch (error) {
    console.error("[beds24/reviews-sync] organization lookup failed", error);
    return NextResponse.json({ ok: false, error: "organization_lookup_failed" }, { status: 500 });
  }

  const organizations: Array<{
    organizationId: string;
    upserted: number;
    skipped: string[];
    requests: number;
    creditsRemaining: number | null;
    stoppedEarly: boolean;
  }> = [];
  const failures: Array<{ organizationId: string; error: string }> = [];

  let upserted = 0;
  let requests = 0;
  let stoppedEarly = false;
  let creditsRemaining: number | null = null;

  for (const organizationId of organizationIds) {
    try {
      const result = await syncOrganizationReviews({ organizationId, sinceDays });
      organizations.push({ organizationId, ...result });
      upserted += result.upserted;
      requests += result.requests;
      if (result.stoppedEarly) stoppedEarly = true;
      if (result.creditsRemaining !== null) creditsRemaining = result.creditsRemaining;
      if (result.stoppedEarly) {
        // 크레딧이 바닥나면 남은 조직은 다음 주기가 이어받는다.
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "reviews_sync_failed";
      console.error("[beds24/reviews-sync] organization failed", organizationId, message);
      failures.push({ organizationId, error: message });
    }
  }

  const partial = failures.length > 0;
  return NextResponse.json(
    {
      ok: !partial,
      mode: partial ? "partial_failure" : upserted > 0 ? "success" : "no_data",
      full,
      sinceDays,
      organizationCount: organizationIds.length,
      upserted,
      requests,
      creditsRemaining,
      stoppedEarly,
      organizations,
      failures,
    },
    { status: partial ? 207 : 200 },
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
