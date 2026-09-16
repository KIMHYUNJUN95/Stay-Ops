import { describe, expect, it } from "vitest";
import { extractPriceWebhookSignal } from "@/lib/beds24/price-webhook";

/**
 * 가격 변경 웹훅 모양 판정.
 *
 * 예약 웹훅과 **같은 엔드포인트**로 오고 예약이 들어 있지 않다. 이걸 못 알아보면 「알 수 없는
 * 배달」로 버려지고, **요금 표가 갱신되지 않아 판매 캘린더가 없는 가격을 보여준다.**
 *
 * 계약: docs/product/33-calendar-write-features.md
 * 원본: STAY ARI Manager `functions/index.js` → `exports.priceWebhook`
 */
describe("extractPriceWebhookSignal", () => {
  it("V2(POST/JSON) 배달을 읽는다", () => {
    expect(
      extractPriceWebhookSignal({ roomId: 440617, action: "PRICE_CHANGE", propId: 176430 }),
    ).toEqual({ action: "PRICE_CHANGE", externalPropertyId: "176430", externalRoomId: "440617" });
  });

  it("V1(GET/쿼리) 배달은 값이 전부 문자열로 온다", () => {
    expect(
      extractPriceWebhookSignal({ roomid: "440617", action: "SYNC_ROOM", propid: "176430" }),
    ).toEqual({ action: "SYNC_ROOM", externalPropertyId: "176430", externalRoomId: "440617" });
  });

  it("action 이 없어도 받아들인다 — Beds24 V1 이 그렇게 보낸다", () => {
    // 저쪽도 `!action` 을 허용한다. 여기서 막으면 그 배달만큼 요금이 옛 값으로 남는다.
    expect(extractPriceWebhookSignal({ roomId: "440617" })).toEqual({
      action: null,
      externalPropertyId: null,
      externalRoomId: "440617",
    });
  });

  it("roomId 가 없으면 가격 배달이 아니다", () => {
    expect(extractPriceWebhookSignal({ action: "PRICE_CHANGE" })).toBeNull();
    expect(extractPriceWebhookSignal({})).toBeNull();
    expect(extractPriceWebhookSignal(null)).toBeNull();
    expect(extractPriceWebhookSignal([{ roomId: 1 }])).toBeNull();
  });

  it("모르는 action 은 넘기지 않는다", () => {
    // 예약 계열 이벤트가 이 경로로 새면 엉뚱한 건물을 통째로 재동기화하게 된다.
    expect(extractPriceWebhookSignal({ roomId: 440617, action: "BOOKING_CREATED" })).toBeNull();
  });

  it("action 대소문자는 가리지 않는다", () => {
    expect(extractPriceWebhookSignal({ roomId: 440617, action: "price_change" })?.externalRoomId)
      .toBe("440617");
  });
});
