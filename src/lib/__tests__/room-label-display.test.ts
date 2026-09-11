import { describe, expect, it } from "vitest";
import {
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  getDisplaySessionRoomLabel,
} from "@/lib/room-label-normalization";

/**
 * 방 이름은 **저장값과 표시값이 다르다** (2026-09-11).
 *
 * `rooms` 의 `UNIQUE (organization_id, room_label)` 때문에 방 이름이 조직 전체에서 유일해야 하고,
 * 아라키초A 가 맨 번호를 선점한 탓에 나중에 붙은 건물은 접두어로 피해 왔다(`AB101`, `K202`, `O102`).
 * 현장에서는 그냥 「101호」다. 그래서 표시 계층에서만 뗀다.
 *
 * 이 테스트가 지키는 것은 두 가지다 — 떼야 할 것을 떼는가, **떼면 안 되는 것을 남기는가.**
 */
describe("getDisplayRoomLabel — 건물 접두어는 표시에서만 뗀다", () => {
  it("스테이아리 O 를 뗀다", () => {
    expect(getDisplayRoomLabel("STAY ARI Apartment Hotel", "O102")).toBe("102");
    expect(getDisplayRoomLabel("STAY ARI Apartment Hotel", "O310")).toBe("310");
  });

  it("아라키초B AB 를 뗀다", () => {
    expect(getDisplayRoomLabel("아라키초B", "AB101")).toBe("101");
    expect(getDisplayRoomLabel("Arakicho B", "AB402")).toBe("402");
  });

  it("아라키초 _N 접미사를 먼저 떼고 접두어를 뗀다", () => {
    // 순서가 뒤집히면 "AB101_2" 가 접두어 규칙(뒤가 전부 숫자)에 안 걸려 그대로 남는다.
    expect(getDisplayRoomLabel("아라키초B", "AB101_2")).toBe("101");
    expect(getDisplayRoomLabel("아라키초A", "402_2")).toBe("402");
  });

  it("접두어가 없던 건물은 그대로다", () => {
    expect(getDisplayRoomLabel("아라키초A", "201")).toBe("201");
    expect(getDisplayRoomLabel("다카다노바바", "9")).toBe("9");
  });

  it("가부키초는 이미 정규화 단계에서 숫자만 남는다", () => {
    expect(getCanonicalRoomLabel("Kabukicho", "K202")).toBe("202");
    expect(getCanonicalRoomLabel("Kabukicho", "203#")).toBe("203");
  });

  it("뒤가 숫자가 아니면 접두어가 아니라 이름이므로 건드리지 않는다", () => {
    // Okubo_C 의 실제 방 이름. 여기서 "CC" 를 떼면 방을 못 찾는다.
    expect(getDisplayRoomLabel("Okubo_C (kr)", "OkuboCC")).toBe("OkuboCC");
    expect(getDisplayRoomLabel("오쿠보A", "오쿠보A")).toBe("오쿠보A");
    expect(getDisplayRoomLabel("Sano", "別荘")).toBe("別荘");
  });

  it("접두어를 떼도 한 건물 안에서 방이 겹치지 않는다", () => {
    // 겹치면 두 방이 한 줄로 합쳐져 청소·예약이 섞인다.
    const stayAri = [
      "O101", "O102", "O103", "O105", "O106", "O107", "O108", "O109", "O110",
      "O201", "O202", "O203", "O205", "O206", "O207", "O208", "O209", "O210",
      "O302", "O303", "O305", "O306", "O307", "O308", "O309", "O310",
    ];
    const displayed = stayAri.map((label) => getDisplayRoomLabel("STAY ARI Apartment Hotel", label));
    expect(new Set(displayed).size).toBe(stayAri.length);

    const arakichoB = ["AB101", "AB102", "AB201", "AB202", "AB301", "AB302", "AB401", "AB402"];
    const displayedB = arakichoB.map((label) => getDisplayRoomLabel("아라키초B", label));
    expect(new Set(displayedB).size).toBe(arakichoB.length);
  });

  it("건물이 다르면 같은 번호로 보여도 저장값은 그대로 구분된다", () => {
    // 이 프로젝트가 접두어를 붙였던 이유 그 자체. 화면에는 둘 다 "201" 이지만
    // 묶음 키는 「건물+방」 쌍이라 합쳐지지 않는다.
    expect(getDisplayRoomLabel("STAY ARI Apartment Hotel", "O201")).toBe("201");
    expect(getDisplayRoomLabel("아라키초A", "201")).toBe("201");
  });
});

describe("getDisplaySessionRoomLabel — 건물명은 남기고 방 번호만 다듬는다", () => {
  it("청소 세션 라벨에도 같은 규칙이 적용된다", () => {
    expect(getDisplaySessionRoomLabel("아라키초B AB101")).toBe("아라키초B 101");
    expect(getDisplaySessionRoomLabel("아라키초A 201_2")).toBe("아라키초A 201");
  });

  it("건물명만 있는 오쿠보 라벨은 그대로다", () => {
    expect(getDisplaySessionRoomLabel("오쿠보A")).toBe("오쿠보A");
  });
});
