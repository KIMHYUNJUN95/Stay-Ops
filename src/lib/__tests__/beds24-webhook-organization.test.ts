import { describe, expect, it } from "vitest";
import { pickWebhookOrganizationId } from "@/lib/beds24/webhook-organization";

/** 웹훅 예약의 조직은 DB 매핑이 정하고, 매핑이 없을 때만 서버 기본값으로 떨어진다. */
describe("pickWebhookOrganizationId", () => {
  it("uses the single mapped organization over the fallback", () => {
    expect(pickWebhookOrganizationId({ fallbackOrganizationId: "env-org", mappedOrganizationIds: ["org-a"] })).toBe("org-a");
  });

  it("keeps the fallback when the mapping includes it", () => {
    expect(
      pickWebhookOrganizationId({ fallbackOrganizationId: "org-b", mappedOrganizationIds: ["org-a", "org-b"] }),
    ).toBe("org-b");
  });

  it("falls back when there is no mapping", () => {
    expect(pickWebhookOrganizationId({ fallbackOrganizationId: "env-org", mappedOrganizationIds: [] })).toBe("env-org");
  });

  it("falls back when the mapping is ambiguous", () => {
    expect(
      pickWebhookOrganizationId({ fallbackOrganizationId: "env-org", mappedOrganizationIds: ["org-a", "org-b"] }),
    ).toBe("env-org");
  });

  it("dedupes repeated mapped rows", () => {
    expect(pickWebhookOrganizationId({ fallbackOrganizationId: null, mappedOrganizationIds: ["org-a", "org-a"] })).toBe(
      "org-a",
    );
  });

  it("returns null when nothing is known", () => {
    expect(pickWebhookOrganizationId({ fallbackOrganizationId: null, mappedOrganizationIds: [] })).toBeNull();
  });
});
