import { describe, expect, it } from "vitest";
import { tokyoDayEndExclusive, tokyoDayRangeBounds, tokyoDayStart } from "@/lib/tokyo-date";

/**
 * 기간 선택기가 고른 **도쿄 날짜**를 `timestamptz` 조회 경계로 바꾸는 규칙 (2026-09-11).
 *
 * 예전에는 `${from}T00:00:00Z` 로 잘라 UTC 자정 기준이었고, 도쿄가 UTC+9 이라 결과가 9시간
 * 밀렸다 — 시작일 오전 0~9시 것이 빠지고 종료일 다음 날 새벽 것이 섞였다. 리뷰 2,617건 중
 * 17.8% 가 UTC 날짜와 도쿄 날짜가 달라, 경계일마다 실제로 건수가 틀렸다.
 */
describe("도쿄 기간 경계", () => {
  it("시작은 그 날 도쿄 0시다", () => {
    expect(tokyoDayStart("2026-09-01")).toBe("2026-09-01T00:00:00+09:00");
    // UTC 로는 전날 15시 — 예전 코드가 놓치던 9시간이 여기 들어온다.
    expect(new Date(tokyoDayStart("2026-09-01")).toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });

  it("끝은 다음 날 도쿄 0시(미만)다 — 종료일을 통째로 포함한다", () => {
    expect(tokyoDayEndExclusive("2026-09-11")).toBe("2026-09-12T00:00:00+09:00");
    expect(new Date(tokyoDayEndExclusive("2026-09-11")).toISOString()).toBe("2026-09-11T15:00:00.000Z");
  });

  it("달·해 경계를 넘는다", () => {
    expect(tokyoDayEndExclusive("2026-01-31")).toBe("2026-02-01T00:00:00+09:00");
    expect(tokyoDayEndExclusive("2026-02-28")).toBe("2026-03-01T00:00:00+09:00");
    expect(tokyoDayEndExclusive("2026-12-31")).toBe("2027-01-01T00:00:00+09:00");
  });

  it("범위 헬퍼가 두 경계를 함께 준다", () => {
    expect(tokyoDayRangeBounds("2026-06-13", "2026-09-11")).toEqual({
      start: "2026-06-13T00:00:00+09:00",
      endExclusive: "2026-09-12T00:00:00+09:00",
    });
  });

  it("하루짜리 범위도 그 하루를 온전히 담는다", () => {
    const { start, endExclusive } = tokyoDayRangeBounds("2026-09-01", "2026-09-01");
    const startMs = new Date(start).getTime();
    const endMs = new Date(endExclusive).getTime();
    expect(endMs - startMs).toBe(24 * 60 * 60 * 1000);
    // 도쿄 9/1 오전 8시 — 예전 UTC 컷에서는 빠지던 시각이다.
    const morning = new Date("2026-09-01T08:00:00+09:00").getTime();
    expect(morning >= startMs && morning < endMs).toBe(true);
  });
});
