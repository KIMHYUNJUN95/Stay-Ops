import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";

/**
 * 판매 캘린더의 **객실 행 키** — `건물::표시 이름`. 격자(`ops-calendar.ts` → `mapRoomUnits`)와
 * 쓰기 액션의 서버 재계산이 같은 함수를 쓴다. 둘이 갈리면 서버가 멀쩡한 행을 거절하거나,
 * 화면이 보낸 행 키를 그대로 믿게 된다.
 */
export const ROOM_AXIS_SEPARATOR = "::";

export function toRoomAxisKey(propertyName: string, displayRoomLabel: string) {
  return `${propertyName}${ROOM_AXIS_SEPARATOR}${displayRoomLabel}`;
}

/** 우리 `rooms` 한 행 → 캘린더 행 키. 운영 제외 객실은 `null`(격자에 행이 없다). */
export function opsUnitRoomKey(unit: { propertyName: string | null | undefined; roomLabel: string }): string | null {
  const propertyName = getCanonicalPropertyName(unit.propertyName?.trim() || "Unknown");
  if (isExcludedOperationalRoom(propertyName, unit.roomLabel)) return null;
  const canonical = getCanonicalRoomLabel(propertyName, unit.roomLabel) || unit.roomLabel.trim();
  const displayRoomLabel = getDisplayRoomLabel(propertyName, canonical) || canonical;
  return toRoomAxisKey(propertyName, displayRoomLabel);
}

export type OpsOwnedUnit = { id: string; propertyName: string | null | undefined; roomLabel: string };

/**
 * 화면이 보낸 「행 키 + 유닛 id」를 **서버가 다시 계산해** 확인한다.
 *
 * `ownedUnits` 는 호출부가 **세션 조직으로 거른** `rooms` 행이다. 요청한 id 가 하나라도 거기
 * 없으면(다른 조직·없는 유닛) 거절하고, 유닛들이 한 행으로 모이지 않거나 화면의 키와 다르면
 * 거절한다. 통과하면 서버가 계산한 키를 돌려준다 — 겹침 검사는 그 값만 쓴다.
 */
export function resolveOpsRowRoomKey(args: {
  requestedRoomIds: readonly string[];
  ownedUnits: readonly OpsOwnedUnit[];
  clientRoomKey: string;
}): { ok: true; roomKey: string; roomIds: string[] } | { ok: false } {
  const requested = [...new Set(args.requestedRoomIds)];
  if (requested.length === 0) return { ok: false };
  const ownedById = new Map(args.ownedUnits.map((unit) => [unit.id, unit]));

  let roomKey: string | null = null;
  for (const id of requested) {
    const unit = ownedById.get(id);
    if (!unit) return { ok: false };
    const key = opsUnitRoomKey(unit);
    if (!key) return { ok: false };
    if (roomKey !== null && key !== roomKey) return { ok: false };
    roomKey = key;
  }
  if (roomKey === null || roomKey !== args.clientRoomKey.trim()) return { ok: false };
  return { ok: true, roomIds: requested, roomKey };
}
