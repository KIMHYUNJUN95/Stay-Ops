// 공용 admin 콘솔 .xlsx 빌더의 행 높이 회귀 가드.
//
// 2026-07-30: 데이터 행 높이가 18pt 로 고정돼 있어서 `wrap: true` 열(메모 / 비고 / 반품 품목)의
// 두 번째 줄부터가 파일에서 잘려 보였다. 명시적 높이가 있으면 Excel/LibreOffice 가 자동 맞춤을
// 하지 않기 때문이다. 이 빌더는 청소·주문·근태·린넨 콘솔이 함께 쓰므로 한 번 깨지면 전부 깨진다.

import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const NOTE_ONE_LINE = "[샘플]";
const NOTE_THREE_LINES =
  "[샘플] 3층 객실 정리분. 이불커버 2장은 얼룩이 심해 별도로 표시해 두었습니다.";

async function buildSheet(rows: Record<string, string>[]) {
  const { buildAdminTableWorkbookBase64 } = await import("@/lib/admin-table-workbook");
  const base64 = await buildAdminTableWorkbookBase64({
    orgName: "사무실",
    generatedLabel: "생성일시 · 2026-07-30 17:00",
    sheets: [
      {
        sheetName: "기록",
        title: "기록",
        colNoLabel: "No",
        totalLabel: "합계",
        columns: [
          { key: "building", label: "건물", width: 15, printWidth: 11 },
          { key: "note", label: "메모", width: 34, printWidth: 19, wrap: true },
        ],
        rows,
      },
    ],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(base64, "base64") as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("기록");
  if (!sheet) throw new Error("sheet missing");
  return sheet;
}

describe("buildAdminTableWorkbookBase64 row heights", () => {
  it("keeps single-line rows at the base height", async () => {
    const sheet = await buildSheet([{ building: "아라키초B", note: NOTE_ONE_LINE }]);
    expect(sheet.getRow(3).height).toBe(18);
  });

  it("grows the row so wrapped text is not clipped", async () => {
    const sheet = await buildSheet([{ building: "아라키초B", note: NOTE_THREE_LINES }]);
    const row = sheet.getRow(3);
    // 3줄 × 13.5pt + 여백 4.5pt
    expect(row.height).toBe(45);
    expect(row.getCell(3).alignment?.wrapText).toBe(true);
  });

  it("ignores long text in columns that do not wrap", async () => {
    const sheet = await buildSheet([{ building: NOTE_THREE_LINES, note: NOTE_ONE_LINE }]);
    expect(sheet.getRow(3).height).toBe(18);
  });
});
