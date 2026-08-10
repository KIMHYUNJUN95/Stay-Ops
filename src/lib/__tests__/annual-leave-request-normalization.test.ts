import { describe, expect, it } from "vitest";
import { normalizeLeaveRequestPeriod } from "../annual-leave-request-normalization";

describe("normalizeLeaveRequestPeriod", () => {
  it("derives full-day counts on the server", () => {
    expect(
      normalizeLeaveRequestPeriod({
        leaveType: "paid",
        startDate: "2026-08-10",
        endDate: "2026-08-12",
        durationUnit: "full",
      }),
    ).toEqual({
      startDate: "2026-08-10",
      endDate: "2026-08-12",
      durationUnit: "full",
      daysCount: 3,
    });
  });

  it("forces half-day requests to one date and 0.5 days", () => {
    expect(
      normalizeLeaveRequestPeriod({
        leaveType: "paid",
        startDate: "2026-08-10",
        endDate: "2026-08-31",
        durationUnit: "am",
      }),
    ).toMatchObject({ endDate: "2026-08-10", daysCount: 0.5 });
  });

  it("rejects impossible calendar dates", () => {
    expect(
      normalizeLeaveRequestPeriod({
        leaveType: "paid",
        startDate: "2026-02-30",
        endDate: "2026-03-01",
        durationUnit: "full",
      }),
    ).toBeNull();
  });
});
