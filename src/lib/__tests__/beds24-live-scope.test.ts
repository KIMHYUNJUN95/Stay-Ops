import { describe, expect, it } from "vitest";
import { beds24LiveScopesOverlap } from "@/lib/beds24-live";

describe("beds24LiveScopesOverlap", () => {
  const view = { from: "2026-09-28", propertyNames: ["가부키초"], to: "2026-10-29" };

  it("범위가 없는 쪽은 전부로 본다", () => {
    expect(beds24LiveScopesOverlap(undefined, view)).toBe(true);
    expect(beds24LiveScopesOverlap({ propertyNames: ["오쿠보A"] }, undefined)).toBe(true);
    expect(beds24LiveScopesOverlap({}, view)).toBe(true);
    expect(beds24LiveScopesOverlap({ propertyNames: [] }, view)).toBe(true);
  });

  it("다른 건물의 신호는 거른다", () => {
    expect(beds24LiveScopesOverlap({ propertyNames: ["오쿠보A", "사노"] }, view)).toBe(false);
  });

  it("건물 이름은 정규화해서 비교한다", () => {
    expect(beds24LiveScopesOverlap({ propertyNames: ["Kabukicho"] }, view)).toBe(true);
  });

  it("전체 건물을 보는 화면은 어느 건물 신호든 받는다", () => {
    expect(beds24LiveScopesOverlap({ propertyNames: ["오쿠보A"] }, { ...view, propertyNames: null })).toBe(true);
  });

  it("날짜가 창 밖이면 거르고, 양끝은 포함한다", () => {
    expect(beds24LiveScopesOverlap({ from: "2026-10-30", to: "2026-11-30" }, view)).toBe(false);
    expect(beds24LiveScopesOverlap({ from: "2026-09-01", to: "2026-09-27" }, view)).toBe(false);
    expect(beds24LiveScopesOverlap({ from: "2026-10-29", to: "2026-11-30" }, view)).toBe(true);
    expect(beds24LiveScopesOverlap({ from: "2026-09-01", to: "2026-09-28" }, view)).toBe(true);
    expect(beds24LiveScopesOverlap({ from: "2026-10-01" }, view)).toBe(true);
    expect(beds24LiveScopesOverlap({ to: "2026-09-27" }, view)).toBe(false);
  });

  it("건물은 맞아도 날짜가 안 겹치면 거른다", () => {
    expect(
      beds24LiveScopesOverlap({ from: "2027-01-01", propertyNames: ["가부키초"], to: "2027-01-31" }, view),
    ).toBe(false);
  });
});
