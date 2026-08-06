import { describe, expect, it } from "vitest";
import { appendAdminRestoreMemo, localizeLostFoundMemo } from "@/lib/lost-found-memo";

describe("lost-found system memo localization", () => {
  it("stores an admin restore entry without a viewer-language sentence", () => {
    expect(appendAdminRestoreMemo("existing note", "wrong item")).toBe(
      "existing note\n[stayops:admin_restore] wrong item",
    );
  });

  it("renders the stored marker with the viewer's label", () => {
    expect(localizeLostFoundMemo("[stayops:admin_restore] wrong item", "Admin restore")).toBe(
      "Admin restore: wrong item",
    );
  });

  it("localizes legacy Korean restore entries", () => {
    expect(localizeLostFoundMemo("\uAD00\uB9AC\uC790 \uBCF5\uC6D0: wrong item", "管理者による復元")).toBe(
      "管理者による復元: wrong item",
    );
  });
});
