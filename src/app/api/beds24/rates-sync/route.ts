import { NextResponse, type NextRequest } from "next/server";
import { hasPendingPriceJobs } from "@/lib/beds24/price-job-queue";
import { buildRoomRatesWindow, syncBeds24RoomRates } from "@/lib/beds24/room-rates-sync";
import { isBeds24SyncPaused } from "@/lib/beds24/sync-control";
import {
  acquireBeds24Lock,
  getBeds24Cooldown,
  RATES_SYNC_LOCK,
  RATES_SYNC_LOCK_TTL_MS,
  releaseBeds24Lock,
} from "@/lib/beds24/sync-locks";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * 요금·재고 주기 동기화 — **프로덕션 안전망**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「요금이 우리 표로 들어오는 두 경로」
 *
 * ## 웹훅이 있는데 왜 또 도는가
 *
 * 저쪽도 둘 다 돌린다 — `priceWebhook`(즉시) + **`scheduledBeds24PriceSync`(15분마다 전체)**.
 * 웹훅은 빠르지만 놓칠 수 있다: 배달 실패, 우리 서버가 잠깐 죽음, Beds24 설정에서 그 트리거가
 * 꺼져 있음. 그 어느 경우든 **판매 캘린더가 없는 가격을 보여주는 화면**이 된다.
 *
 * 2026-09-17 실측: 우리 엔드포인트로 두 달간 웹훅 20,157건이 왔는데 **전부 예약**이고 가격은
 * 0건이었다. Beds24 의 「予約Webhook」 칸에만 등록돼 있기 때문이다. 이 주기 동기화가 그 사이를
 * 메운다 — 웹훅 설정이 어떻든 요금은 맞는다.
 *
 * ## 멱등하다
 *
 * `(room_id, stay_date)` upsert 라 몇 번을 돌려도 행이 늘지 않는다. 지우지 않으므로
 * **과거 요금은 그대로 남아 이력이 된다**(Beds24 는 오늘 이후만 준다).
 */

export const dynamic = "force-dynamic";
// 9건물 × 12개월을 한 번에 훑는다. 실측 30초 — Hobby 상한(60초) 안이지만 여유가 크지 않다.
export const maxDuration = 60;

function resolveProvidedSecret(request: NextRequest) {
  const fromBearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromHeader = request.headers.get("x-beds24-webhook-secret");
  const fromQuery = request.nextUrl.searchParams.get("secret");
  return fromBearer ?? fromHeader ?? fromQuery ?? null;
}

/** `reconcile` 과 같은 규칙 — 크론 시크릿 또는 Beds24 웹훅 시크릿. 둘 다 없으면 닫아 둔다. */
function authorize(request: NextRequest): { ok: true } | { ok: false; status: number } {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const webhookSecret = process.env.BEDS24_WEBHOOK_SECRET?.trim();
  if (!cronSecret && !webhookSecret) return { ok: false, status: 404 };

  const provided = resolveProvidedSecret(request);
  if (!provided) return { ok: false, status: 403 };
  if (cronSecret && provided === cronSecret) return { ok: true };
  if (webhookSecret && provided === webhookSecret) return { ok: true };
  return { ok: false, status: 403 };
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

  const window = buildRoomRatesWindow();
  let lockId: string | null = null;

  try {
    const supabase = getSupabaseServiceClient();

    // 크레딧은 계정 단위다 — 쓰기가 429 를 맞았으면 읽기도 쉬어야 한도가 풀린다.
    const cooldown = await getBeds24Cooldown(supabase);
    if (cooldown.active) {
      return NextResponse.json(
        { cooldownRemainingSec: cooldown.remainingSec, ok: true, skipped: "cooldown" },
        { status: 202 },
      );
    }

    // **쓰기 작업에 양보한다.** 저쪽이 실제로 겪은 사고다 — 작업이 POST 후 검증 재시도를
    // 도는 사이 주기 동기화가 Beds24 에서 옛 가격을 읽어 캐시를 덮었고, 「Beds24 가
    // 되돌렸다」는 허위 이력까지 남겼다. 우리 표가 되돌아가면 사람은 반영이 안 된 줄 알고
    // 한 번 더 바꾼다.
    if (await hasPendingPriceJobs(supabase)) {
      return NextResponse.json(
        { ok: true, skipped: "yielded_to_price_job" },
        { status: 202 },
      );
    }

    const lock = await acquireBeds24Lock(
      supabase,
      RATES_SYNC_LOCK,
      "rates-sync",
      RATES_SYNC_LOCK_TTL_MS,
    );
    if (!lock.acquired) {
      return NextResponse.json({ ok: true, skipped: "lock_busy" }, { status: 202 });
    }
    lockId = lock.lockId;

    const organizationsResult = await supabase.from("organizations").select("id");
    if (organizationsResult.error) throw new Error(organizationsResult.error.message);

    const organizations = [];
    for (const row of organizationsResult.data ?? []) {
      const organizationId = (row as { id: string }).id;
      const result = await syncBeds24RoomRates(organizationId, supabase, window);
      organizations.push({ organizationId, ...result });
      // 방 마스터가 뒤처졌다는 신호다 — 조용히 넘기지 않는다.
      if (result.unmatchedRoomIds.length > 0) {
        console.warn("[beds24/rates-sync] rooms missing from master", {
          organizationId,
          unmatchedRoomIds: result.unmatchedRoomIds,
        });
      }
    }

    return NextResponse.json({ ok: true, window, organizations });
  } catch (error) {
    console.error("[beds24/rates-sync] failed", error);
    return NextResponse.json({ ok: false, error: "rates_sync_failed" }, { status: 500 });
  } finally {
    if (lockId) {
      await releaseBeds24Lock(getSupabaseServiceClient(), RATES_SYNC_LOCK, lockId);
    }
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
