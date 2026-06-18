import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY: seed the logged-in user's employment type + hourly rate so the self monthly pay screen
// (/mobile/attendance/pay) shows real numbers during app testing. The proper owner/payroll_admin
// employment-type + rate MANAGEMENT (Step 9) and the admin UI live in the deferred web dashboard; this
// is only a local testing convenience, gated exactly like /api/dev/seed-login.
//
// Usage (while logged into the app):
//   GET /api/dev/attendance/seed-pay                 → hourly, ¥1200/h, effective 2020-01-01
//   GET /api/dev/attendance/seed-pay?rate=1500       → hourly, ¥1500/h
//   GET /api/dev/attendance/seed-pay?type=salaried   → salaried (no pay)
// Replaces the caller's existing history rows in this org (idempotent for testing).
// ─────────────────────────────────────────────────────────────────────────────

const EFFECTIVE_FROM = "2020-01-01";

function isLocalDevHost(host: string) {
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
}

function getRequestHostname(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost
    ? (forwardedHost.split(",")[0]?.trim() ?? request.nextUrl.host)
    : (request.headers.get("host") ?? request.nextUrl.host);
  return host.split(":")[0] ?? request.nextUrl.hostname;
}

function ensureDevOnly(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (process.env.ENABLE_DEV_SEED_LOGIN !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isLocalDevHost(getRequestHostname(request))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const blocked = ensureDevOnly(request);
  if (blocked) return blocked;

  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return NextResponse.json({ error: "no_org_context" }, { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const type = params.get("type") === "salaried" ? "salaried" : "hourly";
  const rate = Number(params.get("rate") ?? "1200");
  const hourlyRate = Number.isFinite(rate) && rate >= 0 ? rate : 1200;

  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;
  const userId = session.user.id;

  try {
    // Reset this user's history in the org (testing idempotency), then insert one open-ended segment.
    await service
      .from("employment_type_history")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", userId);
    await service
      .from("hourly_rate_history")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", userId);

    const empIns = await service.from("employment_type_history").insert({
      organization_id: organizationId,
      user_id: userId,
      employment_type: type,
      effective_from: EFFECTIVE_FROM,
      created_by_user_id: userId,
    } as never);
    if (empIns.error) throw new Error(empIns.error.message);

    if (type === "hourly") {
      const rateIns = await service.from("hourly_rate_history").insert({
        organization_id: organizationId,
        user_id: userId,
        hourly_rate: hourlyRate,
        effective_from: EFFECTIVE_FROM,
        created_by_user_id: userId,
      } as never);
      if (rateIns.error) throw new Error(rateIns.error.message);
    }

    return NextResponse.json({
      ok: true,
      employment_type: type,
      hourly_rate: type === "hourly" ? hourlyRate : null,
      effective_from: EFFECTIVE_FROM,
      note: "Seeded for the current user. Open /mobile/attendance/pay to view.",
    });
  } catch (error) {
    console.error("[dev/attendance/seed-pay] failed:", error);
    return NextResponse.json({ error: "seed_pay_failed" }, { status: 500 });
  }
}
