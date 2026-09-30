import { describe, expect, it } from "vitest";
import { diffBlockSets, resolveBlockDeleteScope, type BlockIdentity } from "@/lib/beds24/room-blocks-sync";

/**
 * 블락 동기화가 **끝까지 읽은 건물만** 지우고 다시 넣는가 (2026-09-30).
 *
 * 한 건물을 못 읽었는데 창 전체를 지우면 그 건물의 차단 표시가 다시 들어오지 않고 사라졌다.
 */
describe("resolveBlockDeleteScope", () => {
  const names = new Map([
    ["100", "아라키초A"],
    ["200", "가부키초"],
    ["300", "오쿠보C"],
  ]);

  it("읽은 건물 이름만 지운다 — 못 읽은 건물은 그대로 둔다", () => {
    expect(
      resolveBlockDeleteScope({ fetchedPropertyIds: ["100", "300"], propertyNameByExternalId: names }).sort(),
    ).toEqual(["아라키초A", "오쿠보C"].sort());
  });

  it("하나도 못 읽었으면 아무것도 지우지 않는다", () => {
    expect(resolveBlockDeleteScope({ fetchedPropertyIds: [], propertyNameByExternalId: names })).toEqual([]);
  });

  it("좁힌 건물 밖은 지우지 않는다", () => {
    expect(
      resolveBlockDeleteScope({
        fetchedPropertyIds: ["100", "200"],
        only: new Set(["200"]),
        propertyNameByExternalId: names,
      }),
    ).toEqual(["가부키초"]);
  });

  it("방 마스터에 이름이 없는 건물은 지우지 않는다", () => {
    expect(resolveBlockDeleteScope({ fetchedPropertyIds: ["999"], propertyNameByExternalId: names })).toEqual([]);
  });
});

describe("diffBlockSets", () => {
  const block = (start: string, end: string): BlockIdentity => ({
    end_date: end,
    external_room_id: "440617",
    organization_id: "org",
    property_name: "아라키초A",
    start_date: start,
  });

  it("지우고 같은 것을 다시 넣었으면 바뀐 게 없다", () => {
    expect(diffBlockSets([block("2026-10-01", "2026-10-03")], [block("2026-10-01", "2026-10-03")])).toEqual([]);
  });

  it("풀린 블락 · 새 블락 · 구간이 바뀐 블락은 바뀐 것이다", () => {
    const changed = diffBlockSets(
      [block("2026-10-01", "2026-10-03"), block("2026-10-10", "2026-10-11")],
      [block("2026-10-01", "2026-10-04"), block("2026-10-10", "2026-10-11")],
    );
    expect(changed).toEqual([block("2026-10-01", "2026-10-03"), block("2026-10-01", "2026-10-04")]);
  });
});
