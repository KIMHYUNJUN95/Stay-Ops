import "server-only";

import { after } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * 판매 캘린더 「30일 · 월간」 보기 기억 — **사용자마다**, 대시보드 · 모바일 공용(2026-10-05 사용자 요청).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「30일 · 월간 보기 기억」
 *
 * - 주소에 `mode` 가 있으면 그 보기로 열고, 그게 마지막 보기가 된다(응답을 보낸 뒤 `after()` 로 저장 — 화면이
 *   느려지지 않는다). 토글 · 앞뒤 이동 · 달 고르기 링크가 전부 `mode` 를 달고 다니므로 따로 저장 버튼이 없다.
 * - 주소에 `mode` 가 없으면(사이드 메뉴 · 하단 탭 · 새로 켬) 저장된 보기로 연다. 없으면 30일.
 * - 저장은 `profiles.ops_calendar_mode`(본인 행만, service-role). 읽기 · 쓰기가 실패해도 화면은 30일로 그냥 열린다.
 */
export type OpsCalendarModeValue = "rolling" | "monthly";

function parseMode(value: unknown): OpsCalendarModeValue | null {
  return value === "rolling" || value === "monthly" ? value : null;
}

export async function resolveOpsCalendarMode(userId: string, requested: string | undefined): Promise<OpsCalendarModeValue> {
  const explicit = parseMode(requested);
  if (explicit) {
    after(async () => {
      try {
        await getSupabaseServiceClient()
          .from("profiles")
          .update({ ops_calendar_mode: explicit })
          .eq("id", userId)
          .or(`ops_calendar_mode.is.null,ops_calendar_mode.neq.${explicit}`);
      } catch {
        // 기억 못 해도 이번 화면은 그대로다.
      }
    });
    return explicit;
  }
  try {
    const { data } = await getSupabaseServiceClient()
      .from("profiles")
      .select("ops_calendar_mode")
      .eq("id", userId)
      .maybeSingle();
    return parseMode(data?.ops_calendar_mode) ?? "rolling";
  } catch {
    return "rolling";
  }
}
