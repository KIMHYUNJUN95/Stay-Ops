import "server-only";

import { toJstDateString } from "@/lib/admin-calendar-dashboard";
import { opsCalendarWindow, readOpsSalesInputs } from "@/lib/ops-calendar";
import { buildOpsSalesSummary, type OpsSalesSummary, type SalesRawPayload } from "@/lib/ops-sales-summary";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 판매 캘린더 「매출 요약」의 읽기 — **격자와 같은 창 · 같은 객실 축 · 같은 차단 판정**.
 *
 * 읽기는 `readOpsSalesInputs`(ops-calendar.ts — 격자의 매칭·제외 객실·차단 규칙을 그대로 쓰되 요약에 필요한
 * 열만, 조회 넷을 동시에), 계산은 순수 모듈(`ops-sales-summary.ts`). 원본 JSON 은 금액·수수료·채널·상태 키만
 * 받는다 — 결제 토큰 등은 서버 밖으로 나가지 않는다.
 */
export async function getOpsSalesSummary(
  session: AppSession,
  filters: { mode: "rolling" | "monthly"; start: string; month: string; properties: readonly string[] },
): Promise<OpsSalesSummary & { properties: string[] }> {
  const today = toJstDateString(new Date());
  const window = opsCalendarWindow(filters);
  const supabase = await getSupabaseServerClient();
  const inputs = await readOpsSalesInputs({
    organizationId: session.organization.id,
    properties: filters.properties,
    supabase,
    window,
  });
  const summary = buildOpsSalesSummary({
    blocks: inputs.blocks,
    endExclusive: window.endExclusive,
    properties: inputs.properties,
    reservations: inputs.reservations.map((reservation) => ({
      ...reservation,
      raw: reservation.raw as SalesRawPayload,
    })),
    rooms: inputs.rooms,
    start: window.start,
    today,
  });
  return { ...summary, properties: inputs.properties };
}
