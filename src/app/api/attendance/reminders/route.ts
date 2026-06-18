import { NextResponse, type NextRequest } from "next/server";
import { runAttendanceReminders } from "@/lib/notifications/attendance-reminders";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Scheduled attendance reminder/abnormal evaluator (Step 14): the worker 18:30 open-session reminder
// (once/Tokyo-day, deduped) + the admin incomplete/stale-session alert. Time-based — no user action
// triggers them — so this is a narrowly-scoped scheduled path (mirrors /api/tasks/reminders).
//
// Run by Vercel Cron (~18:30 Asia/Tokyo) authorized with CRON_SECRET so anonymous callers can't fire it.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: NextRequest): { ok: true } | { ok: false; status: number } {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return { ok: false, status: 404 };
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("secret") ??
    null;
  if (!provided) return { ok: false, status: 403 };
  if (provided !== cronSecret) return { ok: false, status: 403 };
  return { ok: true };
}

function isUuid(value: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handle(request: NextRequest) {
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

  try {
    const result = await runAttendanceReminders(getSupabaseServiceClient(), {
      organizationId: organizationIdParam ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[attendance/reminders] failed", error);
    return NextResponse.json({ ok: false, error: "reminders_failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
