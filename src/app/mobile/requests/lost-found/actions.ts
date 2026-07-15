"use server";

// 현장(모바일) 분실물 처리 — 상태 변경 + 처리 메모 + 증빙 사진.
// 2026-07-15 신설. 그 전까지 모바일 상세는 상태를 "보여주기만" 했고(읽기 전용 진행바), 상태를
// 바꿀 경로가 없었다. 수리·점검(202607160001)과 동일한 매커니즘을 분실물에 이식한다.
//
// 핵심 요구사항: "반환은 등록자와 무관하게 누구나 처리할 수 있고, 누가·언제 처리했는지 기록으로 남는다."
//   → 권한 = part_time_staff 제외 전원. 앱에서 먼저 끊고, DB의 RLS UPDATE 정책이 최종 게이트다
//     (마이그레이션 202607170001에서 staff 추가). RLS가 행을 걸러내면 Supabase는 "0행 + 에러 없음"을
//     돌려주므로, 영향 행 수를 확인하지 않으면 권한 없는 사용자에게도 "처리됨"이라고 응답하게 된다.

import { revalidatePath } from "next/cache";
import {
  isLostItemStatus,
  LOST_FOUND_HANDLING_IMAGE_LIMIT,
  type LostItemStatus,
} from "@/lib/lost-found-constants";
import { getCurrentAppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const REQUEST_IMAGE_BUCKET = "request-images";
const HANDLING_FOLDER = "lost-found-handling";

export type LostItemHandlingInput = {
  itemId: string;
  status: LostItemStatus;
  memo: string;
  handlingImageUrls: string[];
};

export type LostItemHandlingResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not_found" | "invalid" | "save_failed" };

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** 증빙 사진 URL이 반드시 {orgId}/lost-found-handling/{itemId}/{file} 아래인지 검증한다. */
function isOwnHandlingImage(url: string, organizationId: string, itemId: string): boolean {
  try {
    const parsed = new URL(url);
    const markers = [
      `/storage/v1/object/public/${REQUEST_IMAGE_BUCKET}/`,
      `/storage/v1/object/${REQUEST_IMAGE_BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx === -1) continue;
      const segments = parsed.pathname.slice(idx + marker.length).split("/");
      return (
        segments.length === 4 &&
        segments[0] === organizationId &&
        segments[1] === HANDLING_FOLDER &&
        segments[2] === itemId
      );
    }
    return false;
  } catch {
    return false;
  }
}

export async function updateLostItemHandling(
  input: LostItemHandlingInput,
): Promise<LostItemHandlingResult> {
  const session = await getCurrentAppSession();
  if (!session) return { ok: false, error: "forbidden" };
  // 파트타임은 상태를 바꿀 수 없다 (기존 규칙). RLS도 같은 결론을 내지만 여기서 먼저 끊는다.
  if (session.user.role === "part_time_staff") return { ok: false, error: "forbidden" };

  const { itemId, memo, handlingImageUrls } = input;
  if (!isValidUuid(itemId)) return { ok: false, error: "invalid" };
  if (!isLostItemStatus(input.status)) return { ok: false, error: "invalid" };
  if (handlingImageUrls.length > LOST_FOUND_HANDLING_IMAGE_LIMIT) {
    return { ok: false, error: "invalid" };
  }
  for (const url of handlingImageUrls) {
    if (!isOwnHandlingImage(url, session.organization.id, itemId)) {
      return { ok: false, error: "invalid" };
    }
  }

  const supabase = await getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("lost_items")
    .select("id")
    .eq("id", itemId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "not_found" };

  // 어떤 상태 변경이든 "누가·언제 처리했는지"를 기록으로 남긴다(요구사항). 현장 처리이므로
  // handled_by_admin = false — 관리자 예외 개입(대시보드)이 아니다.
  const update: Database["public"]["Tables"]["lost_items"]["Update"] = {
    status: input.status,
    handling_memo: memo.trim() || null,
    handling_image_urls: handlingImageUrls,
    handled_at: new Date().toISOString(),
    handled_by: session.user.id,
    handled_by_admin: false,
  };

  const { data: updated, error } = await supabase
    .from("lost_items")
    .update(update as never)
    .eq("id", itemId)
    .eq("organization_id", session.organization.id)
    .select("id");

  if (error) return { ok: false, error: "save_failed" };
  // RLS가 걸러내면 error 없이 0행이 돌아온다 → 이것을 성공으로 착각하면 안 된다.
  if (!updated || updated.length === 0) return { ok: false, error: "forbidden" };

  revalidatePath(`/mobile/requests/lost-found/${itemId}`);
  revalidatePath("/mobile/requests");
  revalidatePath("/admin/lost-found");
  return { ok: true };
}
