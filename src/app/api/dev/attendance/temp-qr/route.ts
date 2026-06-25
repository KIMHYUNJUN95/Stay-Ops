import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  createAttendanceSite,
  getActiveQrToken,
  issueAttendanceQr,
} from "@/lib/attendance-sites";
import { ATTENDANCE_DEFAULT_RADIUS_METERS } from "@/lib/attendance";
import type { AttendanceSiteRow } from "@/lib/attendance";

// i18n-ignore-file: development-only local QR helper, unreachable in production.

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY temporary QR provisioning for app attendance testing.
//
// The owner-only site/QR admin UI will live in the WEB DASHBOARD later. Until then, this dev tool
// ensures a temporary attendance site exists and issues an ACTIVE QR token for it, then renders a
// scannable QR (so the app's clock-in capture flow can be tested once it is wired in Step 3+).
//
// Gated by development NODE_ENV + the ENABLE_LOCAL_DEV_TOOLS opt-in + a local/LAN host. It is never
// reachable in production. It is NOT owner-gated (it's a local testing
// tool); the real web-dashboard server actions WILL enforce owner-only.
//
// Usage (while logged into the app in the same browser):
//   GET /api/dev/attendance/temp-qr             → HTML page with the active QR (issues one if needed)
//   GET /api/dev/attendance/temp-qr?reissue=1    → force a brand-new active token (old one revoked)
//   GET /api/dev/attendance/temp-qr?format=json  → JSON { site, token, qrSvgDataUrl }
//   optional: &lat=..&lng=..&radius=..&name=..&ssid=..  (only used when first creating the temp site)
// ─────────────────────────────────────────────────────────────────────────────

const TEMP_SITE_NAME = "임시 테스트 현장";
// Default coordinates: central Tokyo (Tokyo Tower area). Override with ?lat/?lng on first creation.
const DEFAULT_LAT = 35.6586;
const DEFAULT_LNG = 139.7454;
const DEFAULT_SSID = "StayOps-Test";

function isLocalDevHost(host: string) {
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // Cloudflare quick tunnel (dev-only): lets this temp-QR page open on a phone over
  // any network. Still gated by NODE_ENV=development + ENABLE_LOCAL_DEV_TOOLS, so it is
  // never reachable in production regardless of host.
  return host.endsWith(".trycloudflare.com");
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
  if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "true") {
    console.warn("[dev/attendance/temp-qr] gate not enabled (ENABLE_LOCAL_DEV_TOOLS)");
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isLocalDevHost(getRequestHostname(request))) {
    console.warn("[dev/attendance/temp-qr] blocked non-local host");
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

function parseNumber(value: string | null, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Find the temp site for this org by its well-known name, or create it. */
async function ensureTempSite(
  organizationId: string,
  opts: { lat: number; lng: number; radius: number; name: string; ssid: string },
): Promise<AttendanceSiteRow> {
  const existing = await getSupabaseServiceClient()
    .from("attendance_sites")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("name", opts.name)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`find temp site failed: ${existing.error.message}`);
  }
  if (existing.data) return existing.data as AttendanceSiteRow;

  return createAttendanceSite({
    organizationId,
    name: opts.name,
    latitude: opts.lat,
    longitude: opts.lng,
    allowedRadiusMeters: opts.radius,
    wifiSsids: opts.ssid ? [opts.ssid] : [],
    isActive: true,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: NextRequest) {
  const blocked = ensureDevOnly(request);
  if (blocked) return blocked;

  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return NextResponse.json(
      {
        error: "no_org_context",
        hint: "Log into the app (with an organization) in this browser, then reload this URL.",
      },
      { status: 400 },
    );
  }

  const params = request.nextUrl.searchParams;
  const wantsJson = params.get("format") === "json";
  const forceReissue = params.get("reissue") === "1";

  try {
    const site = await ensureTempSite(session.organization.id, {
      lat: parseNumber(params.get("lat"), DEFAULT_LAT),
      lng: parseNumber(params.get("lng"), DEFAULT_LNG),
      radius: parseNumber(params.get("radius"), ATTENDANCE_DEFAULT_RADIUS_METERS),
      name: params.get("name")?.trim() || TEMP_SITE_NAME,
      ssid: params.get("ssid")?.trim() || DEFAULT_SSID,
    });

    let qr = forceReissue ? null : await getActiveQrToken(session.organization.id, site.id);
    if (!qr) {
      qr = await issueAttendanceQr({
        organizationId: session.organization.id,
        siteId: site.id,
        createdByUserId: session.user.id,
      });
    }

    const qrSvg = await QRCode.toString(qr.token, { type: "svg", margin: 1, width: 260 });

    if (wantsJson) {
      return NextResponse.json({
        site: {
          id: site.id,
          name: site.name,
          latitude: site.latitude,
          longitude: site.longitude,
          allowed_radius_meters: site.allowed_radius_meters,
          wifi_ssids: site.wifi_ssids,
          is_active: site.is_active,
        },
        token: qr.token,
        qr_token_id: qr.id,
        issued_at: qr.issued_at,
        qrSvgDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`,
      });
    }

    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>임시 출퇴근 QR (DEV)</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#f3f1ec; color:#1c2b2a; }
  .wrap { max-width: 420px; margin: 0 auto; padding: 24px 18px 48px; }
  .card { background:#fff; border:1px solid #e7e3da; border-radius:16px; padding:20px; margin-top:14px; }
  h1 { font-size:18px; margin:0 0 4px; }
  .muted { color:#6b726f; font-size:13px; }
  .qr { display:flex; justify-content:center; padding:14px 0; }
  .qr svg { width:260px; height:260px; }
  .token { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; word-break:break-all;
    background:#f6f4ef; border:1px solid #e7e3da; border-radius:10px; padding:10px; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:13px; margin:0; }
  dt { color:#6b726f; } dd { margin:0; }
  .actions { display:flex; gap:10px; margin-top:16px; }
  .btn { flex:1; text-align:center; text-decoration:none; padding:11px 12px; border-radius:11px; font-size:14px;
    font-weight:600; border:1px solid #d7d2c7; color:#1c2b2a; background:#fff; }
  .btn.primary { background:#1c2b2a; color:#fff; border-color:#1c2b2a; }
  .warn { margin-top:18px; font-size:12px; color:#8a5a00; background:#fff7e6; border:1px solid #ffe2a8;
    border-radius:10px; padding:10px; }
</style></head>
<body><div class="wrap">
  <h1>임시 출퇴근 QR <span class="muted">(DEV)</span></h1>
  <p class="muted">앱 테스트용 임시 QR입니다. 사이트/QR 정식 관리는 추후 웹 대시보드에서 제공됩니다.</p>
  <div class="card">
    <div class="qr">${qrSvg}</div>
    <div class="token">${escapeHtml(qr.token)}</div>
  </div>
  <div class="card">
    <dl>
      <dt>사이트</dt><dd>${escapeHtml(site.name)}</dd>
      <dt>좌표</dt><dd>${site.latitude}, ${site.longitude}</dd>
      <dt>허용 반경</dt><dd>${site.allowed_radius_meters} m</dd>
      <dt>Wi-Fi SSID</dt><dd>${escapeHtml((site.wifi_ssids ?? []).join(", ") || "—")} <span class="muted">(준비중 · 비활성)</span></dd>
      <dt>발급 시각</dt><dd>${escapeHtml(qr.issued_at)}</dd>
    </dl>
  </div>
  <div class="actions">
    <a class="btn primary" href="?reissue=1">QR 재발급</a>
    <a class="btn" href="?format=json">JSON 보기</a>
  </div>
  <div class="warn">재발급 시 이전 토큰은 즉시 비활성화됩니다(사이트당 활성 QR 1개 규칙). 이 화면은 로컬 개발 환경에서만 열립니다.</div>
</div></body></html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("[dev/attendance/temp-qr] failed:", error);
    return NextResponse.json({ error: "temp_qr_failed" }, { status: 500 });
  }
}
