/**
 * 가격 조정 계산 — **순수 모듈**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「조정 방식 두 가지」
 * 원본: STAY ARI Manager `BuildingCalendar.jsx` — `confirmDisplayData`, `handleSave`
 *
 * 여기서 나온 숫자가 그대로 채널로 나간다. 반올림 한 번, 기준가 하나만 틀려도 **잘못된
 * 가격에 팔린다.** 화면에서 「¥30,000 으로 바꿨다」고 보이는데 실제로는 다른 값이 나가는
 * 일이 없도록 계산을 전부 여기 모은다.
 */

/** 한 칸의 현재 상태. `price` 가 없으면 **대상에서 빠진다** — 아래 참고. */
export type AdjustmentCellInput = {
  roomKey: string;
  roomLabel: string;
  date: string;
  price: number | null;
};

/**
 * 조정 입력.
 *
 * 화면에는 **모드 토글이 없다**(2026-09-16 확정) — 금액과 퍼센트는 같은 값을 정하는 두 가지
 * 방법일 뿐이라 한 화면에서 같이 쓴다. 다만 **적용 결과가 다르므로** 데이터는 구분한다.
 *
 * | | 적용 |
 * | --- | --- |
 * | `amount` | 고른 칸 **전부**를 그 금액으로 |
 * | `percent` | 칸마다 **자기 현재가** × (1 + %/100) |
 *
 * 퍼센트는 칸마다 결과가 다르다. 그래서 화면은 「변경」을 **범위**로 보여준다.
 */
export type AdjustmentInput =
  | { kind: "amount"; amount: number }
  | { kind: "percent"; percent: number };

/** 저쪽과 같은 프리셋. */
export const PERCENT_PRESETS = [-20, -10, -5, 5, 10, 20, 30] as const;

export type AdjustmentRow = {
  roomKey: string;
  roomLabel: string;
  date: string;
  currentPrice: number;
  newPrice: number;
};

export type AdjustmentPreview = {
  rows: AdjustmentRow[];
  /** 현재 평균. 금액을 직접 넣었을 때 % 배지를 계산하는 기준이다. */
  currentAverage: number;
  newMin: number;
  newMax: number;
  newAverage: number;
  /**
   * **현재 가격이 없어서 빠진 칸 수.**
   *
   * 퍼센트는 기준가가 있어야 계산되고, 금액이라도 「원래 안 팔던 날」에 값을 넣는 것은
   * 다른 행위다. 저쪽도 `if (!currentPrice.hasPrice) return;` 으로 거른다.
   * **조용히 빼지 않고 개수를 알려준다.**
   */
  skippedNoPrice: number;
  /** 값이 실제로 달라지는 칸 수. 0이면 보낼 이유가 없다. */
  changedCount: number;
};

/** 한 칸의 새 가격. 퍼센트는 **반올림**한다(저쪽 `Math.round`). */
export function computeAdjustedPrice(current: number, input: AdjustmentInput): number {
  if (input.kind === "amount") return Math.round(input.amount);
  return Math.round(current * (1 + input.percent / 100));
}

/**
 * 고른 칸 전부에 대해 「현재 → 새 가격」을 만든다.
 *
 * 확인 단계가 이 결과를 그대로 보여주고, 저장도 이 결과를 그대로 보낸다 — **보이는 것과
 * 보내는 것이 같은 값이어야 한다.** 따로 계산하면 언젠가 갈라진다.
 */
export function buildAdjustmentPreview(
  cells: AdjustmentCellInput[],
  input: AdjustmentInput,
): AdjustmentPreview {
  const priced = cells.filter(
    (cell): cell is AdjustmentCellInput & { price: number } => cell.price !== null,
  );
  const skippedNoPrice = cells.length - priced.length;

  const rows: AdjustmentRow[] = priced
    .map((cell) => ({
      currentPrice: cell.price,
      date: cell.date,
      newPrice: computeAdjustedPrice(cell.price, input),
      roomKey: cell.roomKey,
      roomLabel: cell.roomLabel,
    }))
    // 확인 화면이 날짜 → 객실 순으로 읽히도록 정렬한다(저쪽과 같다).
    .sort((a, b) => a.date.localeCompare(b.date) || a.roomLabel.localeCompare(b.roomLabel));

  const average = (values: number[]) =>
    values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  const newPrices = rows.map((row) => row.newPrice);
  return {
    changedCount: rows.filter((row) => row.newPrice !== row.currentPrice).length,
    currentAverage: average(rows.map((row) => row.currentPrice)),
    newAverage: average(newPrices),
    newMax: newPrices.length === 0 ? 0 : Math.max(...newPrices),
    newMin: newPrices.length === 0 ? 0 : Math.min(...newPrices),
    rows,
    skippedNoPrice,
  };
}

/**
 * 금액을 직접 넣었을 때 보여줄 **% 배지**. 기준은 현재 평균이다.
 *
 * 화면에서 금액과 퍼센트가 서로를 계산해 주기 때문에 필요하다 — 모드 토글을 없앤 대가다.
 */
export function percentFromAmount(currentAverage: number, amount: number): number | null {
  if (currentAverage <= 0) return null;
  return Math.round(((amount - currentAverage) / currentAverage) * 100);
}

/** 퍼센트를 눌렀을 때 입력칸에 채워 줄 **금액**. 기준은 현재 평균이다. */
export function amountFromPercent(currentAverage: number, percent: number): number | null {
  if (currentAverage <= 0) return null;
  return Math.round(currentAverage * (1 + percent / 100));
}

/**
 * 보내기 전 마지막 점검.
 *
 * **비정상적인 값을 조용히 보내지 않는다.** 잘못 쓰면 채널에 그대로 나간다 —
 * 0원에 팔리거나, 자릿수 하나가 더 붙어 아무도 안 사는 방이 된다.
 */
export type AdjustmentWarning = "zero" | "huge_drop" | "huge_rise";

export function findAdjustmentWarnings(preview: AdjustmentPreview): AdjustmentWarning[] {
  const warnings: AdjustmentWarning[] = [];
  if (preview.rows.length === 0) return warnings;
  if (preview.rows.some((row) => row.newPrice <= 0)) warnings.push("zero");
  // 기준가 대비 절반 아래 / 세 배 위. 있을 수 있는 조정이지만 **확인은 받아야 한다.**
  if (preview.rows.some((row) => row.newPrice < row.currentPrice * 0.5)) {
    warnings.push("huge_drop");
  }
  if (preview.rows.some((row) => row.newPrice > row.currentPrice * 3)) {
    warnings.push("huge_rise");
  }
  return warnings;
}
