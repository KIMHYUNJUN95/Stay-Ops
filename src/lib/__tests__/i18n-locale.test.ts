import { describe, expect, it } from "vitest";
import { getDictionary, isLocale, resolveLocale } from "../i18n";

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

describe("resolveLocale — display locale normalization", () => {
  it.each([
    ["ko-KR", "ko"],
    ["ja-JP", "ja"],
    ["en-US", "en"],
    ["JA", "ja"],
    ["english", "en"],
    ["", "ko"],
    [null, "ko"],
    [undefined, "ko"],
  ] as const)("maps %s to %s", (value, expected) => {
    expect(resolveLocale(value)).toBe(expected);
  });

  it("lets getDictionary accept BCP47 locale tags", () => {
    expect(getDictionary("ja-JP").mobile.suggestions.whoAuthorLabel).toBe("作成者");
    expect(getDictionary("en-US").mobile.suggestions.whoAuthorLabel).toBe("Author");
    expect(getDictionary("ko-KR").mobile.suggestions.whoAuthorLabel).toBe("작성자");
  });
});
