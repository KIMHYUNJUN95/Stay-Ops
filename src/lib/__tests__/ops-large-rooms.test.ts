import { describe, expect, it } from "vitest";
import { hasOpsLargeRooms, isOpsLargeRoom, orderOpsLargeRoomsFirst } from "@/lib/ops-large-rooms";

/**
 * 큰방 위쪽 정렬.
 *
 * 계약: `src/lib/ops-large-rooms.ts` — STAY ARI Apartment Hotel 만, 그 건물 안에서만.
 */
const SA = "STAY ARI Apartment Hotel";
const room = (propertyName: string, displayRoomLabel: string) => ({ displayRoomLabel, propertyName });
const labels = (rooms: ReadonlyArray<{ propertyName: string; displayRoomLabel: string }>) =>
  rooms.map((r) => `${r.propertyName === SA ? "SA" : r.propertyName}:${r.displayRoomLabel}`);

describe("ops large rooms", () => {
  it("STAY ARI 의 101·102·201·202·302 가 큰방이다 — 앞의 O 는 떼고 본다", () => {
    for (const label of ["O101", "O102", "O201", "O202", "O302", "101"]) expect(isOpsLargeRoom(SA, label)).toBe(true);
    for (const label of ["O103", "O301", "O303", "O1010"]) expect(isOpsLargeRoom(SA, label)).toBe(false);
  });

  it("다른 건물은 같은 번호라도 큰방이 아니다", () => {
    expect(isOpsLargeRoom("아라키초A", "201")).toBe(false);
    expect(hasOpsLargeRooms([room("아라키초A", "201"), room("가부키초", "K202")])).toBe(false);
  });

  it("그 건물 안에서만 큰방을 앞으로 — 건물 순서와 나머지 순서는 그대로", () => {
    const rooms = [
      room("가부키초", "K202"),
      room(SA, "O101"),
      room(SA, "O103"),
      room(SA, "O201"),
      room(SA, "O203"),
      room(SA, "O302"),
      room(SA, "O303"),
      room("다카다노바바", "2"),
    ];
    expect(labels(orderOpsLargeRoomsFirst(rooms))).toEqual([
      "가부키초:K202",
      "SA:O101",
      "SA:O201",
      "SA:O302",
      "SA:O103",
      "SA:O203",
      "SA:O303",
      "다카다노바바:2",
    ]);
  });

  it("큰방이 없으면 받은 배열을 그대로 돌려준다", () => {
    const rooms = [room("아라키초A", "201"), room("아라키초A", "202")];
    expect(orderOpsLargeRoomsFirst(rooms)).toBe(rooms);
  });
});
