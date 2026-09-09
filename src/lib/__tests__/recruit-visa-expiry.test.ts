import { describe, expect, it } from "vitest";

import { parseVisaExpiry, visaAlertOf, visaDaysLeft } from "@/lib/recruit/visa-expiry";

// 아래 문자열은 전부 실제 지원서 194건에서 나온 값이다(개인 식별 정보는 없다).
describe("parseVisaExpiry", () => {
  it("연-월만 있으면 그 달의 마지막 날로 읽는다", () => {
    // 1일로 잡으면 남은 기간을 최대 30일 짧게 계산해 멀쩡한 지원자에게 경고가 붙는다.
    expect(parseVisaExpiry("2027년 3월")).toEqual({ kind: "date", date: "2027-03-31", precision: "month" });
    expect(parseVisaExpiry("2027년3월")).toEqual({ kind: "date", date: "2027-03-31", precision: "month" });
    expect(parseVisaExpiry("2029.2")).toEqual({ kind: "date", date: "2029-02-28", precision: "month" });
    expect(parseVisaExpiry("2028 06")).toEqual({ kind: "date", date: "2028-06-30", precision: "month" });
    expect(parseVisaExpiry("2030/03")).toEqual({ kind: "date", date: "2030-03-31", precision: "month" });
    expect(parseVisaExpiry("2027년 12")).toEqual({ kind: "date", date: "2027-12-31", precision: "month" });
  });

  it("두 자리 연도는 2000년대로 읽는다", () => {
    expect(parseVisaExpiry("27년 2월")).toEqual({ kind: "date", date: "2027-02-28", precision: "month" });
    expect(parseVisaExpiry("26년 12월 1일")).toEqual({ kind: "date", date: "2026-12-01", precision: "day" });
  });

  it("일까지 있는 값을 읽는다", () => {
    expect(parseVisaExpiry("2028.03.17")).toEqual({ kind: "date", date: "2028-03-17", precision: "day" });
    expect(parseVisaExpiry("2027 04.23")).toEqual({ kind: "date", date: "2027-04-23", precision: "day" });
    expect(parseVisaExpiry("2027년 3월 30일")).toEqual({ kind: "date", date: "2027-03-30", precision: "day" });
    expect(parseVisaExpiry("2027년2월18일")).toEqual({ kind: "date", date: "2027-02-18", precision: "day" });
    expect(parseVisaExpiry("2027년 02 10")).toEqual({ kind: "date", date: "2027-02-10", precision: "day" });
  });

  it("구분자 없는 숫자 덩어리를 읽는다", () => {
    expect(parseVisaExpiry("20270811")).toEqual({ kind: "date", date: "2027-08-11", precision: "day" });
    expect(parseVisaExpiry("202905")).toEqual({ kind: "date", date: "2029-05-31", precision: "month" });
  });

  it("일본어 표기와 전각 숫자를 읽는다", () => {
    expect(parseVisaExpiry("2028年10月20日")).toEqual({ kind: "date", date: "2028-10-20", precision: "day" });
    expect(parseVisaExpiry("2031年8月３０日")).toEqual({ kind: "date", date: "2031-08-30", precision: "day" });
  });

  it("설명이 붙어 있어도 날짜 부분을 읽는다", () => {
    expect(parseVisaExpiry("2026년 12월까지")).toEqual({ kind: "date", date: "2026-12-31", precision: "month" });
    expect(parseVisaExpiry("2026.07.31 (갱신예정)")).toEqual({ kind: "date", date: "2026-07-31", precision: "day" });
    expect(parseVisaExpiry("2026년 8월(연장예정)")).toEqual({ kind: "date", date: "2026-08-31", precision: "month" });
    expect(parseVisaExpiry("2026.12만료이나 비자연장할예정입니다")).toEqual({
      kind: "date",
      date: "2026-12-31",
      precision: "month",
    });
  });

  it("영주·무기간·없음은 만료가 아니라 「기한 없음」이다", () => {
    // 「모름」과 구분해야 90일 집계에서 빠지고, 화면에도 「영주」로 뜬다.
    expect(parseVisaExpiry("영주")).toEqual({ kind: "permanent" });
    expect(parseVisaExpiry("영주자")).toEqual({ kind: "permanent" });
    expect(parseVisaExpiry("무기간")).toEqual({ kind: "permanent" });
    expect(parseVisaExpiry("없음")).toEqual({ kind: "permanent" });
  });

  it("일자만 오타면 연·월까지는 믿고 그 달 말일로 읽는다", () => {
    // 2월 30일은 존재하지 않는다. 연·월은 분명하므로 버리지 않되, 말일로 낮춰 남은 기간을
    // 실제보다 길게 잡는다 — 멀쩡한 사람에게 경고가 붙는 쪽으로는 틀리지 않는다.
    expect(parseVisaExpiry("2027.02.30")).toEqual({ kind: "date", date: "2027-02-28", precision: "month" });
  });

  it("읽을 수 없으면 지어내지 않는다", () => {
    // 만료일을 잘못 읽으면 엉뚱한 사람에게 빨간 칩이 붙고 채용에서 밀린다.
    expect(parseVisaExpiry("출국 후 1년까지(미출국)")).toEqual({ kind: "unknown" });
    expect(parseVisaExpiry(null)).toEqual({ kind: "unknown" });
    expect(parseVisaExpiry("   ")).toEqual({ kind: "unknown" });
    expect(parseVisaExpiry("확인 중")).toEqual({ kind: "unknown" });
  });

  it("있을 수 없는 연도·월·일은 거부한다", () => {
    expect(parseVisaExpiry("1999년 3월")).toEqual({ kind: "unknown" });
    expect(parseVisaExpiry("2027년 13월")).toEqual({ kind: "unknown" });
  });
});

describe("visaDaysLeft / visaAlertOf", () => {
  it("남은 일수를 도쿄 기준 날짜로 센다", () => {
    const expiry = parseVisaExpiry("2026-12-31");
    expect(visaDaysLeft(expiry, "2026-12-01")).toBe(30);
    expect(visaDaysLeft(expiry, "2027-01-10")).toBe(-10);
  });

  it("읽지 못한 값과 영주는 일수를 내지 않는다", () => {
    expect(visaDaysLeft({ kind: "unknown" }, "2026-09-09")).toBeNull();
    expect(visaDaysLeft({ kind: "permanent" }, "2026-09-09")).toBeNull();
  });

  it("90일 밖은 칩을 띄우지 않는다", () => {
    expect(visaAlertOf(null)).toBeNull();
    expect(visaAlertOf(120)).toBeNull();
    expect(visaAlertOf(90)).toBe("soon");
    expect(visaAlertOf(31)).toBe("soon");
    expect(visaAlertOf(30)).toBe("critical");
    expect(visaAlertOf(0)).toBe("critical");
    expect(visaAlertOf(-1)).toBe("expired");
  });
});
