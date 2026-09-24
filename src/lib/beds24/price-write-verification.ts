/**
 * **쓴 값을 다시 읽어 대조한다.**
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「쓰기 안전장치」
 * 원본: STAY ARI Manager `functions/index.js` — `verifyBeds24PriceWrites`,
 *       `getCalendarEntryForDate`, `normalizeBeds24MinStay`
 *
 * ## 왜 필요한가
 *
 * **Beds24 는 값을 반영하지 않고도 `success: true` 를 돌려준다.** 연결된 Daily Price 쪽에
 * 잘못 쓴 요청도 성공으로 답한다. 검증이 없으면 반영 실패가 그대로 「성공」으로 기록되고,
 * 화면에는 바뀐 값이 뜨는데 채널에 나가는 가격은 옛날 값이다.
 *
 * 이 모듈은 **순수하다** — 네트워크는 부르는 쪽이 하고, 여기서는 「기대값 vs 읽어온 값」만
 * 따진다. 비교 규칙이 틀리면 틀린 걸 맞다고 하거나 맞는 걸 틀렸다고 하므로 테스트로 고정한다.
 */

/** Beds24 가 돌려주는 한 구간. 값이 같은 날이 이어지면 한 덩어리로 온다. */
export type CalendarReadSegment = {
  from: string;
  to: string;
  price1?: number | string | null;
  minStay?: number | string | null;
};

/** 한 날짜에 기대하는 값. 쓸 때 보낸 것과 같은 모양이다. */
export type ExpectedDateValues = {
  p1?: number | "REMOVE";
  m?: number;
};

export type VerificationMismatch = {
  date: string;
  field: "price1" | "minStay";
  expected: number | null;
  actual: number | null;
};

/**
 * 구간 목록에서 그 날짜를 품은 구간을 찾는다.
 *
 * 응답이 **구간**이라 날짜로 바로 못 찾는다. `from <= date <= to` 인 첫 구간이 그 날짜다.
 */
export function findCalendarEntryForDate(
  segments: CalendarReadSegment[],
  date: string,
): CalendarReadSegment | null {
  return segments.find((segment) => segment.from <= date && segment.to >= date) ?? null;
}

/**
 * **Beds24 는 minStay 1 을 빈칸으로 돌려준다.**
 *
 * 그래서 양쪽 모두 1 기준으로 맞춘 뒤 비교해야 한다. 안 그러면 「1박으로」를 성공적으로 쓴
 * 다음 읽었을 때 `null !== 1` 이 되어 **성공한 작업이 실패로 보고된다.**
 *
 * 1 미만이거나 숫자가 아니면 전부 1 로 본다(저쪽 `normalizeBeds24MinStay` 와 같다).
 */
export function normalizeBeds24MinStay(raw: number | string | null | undefined): number {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : 1;
}

/** 기대하는 가격. `"REMOVE"` 는 「지워져 있어야 한다」라 `null` 이다. */
export function expectedPriceValue(value: number | "REMOVE"): number | null {
  return value === "REMOVE" ? null : value;
}

/**
 * 한 객실의 기대값과 읽어온 값을 대조한다.
 *
 * **보내지 않은 항목은 보지 않는다.** 최소숙박만 바꿨다면 가격이 뭐든 상관없다 —
 * 안 본 값까지 따지면 남이 그 사이에 바꾼 가격 때문에 내 작업이 실패한다.
 */
export function diffCalendarReadback(args: {
  expected: Record<string, ExpectedDateValues>;
  segments: CalendarReadSegment[];
}): VerificationMismatch[] {
  const mismatches: VerificationMismatch[] = [];
  for (const [date, values] of Object.entries(args.expected)) {
    const entry = findCalendarEntryForDate(args.segments, date);

    if (values.p1 !== undefined) {
      const expected = expectedPriceValue(values.p1);
      const raw = entry?.price1;
      const actual = raw === null || raw === undefined ? null : Number(raw);
      if (expected === null ? actual !== null : actual !== expected) {
        mismatches.push({ actual, date, expected, field: "price1" });
      }
    }

    if (values.m !== undefined) {
      const expected = normalizeBeds24MinStay(values.m);
      // 그 날짜 구간 자체가 없으면 「모른다」다 — 1 로 정규화하면 못 쓴 것을 썼다고 하게 된다.
      const actual = entry ? normalizeBeds24MinStay(entry.minStay) : null;
      if (actual !== expected) {
        mismatches.push({ actual, date, expected, field: "minStay" });
      }
    }
  }
  return mismatches;
}

/** 로그·작업 결과에 넣을 한 줄. 앞 세 건만 보여주고 나머지는 개수로 줄인다. */
export function describeMismatches(mismatches: VerificationMismatch[]): string {
  const sample = mismatches
    .slice(0, 3)
    .map((item) => `${item.date} ${item.field}: 기대=${item.expected}, 실제=${item.actual}`)
    .join("; ");
  return `Beds24 되읽기 불일치 ${mismatches.length}건: ${sample}`;
}

/**
 * 연결 유닛 검증은 **`p1` 만** 본다.
 *
 * 링크로 퍼지는 것은 에어비앤비 가격뿐이다. 최소숙박·재고는 유닛마다 따로라 연결 유닛에서
 * 같은 값이 나올 이유가 없다 — 같이 보면 매번 불일치가 난다.
 */
export function toLinkedUnitExpectation(
  expected: Record<string, ExpectedDateValues>,
): Record<string, ExpectedDateValues> {
  const result: Record<string, ExpectedDateValues> = {};
  for (const [date, values] of Object.entries(expected)) {
    if (values.p1 !== undefined) result[date] = { p1: values.p1 };
  }
  return result;
}
