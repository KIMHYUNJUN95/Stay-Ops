import type { OpsSelectionCell } from "@/lib/ops-calendar-selection";
import { getCanonicalPropertyName } from "@/lib/room-label-normalization";

/**
 * 임박 빈방 — **오늘부터 N일**(오늘 포함) 안의 안 팔린 · 안 막힌 · 요금 칸이 있는 밤. **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「임박 빈방」
 *
 * 데스크톱 격자와 모바일 판매 캘린더가 같은 규칙을 쓴다(2026-10-01). 사노는 기본 선택에서 뺀다(사용자 요청 —
 * 필요하면 격자에서 직접 고른다). 보는 기간에 오늘이 없으면 빈 목록이다(셀 수 없다).
 */
export const URGENT_VACANT_DAYS = 3;

export const URGENT_VACANT_EXCLUDED_PROPERTIES: ReadonlySet<string> = new Set(
  ["Sano"].map((name) => getCanonicalPropertyName(name)),
);

export function opsUrgentVacantCells(args: {
  roomKeys: readonly string[];
  dates: readonly string[];
  today: string;
  isSold: (roomKey: string, date: string) => boolean;
  isBlocked: (roomKey: string, date: string) => boolean;
  hasPrice: (roomKey: string, date: string) => boolean;
  days?: number;
}): OpsSelectionCell[] {
  if (!args.dates.includes(args.today)) return [];
  const urgentDates = args.dates.filter((date) => date >= args.today).slice(0, args.days ?? URGENT_VACANT_DAYS);
  const cells: OpsSelectionCell[] = [];
  for (const roomKey of args.roomKeys) {
    const separator = roomKey.indexOf("::");
    if (URGENT_VACANT_EXCLUDED_PROPERTIES.has(separator >= 0 ? roomKey.slice(0, separator) : roomKey)) continue;
    for (const date of urgentDates) {
      if (args.isSold(roomKey, date) || args.isBlocked(roomKey, date)) continue;
      if (!args.hasPrice(roomKey, date)) continue;
      cells.push({ date, roomKey });
    }
  }
  return cells;
}
