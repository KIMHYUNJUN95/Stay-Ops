// 분실물 상태·상수 — 클라이언트 안전(client-safe). `lost-found.ts`는 `@/lib/supabase/server`
// (→ next/headers)를 import 하므로 "use client" 컴포넌트에서 직접 import 하면 빌드가 깨진다.
// 상태 배열·가드·상한 같은 순수 상수는 여기 두고, 서버 lib은 이 파일을 재수출한다.
// (수리·점검의 maintenance-constants.ts와 동일한 분리 패턴.)
import type { Database } from "@/types/database";

export type LostItemStatus = Database["public"]["Enums"]["lost_item_status"];

// 표시 순서 = 접수 → 보관 → 폐기예정 → 폐기완료 → 반환완료(신규).
// 읽기 전용 진행바(폐기 경로)는 'returned'를 제외한 4개만 쓴다 — 상세 페이지에서 필터링한다.
export const lostItemStatuses: readonly LostItemStatus[] = [
  "registered",
  "stored",
  "disposal_scheduled",
  "disposed",
  "returned",
];

// 폐기 경로 진행바용(반환완료 제외). 손님 반환은 이 선형 흐름 밖의 종결이다.
export const lostItemLinearStatuses: readonly LostItemStatus[] = [
  "registered",
  "stored",
  "disposal_scheduled",
  "disposed",
];

export function isLostItemStatus(value: string): value is LostItemStatus {
  return (lostItemStatuses as readonly string[]).includes(value);
}

// 종결 상태 = 반환완료 또는 폐기완료. 이 상태에서는 처리 블록 대신 처리 이력을 보여준다.
export function isLostItemTerminal(status: LostItemStatus): boolean {
  return status === "returned" || status === "disposed";
}

export const LOST_FOUND_HANDLING_IMAGE_LIMIT = 5;
