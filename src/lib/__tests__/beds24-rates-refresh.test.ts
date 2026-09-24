import { describe, expect, it } from "vitest";
import { isRatesStale, RATES_STALE_MS } from "@/lib/beds24/rates-refresh";

/**
 * 「이 창의 요금이 낡았는가」.
 *
 * 저쪽은 Cloud Scheduler 로 15분마다 정확히 돈다. 우리 주기 동기화는 GitHub Actions 라
 * 실제 간격이 3~5시간이다 — 그 사이 Beds24 에서 가격이 바뀌면 우리 화면은 몇 시간째 옛 값을
 * 보여주고, **그 값을 기준으로 퍼센트 조정을 하게 된다.**
 *
 * 계약: docs/product/33-calendar-write-features.md
 */
describe("isRatesStale", () => {
  const now = Date.parse("2026-09-24T12:00:00.000Z");

  it("15분 안이면 쓸 만하다 — 저쪽 주기와 같은 기준", () => {
    expect(isRatesStale("2026-09-24T11:50:00.000Z", now)).toBe(false);
    expect(RATES_STALE_MS).toBe(15 * 60 * 1000);
  });

  it("15분을 넘으면 낡았다", () => {
    expect(isRatesStale("2026-09-24T11:44:00.000Z", now)).toBe(true);
  });

  it("**값이 아예 없으면 당겨 온다** — 「안 낡았다」가 아니다", () => {
    expect(isRatesStale(null, now)).toBe(true);
  });

  it("읽을 수 없는 시각도 당겨 온다 — 모르면 최신이라고 하지 않는다", () => {
    expect(isRatesStale("(망가진 값)", now)).toBe(true);
  });

  it("미래 시각은 낡지 않은 것으로 본다", () => {
    // 시계가 어긋나도 무한히 당기지 않는다.
    expect(isRatesStale("2026-09-24T12:30:00.000Z", now)).toBe(false);
  });
});
