import { NextResponse } from "next/server";

/**
 * 화면(브라우저 · 앱 WebView)에서 난 오류를 서버 로그로 받는다 (2026-10-09, 앱 출시 준비 — 오류 수집).
 *
 * 앱 안 화면 오류는 우리가 볼 길이 없었다(Vercel 로그는 서버 쪽만). 외부 서비스 없이 **Vercel 런타임 로그**에
 * `[client-error]` 한 줄(JSON)로 남긴다 — Vercel 대시보드 Logs 에서 `client-error` 로 검색. DB 에는 저장하지 않는다.
 *
 * - 로그인 없이도 받는다(로그인 전 화면에서도 오류가 난다). 사용자 · 조직 ID 는 받지 않는다(개인과 연결하지 않음 —
 *   App Store 개인정보 라벨 「진단 › 충돌 · 기타 진단 데이터, 신원과 연결 안 됨」, `18-store-review-kit.md`).
 * - 주소는 경로만 받는다(쿼리에 로그인 코드 · 토큰이 있을 수 있다). 클라이언트: `src/lib/client-error-report.ts`.
 */

const MAX_BODY_BYTES = 16 * 1024;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function pathOnly(value: unknown): string | null {
  const raw = text(value, 300);
  if (!raw) return null;
  return raw.split(/[?#]/)[0] ?? null;
}

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new NextResponse(null, { status: 204 });
    body = parsed as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const entry = {
    source: text(body.source, 40),
    message: text(body.message, 1000),
    stack: text(body.stack, 4000),
    digest: text(body.digest, 100),
    path: pathOnly(body.path),
    platform: text(body.platform, 20),
    appVersion: text(body.appVersion, 40),
    appBuild: typeof body.appBuild === "number" && Number.isFinite(body.appBuild) ? body.appBuild : null,
    online: typeof body.online === "boolean" ? body.online : null,
    userAgent: text(request.headers.get("user-agent"), 400),
  };
  if (!entry.message) return new NextResponse(null, { status: 204 });

  console.error(`[client-error] ${JSON.stringify(entry)}`);
  return new NextResponse(null, { status: 204 });
}
