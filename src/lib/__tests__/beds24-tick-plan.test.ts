import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  BEDS24_TICK_LOCK,
  DEFERRED_REFRESH_MAX_ATTEMPTS,
  decideBeds24Tick,
} from "@/lib/beds24/tick-plan";
import { API_COOLDOWN } from "@/lib/beds24/sync-locks";

/**
 * Beds24 틱 판단.
 *
 * 쿨다운이 풀린 뒤 대기 작업·미뤄 둔 웹훅 재조회를 누가 이어받는지가 여기서 정해진다. 틀리면
 * 쿨다운 중에 Beds24 를 또 부르거나(429 연장), 반대로 작업이 몇 시간 앉아 있는다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「쿨다운이 풀리면 1분 안에 이어서 보낸다」
 */
describe("decideBeds24Tick", () => {
  it("쿨다운 중이면 아무것도 안 한다 — 할 일이 쌓여 있어도", () => {
    expect(
      decideBeds24Tick({ cooldownActive: true, deferredRefreshes: 3, pendingPriceJobs: true }),
    ).toBe("cooldown");
  });

  it("가격 작업이 미뤄 둔 재조회보다 먼저다", () => {
    expect(
      decideBeds24Tick({ cooldownActive: false, deferredRefreshes: 2, pendingPriceJobs: true }),
    ).toBe("run_price_jobs");
  });

  it("작업이 없고 미뤄 둔 재조회가 있으면 다시 읽는다", () => {
    expect(
      decideBeds24Tick({ cooldownActive: false, deferredRefreshes: 1, pendingPriceJobs: false }),
    ).toBe("refresh_deferred");
  });

  it("둘 다 없으면 쉰다", () => {
    expect(
      decideBeds24Tick({ cooldownActive: false, deferredRefreshes: 0, pendingPriceJobs: false }),
    ).toBe("idle");
  });
});

/** SQL `beds24_tick_if_needed()` 가 앱과 같은 이름·한도를 쓰는지. 한쪽만 바꾸면 여기서 깨진다. */
describe("beds24_tick_if_needed SQL lockstep", () => {
  const sql = readFileSync(
    path.resolve("supabase/migrations/202609300004_beds24_tick_cron.sql"),
    "utf8",
  );

  it("쿨다운·틱 락 이름이 같다", () => {
    expect(sql).toContain(`name = '${API_COOLDOWN}'`);
    expect(sql).toContain(`name = '${BEDS24_TICK_LOCK}'`);
  });

  it("재시도 한도가 같다", () => {
    expect(sql).toContain(`attempts < ${DEFERRED_REFRESH_MAX_ATTEMPTS}`);
  });
});
