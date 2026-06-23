import { NextResponse, type NextRequest } from "next/server";
import { backfillBeds24RoomMaster } from "@/lib/beds24/properties-room-master-sync";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function ensureDevOnly(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "true") {
    console.warn("[dev/beds24-room-master] gate not enabled");
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const host = request.nextUrl.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.warn(`[dev/beds24-room-master] blocked non-local host: ${host}`);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return null;
}

function resolveSecret(request: NextRequest) {
  const fromHeader = request.headers.get("x-beds24-webhook-secret");
  const fromBearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromQuery = request.nextUrl.searchParams.get("secret");

  return fromHeader ?? fromBearer ?? fromQuery;
}

function isUuid(value: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handle(request: NextRequest) {
  const blocked = ensureDevOnly(request);
  if (blocked) return blocked;

  const requiredSecret = process.env.BEDS24_WEBHOOK_SECRET?.trim();
  if (!requiredSecret) {
    console.warn("[dev/beds24-room-master] webhook secret not configured");
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const providedSecret = resolveSecret(request);
  if (!providedSecret || providedSecret !== requiredSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const organizationIdParam = request.nextUrl.searchParams.get("organizationId");
  if (organizationIdParam && !isUuid(organizationIdParam)) {
    return NextResponse.json({ error: "invalid_organization_id" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const result = await backfillBeds24RoomMaster(supabase, {
      organizationId: organizationIdParam ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("[dev/beds24-room-master] failed", error);
    return NextResponse.json({ ok: false, error: "backfill_failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
