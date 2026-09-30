import { describe, expect, it } from "vitest";
import {
  buildOpsCalendarHref,
  parsePropertyParam,
  resolveSelectedProperties,
  togglePropertySelection,
} from "@/lib/ops-calendar-properties";

const OPTIONS = ["오쿠보A", "오쿠보B", "STAY ARI Apartment Hotel", "아라키초A (별관)", "新宿ハウス"];

describe("parsePropertyParam", () => {
  it("returns [] for missing / empty values", () => {
    expect(parsePropertyParam(undefined)).toEqual([]);
    expect(parsePropertyParam("")).toEqual([]);
    expect(parsePropertyParam("   ")).toEqual([]);
    expect(parsePropertyParam([])).toEqual([]);
  });

  it("wraps a single value (backward compatible ?property=A)", () => {
    expect(parsePropertyParam("오쿠보A")).toEqual(["오쿠보A"]);
  });

  it("trims, drops empties and dedupes repeated values in arrival order", () => {
    expect(parsePropertyParam([" 오쿠보B", "오쿠보A", "", "오쿠보B ", "오쿠보A"])).toEqual(["오쿠보B", "오쿠보A"]);
  });
});

describe("resolveSelectedProperties", () => {
  it("keeps only known properties, in tab order (not click order)", () => {
    expect(resolveSelectedProperties(["新宿ハウス", "없는 건물", "오쿠보A"], OPTIONS)).toEqual(["오쿠보A", "新宿ハウス"]);
  });

  it("falls back to [] (= all) when nothing matches", () => {
    expect(resolveSelectedProperties(["없는 건물"], OPTIONS)).toEqual([]);
  });
});

describe("togglePropertySelection", () => {
  it("adds to the empty (all) selection → single", () => {
    expect(togglePropertySelection([], "오쿠보B", OPTIONS)).toEqual(["오쿠보B"]);
  });

  it("adds a second property, ordered by tabs", () => {
    expect(togglePropertySelection(["新宿ハウス"], "오쿠보A", OPTIONS)).toEqual(["오쿠보A", "新宿ハウス"]);
  });

  it("removes down to one (single mode) and then to none (all)", () => {
    const two = ["오쿠보A", "오쿠보B"];
    const one = togglePropertySelection(two, "오쿠보A", OPTIONS);
    expect(one).toEqual(["오쿠보B"]);
    expect(togglePropertySelection(one, "오쿠보B", OPTIONS)).toEqual([]);
  });

  it("ignores unknown names", () => {
    expect(togglePropertySelection(["오쿠보A"], "없는 건물", OPTIONS)).toEqual(["오쿠보A"]);
  });
});

describe("buildOpsCalendarHref", () => {
  it("emits a bare path when there is no query", () => {
    expect(buildOpsCalendarHref({ property: [], mode: undefined, start: "" })).toBe("/admin/ops/calendar");
  });

  it("keeps a single property as ?property=A", () => {
    const href = buildOpsCalendarHref({ mode: "rolling", property: ["오쿠보A"] });
    expect(new URLSearchParams(href.split("?")[1]).getAll("property")).toEqual(["오쿠보A"]);
    expect(href.match(/property=/g)).toHaveLength(1);
  });

  it("repeats the property key and round-trips spaces, parentheses and CJK", () => {
    const names = ["STAY ARI Apartment Hotel", "아라키초A (별관)", "新宿ハウス"];
    const href = buildOpsCalendarHref({ cancelled: "1", mode: "monthly", property: names, ym: "2026-10" });
    const query = new URLSearchParams(href.split("?")[1]);
    expect(query.getAll("property")).toEqual(names);
    expect(query.get("mode")).toBe("monthly");
    expect(query.get("ym")).toBe("2026-10");
    expect(query.get("cancelled")).toBe("1");
    // 파싱 → 검증을 다시 거쳐도 같은 선택이다.
    expect(resolveSelectedProperties(parsePropertyParam(query.getAll("property")), OPTIONS)).toEqual([
      "STAY ARI Apartment Hotel",
      "아라키초A (별관)",
      "新宿ハウス",
    ]);
  });

  it("accepts a plain string property too", () => {
    expect(buildOpsCalendarHref({ property: "오쿠보A" })).toBe(
      `/admin/ops/calendar?property=${encodeURIComponent("오쿠보A")}`,
    );
  });
});
