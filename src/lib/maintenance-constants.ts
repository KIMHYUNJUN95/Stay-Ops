// 수리·점검 도메인 상수 — 클라이언트에서도 import 가능해야 한다(모바일 신청 폼의 카테고리/우선순위
// 선택지, 어드민 콘솔의 필터 등). `maintenance-reports.ts`는 서버 전용 Supabase 클라이언트를 끌어오므로
// 상수만 여기로 분리하고 거기서 re-export한다.
import type { Database } from "@/types/database";

export type MaintenanceStatus = Database["public"]["Enums"]["maintenance_status"];
export type MaintenancePriority = Database["public"]["Enums"]["maintenance_priority"];
export type MaintenanceCategory = Database["public"]["Enums"]["maintenance_category"];

// 4-state model (2026-07-14). `resolved`는 `closed`로 병합됐다 — 현장이 "해결"과 "완료"를 구분할 수
// 없었다. See supabase/migrations/202607160001_maintenance_backend.sql.
export const maintenanceStatuses: readonly MaintenanceStatus[] = [
  "open",
  "in_progress",
  "closed",
  "cancelled",
];

export const maintenancePriorities: readonly MaintenancePriority[] = [
  "urgent",
  "high",
  "normal",
  "low",
];

export const maintenanceCategories: readonly MaintenanceCategory[] = [
  "electric",
  "water",
  "air_conditioning_heating",
  "wifi",
  "furniture",
  "appliance",
  "cleaning_condition",
  "supplies",
  "damage",
  "other",
];

export function isMaintenanceStatus(value: string): value is MaintenanceStatus {
  return (maintenanceStatuses as readonly string[]).includes(value);
}
export function isMaintenancePriority(value: string): value is MaintenancePriority {
  return (maintenancePriorities as readonly string[]).includes(value);
}
export function isMaintenanceCategory(value: string): value is MaintenanceCategory {
  return (maintenanceCategories as readonly string[]).includes(value);
}

/** 완료/무효 = 종료 상태. 경과시간을 더 세지 않고 완료 뷰로 넘어간다. */
export function isMaintenanceTerminal(status: MaintenanceStatus): boolean {
  return status === "closed" || status === "cancelled";
}

/** 완료 사진 최대 장수 — 신고 사진(image_urls)과 같은 5장 정책. */
export const MAINTENANCE_RESOLUTION_IMAGE_LIMIT = 5;

/** `open` 접수 후 이 시간을 넘긴 미해결 건 = "오래된 미해결"(어드민 콘솔 KPI + 카드 강조). */
export const MAINTENANCE_AGING_HOURS = 72;
