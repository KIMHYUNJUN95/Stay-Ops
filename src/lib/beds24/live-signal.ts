import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  BEDS24_LIVE_CHANNEL_OPTIONS,
  BEDS24_LIVE_EVENT,
  beds24LiveTopic,
  type Beds24LiveKind,
  type Beds24LivePayload,
  type Beds24LiveScope,
} from "@/lib/beds24-live";

/**
 * 「Beds24 데이터가 바뀌었다」 신호 — 열려 있는 화면이 새로고침 없이 다시 읽게 한다.
 *
 * 계약: `src/lib/beds24-live.ts`
 *
 * 서비스 클라이언트는 **호출할 때** 불러온다 — 이 파일은 동기화 모듈(테스트가 직접 import 하는)이
 * 부르므로 맨 위에서 `server-only` 모듈을 끌어오면 테스트가 통째로 못 뜬다. 서비스 키는 여전히
 * `@/lib/supabase/service`(server-only) 안에만 있다.
 *
 * `scope` 를 주면 그 건물·날짜를 보는 화면만 다시 읽는다(`beds24LiveScopesOverlap`). 없으면 전부.
 *
 * **private 채널**(2026-09-30): 받는 쪽은 `realtime.messages` RLS 로 그 조직 멤버만 구독한다. 보내는 쪽은
 * service role JWT 를 `Authorization` 에 실어야 RLS 를 건너뛴다 — `httpSend` 는 `accessTokenValue` 가 있을
 * 때만 그 헤더를 붙이므로 먼저 `realtime.setAuth()` 로 채운다(세션이 없으니 콜백이 service key 를 준다).
 *
 * **절대 던지지 않는다.** 신호가 실패해도 데이터는 이미 들어갔고, 화면은 다음 이동·새로고침 때
 * 맞는 값을 본다. 웹훅 응답이나 동기화 결과를 신호 때문에 실패로 만들지 않는다.
 */
export async function signalBeds24Change(
  organizationIds: string | Iterable<string | null | undefined>,
  kind: Beds24LiveKind,
  scope?: Beds24LiveScope,
): Promise<void> {
  const ids = new Set(
    [...(typeof organizationIds === "string" ? [organizationIds] : organizationIds)].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );
  if (ids.size === 0) return;

  let supabase: SupabaseClient<Database>;
  try {
    supabase = (await import("@/lib/supabase/service")).getSupabaseServiceClient();
  } catch (error) {
    console.warn("[beds24/live] no service client", error);
    return;
  }

  try {
    await supabase.realtime.setAuth();
  } catch (error) {
    console.warn("[beds24/live] realtime auth failed", error);
    return;
  }

  await Promise.all(
    [...ids].map(async (organizationId) => {
      const channel = supabase.channel(beds24LiveTopic(organizationId), BEDS24_LIVE_CHANNEL_OPTIONS);
      try {
        const payload: Beds24LivePayload = scope ? { at: Date.now(), kind, scope } : { at: Date.now(), kind };
        const sent = await channel.httpSend(BEDS24_LIVE_EVENT, payload, { timeout: 3_000 });
        if (!sent.success) console.warn("[beds24/live] broadcast failed", { kind, status: sent.status, error: sent.error });
      } catch (error) {
        console.warn("[beds24/live] broadcast error", { kind, error });
      } finally {
        await supabase.removeChannel(channel).catch(() => undefined);
      }
    }),
  );
}
