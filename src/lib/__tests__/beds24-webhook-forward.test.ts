import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildForwardUrl,
  forwardBeds24Delivery,
  parseForwardTargets,
} from "@/lib/beds24/webhook-forward";

/**
 * Beds24 배달 전달 — 전환기에 저쪽 프로젝트를 살려두기 위한 스위치.
 *
 * 계약: `src/lib/beds24/webhook-forward.ts`
 * 배경: 재고(가격) 웹훅 URL 칸은 프로퍼티당 한 줄만 받는다(2026-09-25 실측).
 */
describe("parseForwardTargets", () => {
  it("설정되지 않으면 전달하지 않는다 — 이게 기본값이다", () => {
    expect(parseForwardTargets(undefined)).toEqual([]);
    expect(parseForwardTargets(null)).toEqual([]);
    expect(parseForwardTargets("")).toEqual([]);
    expect(parseForwardTargets("   ")).toEqual([]);
  });

  it("줄바꿈·쉼표로 여러 대상을 읽는다 — Beds24 예약 웹훅 칸과 같은 관례", () => {
    expect(
      parseForwardTargets("https://a.example/hook\r\nhttps://b.example/hook, https://c.example/x"),
    ).toEqual(["https://a.example/hook", "https://b.example/hook", "https://c.example/x"]);
  });

  it("http(s) 가 아닌 값은 버린다 — 오타가 조용히 전달 실패로 남지 않도록", () => {
    expect(parseForwardTargets("not-a-url\nftp://x.example\nhttps://ok.example")).toEqual([
      "https://ok.example",
    ]);
  });
});

describe("buildForwardUrl", () => {
  it("질의 파라미터를 그대로 옮긴다 — 재고 웹훅은 파라미터가 곧 페이로드다", () => {
    const url = buildForwardUrl(
      "https://legacy.example/priceWebhook",
      new URLSearchParams({ roomId: "440617", action: "PRICE_CHANGE", propId: "176430" }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("roomId")).toBe("440617");
    expect(parsed.searchParams.get("action")).toBe("PRICE_CHANGE");
    expect(parsed.searchParams.get("propId")).toBe("176430");
  });

  it("우리 시크릿은 넘기지 않는다", () => {
    const url = buildForwardUrl(
      "https://legacy.example/priceWebhook",
      new URLSearchParams({ secret: "our-secret", roomId: "440617" }),
    );
    expect(url).not.toContain("our-secret");
    expect(new URL(url).searchParams.get("roomId")).toBe("440617");
  });

  it("대상이 이미 갖고 있던 파라미터는 지우지 않는다", () => {
    const url = buildForwardUrl(
      "https://legacy.example/hook?token=abc",
      new URLSearchParams({ roomId: "1" }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("token")).toBe("abc");
    expect(parsed.searchParams.get("roomId")).toBe("1");
  });
});

describe("forwardBeds24Delivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("대상이 없으면 아무것도 부르지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      forwardBeds24Delivery({ targets: [], method: "GET", search: new URLSearchParams() }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET 은 본문 없이, POST 는 원문 그대로 넘긴다", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // 인자 없는 목이라 `calls[n][1]` 이 타입상 비어 있다 — 읽을 때만 좁힌다.
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;

    await forwardBeds24Delivery({
      targets: ["https://legacy.example/hook"],
      method: "GET",
      search: new URLSearchParams({ roomId: "1" }),
    });
    expect(calls[0]?.[1]).toMatchObject({ method: "GET", body: undefined });

    await forwardBeds24Delivery({
      targets: ["https://legacy.example/hook"],
      method: "POST",
      search: new URLSearchParams(),
      rawBody: '{"bookId":"1"}',
      contentType: "application/json",
    });
    expect(calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: '{"bookId":"1"}',
      headers: { "content-type": "application/json" },
    });
  });

  it("전달이 실패해도 던지지 않는다 — 전달은 부수 작업이다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const outcomes = await forwardBeds24Delivery({
      targets: ["https://legacy.example/hook"],
      method: "GET",
      search: new URLSearchParams(),
    });
    expect(outcomes).toEqual([
      { target: "https://legacy.example/hook", ok: false, status: null, error: "Error" },
    ]);
  });

  it("한 대상이 죽어도 나머지는 전달된다", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("down");
        return new Response("ok", { status: 200 });
      }),
    );
    const outcomes = await forwardBeds24Delivery({
      targets: ["https://dead.example/hook", "https://alive.example/hook"],
      method: "GET",
      search: new URLSearchParams(),
    });
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([false, true]);
  });

  it("5xx 는 실패로 보고하되 던지지는 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const outcomes = await forwardBeds24Delivery({
      targets: ["https://legacy.example/hook"],
      method: "GET",
      search: new URLSearchParams(),
    });
    expect(outcomes[0]).toMatchObject({ ok: false, status: 500 });
  });
});
