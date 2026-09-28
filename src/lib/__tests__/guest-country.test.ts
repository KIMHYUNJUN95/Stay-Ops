import { describe, expect, it } from "vitest";
import { countryFromPhone, resolveGuestCountry } from "@/lib/guest-country";

/**
 * 손님 국가 추정.
 *
 * 계약: `src/lib/guest-country.ts`
 *
 * Airbnb 는 국가를 거의 안 주고(2026-09-28 실측 48% 빈칸) 전화번호는 `+` 없는 E.164 로 준다.
 * 번호는 전부 예시용 가짜다.
 */
describe("countryFromPhone", () => {
  it("Airbnb 모양 — `+` 없는 국제 번호", () => {
    expect(countryFromPhone("61412345678")).toBe("AU");
    expect(countryFromPhone("6591234567")).toBe("SG");
    expect(countryFromPhone("821012345678")).toBe("KR");
    expect(countryFromPhone("971501234567")).toBe("AE");
  });

  it("`+1` 은 지역번호로 가른다 — 미국·캐나다·자메이카", () => {
    expect(countryFromPhone("14155552671")).toBe("US");
    expect(countryFromPhone("16135550123")).toBe("CA");
    expect(countryFromPhone("18765551234")).toBe("JM");
  });

  it("`+` · 공백 · 하이픈 · `00` 접두를 받는다", () => {
    expect(countryFromPhone("+81 90-1234-5678")).toBe("JP");
    expect(countryFromPhone("0081 90 1234 5678")).toBe("JP");
  });

  it("국내 번호(앞자리 0)는 나라를 모른다", () => {
    expect(countryFromPhone("09012345678")).toBeNull();
    expect(countryFromPhone("010-1234-5678")).toBeNull();
  });

  it("번호가 아니거나 유효하지 않으면 모른다", () => {
    expect(countryFromPhone("")).toBeNull();
    expect(countryFromPhone(null)).toBeNull();
    expect(countryFromPhone("12345")).toBeNull();
    expect(countryFromPhone("99999999999")).toBeNull();
  });
});

describe("resolveGuestCountry", () => {
  it("채널이 준 국가가 먼저다 — 번호는 추정일 뿐이다", () => {
    expect(resolveGuestCountry({ channelCode: "ca", phones: ["14155552671"] })).toEqual({
      code: "CA",
      source: "channel",
    });
  });

  it("채널 값이 없으면 번호로 채우고, 출처를 phone 으로 적는다", () => {
    expect(resolveGuestCountry({ channelCode: "", phones: ["14155552671"] })).toEqual({
      code: "US",
      source: "phone",
    });
  });

  it("처음으로 나라가 나오는 번호를 쓴다", () => {
    expect(
      resolveGuestCountry({ channelCode: null, phones: ["09012345678", "61412345678"] }),
    ).toEqual({ code: "AU", source: "phone" });
  });

  it("둘 다 없으면 모른다", () => {
    expect(resolveGuestCountry({ channelCode: null, phones: [null, ""] })).toBeNull();
  });
});
