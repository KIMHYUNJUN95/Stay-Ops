import { describe, expect, it } from "vitest";
import { isLocale } from "../i18n";

describe("isLocale — server-side preferredLanguage validation", () => {
  it.each(["ko", "ja", "en"])("accepts valid locale %s", (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  it.each(["kr", "JP", "EN", "english", "korean", "japanese", " ko", "ko ", ""])(
    "rejects invalid value %s",
    (value) => {
      expect(isLocale(value)).toBe(false);
    },
  );

  it("rejects null", () => {
    expect(isLocale(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isLocale(undefined)).toBe(false);
  });
});
