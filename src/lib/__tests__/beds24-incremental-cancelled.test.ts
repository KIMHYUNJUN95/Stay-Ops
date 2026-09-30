import { describe, expect, it } from "vitest";
import {
  buildModifiedSinceUrls,
  combineModifiedSinceResults,
} from "@/lib/beds24/reservations-backfill";

/**
 * 증분 정합성은 취소분을 따로 불러야 한다 (2026-10-01 실측).
 * `modifiedFrom` 만 주면 Beds24 는 취소 예약을 빼고 준다 — 974건 중 취소 0건,
 * 같은 커서에 `&status=cancelled` 는 319건.
 */
const BASE = "https://api.beds24.com/v2/";
const SINCE = "2026-09-01T00:00:00";

function variant(overrides: Partial<Parameters<typeof combineModifiedSinceResults>[0]> = {}) {
  return {
    endpointTried: "x",
    rows: [],
    partial: false,
    failedPageUrl: null,
    skippedReason: "reservations:no-bookings",
    ...overrides,
  } as Parameters<typeof combineModifiedSinceResults>[0];
}

describe("증분 URL", () => {
  it("활성분 URL 은 status 를 붙이지 않는다", () => {
    const urls = buildModifiedSinceUrls(BASE, SINCE);
    expect(urls[0]).toBe(
      "https://api.beds24.com/v2/bookings?modifiedFrom=2026-09-01T00%3A00%3A00&includeInvoiceItems=false",
    );
    for (const url of urls) expect(url).not.toContain("status=");
  });

  it("취소분 URL 은 하나뿐이고 status=cancelled 를 붙인다", () => {
    expect(buildModifiedSinceUrls(BASE, SINCE, "cancelled")).toEqual([
      "https://api.beds24.com/v2/bookings?modifiedFrom=2026-09-01T00%3A00%3A00&status=cancelled",
    ]);
  });
});

describe("활성분 + 취소분 합치기", () => {
  const confirmed = { id: 93352958, status: "confirmed", apiReference: "R1", roomId: 1 };
  const cancelled = { ...confirmed, status: "cancelled" };

  it("취소분만 있어도 행이 나온다 — 예전에는 여기서 0건이었다", () => {
    const result = combineModifiedSinceResults(
      variant(),
      variant({ rows: [cancelled], skippedReason: null }),
    );
    expect(result.partial).toBe(false);
    expect(result.skippedReason).toBeNull();
    expect(result.rows).toEqual([cancelled]);
  });

  it("같은 예약이 양쪽에 있으면 취소가 이긴다", () => {
    const result = combineModifiedSinceResults(
      variant({ rows: [confirmed], skippedReason: null }),
      variant({ rows: [cancelled], skippedReason: null }),
    );
    expect(result.rows).toEqual([cancelled]);
  });

  it("그룹 예약은 채널 번호가 같아도 Beds24 번호로 따로 남는다", () => {
    const sibling = { ...confirmed, id: 93352959, roomId: 2 };
    const result = combineModifiedSinceResults(
      variant({ rows: [confirmed, sibling], skippedReason: null }),
      variant(),
    );
    expect(result.rows).toHaveLength(2);
  });

  it("양쪽 다 0건이면 조용한 날이다", () => {
    const result = combineModifiedSinceResults(variant(), variant());
    expect(result).toMatchObject({ partial: false, rows: [], skippedReason: "reservations:no-bookings" });
  });

  it("취소분이 실패하면 활성분이 있어도 전체 partial — 커서가 멈춰야 한다", () => {
    const failedPartial = combineModifiedSinceResults(
      variant({ rows: [confirmed], skippedReason: null }),
      variant({ partial: true, skippedReason: "reservations:http-500", failedPageUrl: "p2" }),
    );
    expect(failedPartial).toMatchObject({ partial: true, rows: [], skippedReason: "reservations:http-500" });

    const failedRequest = combineModifiedSinceResults(
      variant({ rows: [confirmed], skippedReason: null }),
      variant({ skippedReason: "reservations:request-error" }),
    );
    expect(failedRequest).toMatchObject({ partial: true, rows: [], skippedReason: "reservations:request-error" });
  });
});
