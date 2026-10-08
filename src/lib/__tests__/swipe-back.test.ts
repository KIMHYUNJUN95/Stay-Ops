import { describe, expect, it } from "vitest";
import {
  decideCommit,
  decideLock,
  findBackTarget,
  isSwipeBackScreen,
  settleDuration,
} from "@/lib/swipe-back/history-model";

describe("findBackTarget", () => {
  it("goes to the previous screen", () => {
    expect(findBackTarget(["/mobile/cleaning", "/mobile/cleaning/records"], 1)).toEqual({
      delta: -1,
      index: 0,
      url: "/mobile/cleaning",
    });
  });

  it("skips query-only entries of the same screen", () => {
    const urls = ["/mobile/requests", "/mobile/requests/maintenance/1", "/mobile/requests/maintenance/1?tab=log", "/mobile/requests/maintenance/1?tab=photo"];
    expect(findBackTarget(urls, 3)).toEqual({ delta: -3, index: 0, url: "/mobile/requests" });
  });

  it("returns null on the first entry", () => {
    expect(findBackTarget(["/mobile/board/3"], 0)).toBeNull();
  });

  it("stops at an unknown entry instead of guessing", () => {
    expect(findBackTarget([null, "/mobile/board/3"], 1)).toBeNull();
    expect(findBackTarget(["/mobile", null, "/mobile/board/3?x=1", "/mobile/board/3"], 3)).toBeNull();
  });

  it("returns null when the current entry is unknown", () => {
    expect(findBackTarget(["/mobile", null], 1)).toBeNull();
  });
});

describe("isSwipeBackScreen", () => {
  const roots = new Set(["/mobile", "/mobile/cleaning", "/mobile/requests"]);
  it("menu roots have no back", () => {
    expect(isSwipeBackScreen("/mobile", roots)).toBe(false);
    expect(isSwipeBackScreen("/mobile/cleaning", roots)).toBe(false);
    expect(isSwipeBackScreen("/mobile/cleaning/", roots)).toBe(false);
  });
  it("screens below a root and off-menu screens swipe back", () => {
    expect(isSwipeBackScreen("/mobile/cleaning/records", roots)).toBe(true);
    expect(isSwipeBackScreen("/mobile/notifications", roots)).toBe(true);
  });
  it("never outside /mobile", () => {
    expect(isSwipeBackScreen("/account", roots)).toBe(false);
  });
});

describe("decideLock", () => {
  it("waits for enough movement", () => {
    expect(decideLock(5, 3)).toBe("pending");
  });
  it("accepts a mostly-horizontal rightward move", () => {
    expect(decideLock(12, 4)).toBe("accept");
    expect(decideLock(20, 15)).toBe("accept");
  });
  it("rejects vertical, steep diagonal and leftward moves", () => {
    expect(decideLock(3, 14)).toBe("reject");
    expect(decideLock(12, 12)).toBe("reject");
    expect(decideLock(-14, 0)).toBe("reject");
  });
});

describe("decideCommit", () => {
  it("commits past 35% of the width", () => {
    expect(decideCommit(150, 0, 400)).toBe(true);
    expect(decideCommit(130, 0, 400)).toBe(false);
  });
  it("commits a quick flick even when short", () => {
    expect(decideCommit(40, 0.6, 400)).toBe(true);
    expect(decideCommit(10, 0.6, 400)).toBe(false);
  });
  it("cancels when the finger was moving back left", () => {
    expect(decideCommit(300, -0.4, 400)).toBe(false);
  });
});

describe("settleDuration", () => {
  it("stays within 140..320ms", () => {
    expect(settleDuration(1000, 0)).toBe(320);
    expect(settleDuration(10, 0)).toBe(140);
    expect(settleDuration(300, 2)).toBe(150);
  });
});
