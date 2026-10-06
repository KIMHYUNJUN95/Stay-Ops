import { describe, expect, it } from "vitest";
import { parseTypedDate } from "@/components/admin/shared/admin-date-range-picker";

describe("parseTypedDate", () => {
  it("reads the common ways people type a date", () => {
    expect(parseTypedDate("2023-02-01")).toBe("2023-02-01");
    expect(parseTypedDate("2023.2.1")).toBe("2023-02-01");
    expect(parseTypedDate("2023/02/01")).toBe("2023-02-01");
    expect(parseTypedDate("20230201")).toBe("2023-02-01");
    expect(parseTypedDate("2023년 2월 1일")).toBe("2023-02-01");
    expect(parseTypedDate("2023年2月1日")).toBe("2023-02-01");
    expect(parseTypedDate(" 23.2.1 ")).toBe("2023-02-01");
  });
  it("rejects incomplete or impossible dates", () => {
    expect(parseTypedDate("2023-02")).toBeNull();
    expect(parseTypedDate("2023-02-30")).toBeNull();
    expect(parseTypedDate("2024-02-29")).toBe("2024-02-29");
    expect(parseTypedDate("2023-13-01")).toBeNull();
    expect(parseTypedDate("")).toBeNull();
  });
});
