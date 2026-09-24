/**
 * Beds24 `POST /inventory/rooms/calendar` 로 나갈 값을 만든다.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md
 * 원본: STAY ARI Manager `functions/index.js` — `validatePriceDateValues`,
 *       `buildBeds24CalendarUpdatesFromDates`, `consolidateCalendarRanges`
 *
 * **순수 모듈이다.** 여기서 틀리면 실제 판매가가 지워지거나 엉뚱한 값이 채널로 나간다.
 * 네트워크도 DB 도 건드리지 않으므로 전부 테스트로 고정한다.
 */

/** 한 날짜에 쓸 값. 넣지 않은 항목은 **건드리지 않는다**(Beds24 가 기존 값을 유지한다). */
export type CalendarDateValues = {
  /** 에어비앤비 가격. `"REMOVE"` 는 **삭제**다. */
  p1?: number | "REMOVE";
  /** 부킹닷컴 가격. */
  p2?: number | "REMOVE";
  /** 대체가. */
  p3?: number | "REMOVE";
  /** 최소숙박. */
  m?: number;
  /** 최대숙박. */
  mx?: number;
  /** 재고. */
  na?: number;
  /** `"blackout"` 등. 빈 문자열은 해제. */
  ov?: string;
};

/** Beds24 가 받는 한 구간. `from`·`to` 는 `YYYY-MM-DD`, 양끝 포함. */
export type CalendarSegment = {
  from: string;
  to: string;
  price1?: number | null;
  price2?: number | null;
  price3?: number | null;
  minStay?: number;
  maxStay?: number;
  numAvail?: number;
  override?: string | null;
};

const PRICE_FIELDS = ["p1", "p2", "p3"] as const;
const INT_FIELDS = ["m", "mx", "na"] as const;

/**
 * 큐에 넣기 **전에** 입력을 막는다.
 *
 * 저쪽이 이 검증을 따로 둔 이유가 무섭다 — 가격을 `parseFloat` 로 넘기는데 숫자가 아니면
 * `NaN` 이 되고, `JSON.stringify` 가 그걸 `null` 로 직렬화한다. **Beds24 는 `price1: null`
 * 을 「가격 삭제」로 처리한다.** 빈 입력 하나가 실제 판매가를 지운다.
 *
 * `"REMOVE"` 만 의도적인 삭제 신호로 통과시킨다.
 *
 * @returns 문제가 있으면 사람이 읽을 메시지, 없으면 `null`.
 */
export function validateCalendarDateValues(
  dates: Record<string, CalendarDateValues>,
): string | null {
  for (const [dateKey, values] of Object.entries(dates)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return `날짜 형식이 아닙니다: ${dateKey}`;
    }
    if (!values || typeof values !== "object") continue;

    for (const field of PRICE_FIELDS) {
      const raw = values[field];
      if (raw === undefined || raw === null) continue;
      if (raw === "REMOVE") continue;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
        return `${dateKey} 의 ${field} 값이 올바르지 않습니다: ${JSON.stringify(raw)}`;
      }
    }

    for (const field of INT_FIELDS) {
      const raw = values[field];
      if (raw === undefined || raw === null) continue;
      if (typeof raw !== "number" || !Number.isInteger(raw)) {
        return `${dateKey} 의 ${field} 값이 올바르지 않습니다: ${JSON.stringify(raw)}`;
      }
    }

    // 최소숙박 0 은 Beds24 에서 「비활성」과 구별이 안 된다. 1 이상만 받는다.
    if (values.m !== undefined && values.m < 1) {
      return `${dateKey} 의 최소숙박은 1 이상이어야 합니다: ${values.m}`;
    }
    if (values.na !== undefined && values.na < 0) {
      return `${dateKey} 의 재고는 0 이상이어야 합니다: ${values.na}`;
    }
  }
  return null;
}

/** `YYYY-MM-DD` 다음 날. 월말·연말을 UTC 기준으로 안전하게 넘긴다. */
function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** `from`·`to` 를 뺀 값 부분만 같은지 본다. */
function sameValues(a: CalendarSegment, b: CalendarSegment): boolean {
  const valuesOf = (segment: CalendarSegment) => {
    const copy: Record<string, unknown> = { ...segment };
    delete copy.from;
    delete copy.to;
    return copy;
  };
  const aValues = valuesOf(a);
  const bValues = valuesOf(b);
  const keys = [...new Set([...Object.keys(aValues), ...Object.keys(bValues)])];
  return keys.every((key) => aValues[key] === bValues[key]);
}

/**
 * 값이 같고 **날짜가 붙어 있는** 구간을 하나로 합친다.
 *
 * 30일 × 객실 90개를 날짜별로 보내면 2,700구간이 된다. 합치면 대개 수십 개로 줄고,
 * 그만큼 Beds24 크레딧을 덜 쓴다 — 크레딧은 계정 단위라 예약 동기화와 나눠 쓰는 자원이다.
 */
export function consolidateCalendarRanges(segments: CalendarSegment[]): CalendarSegment[] {
  if (segments.length <= 1) return [...segments];
  const sorted = [...segments].sort((a, b) => a.from.localeCompare(b.from));
  const result: CalendarSegment[] = [{ ...sorted[0] }];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = result[result.length - 1];
    const current = sorted[index];
    if (nextDate(previous.to) === current.from && sameValues(previous, current)) {
      previous.to = current.to;
    } else {
      result.push({ ...current });
    }
  }
  return result;
}

/**
 * 날짜별 값 → Beds24 구간 배열.
 *
 * **넣지 않은 항목은 payload 에 넣지 않는다.** `price2: undefined` 를 보내면 그 값을
 * 지우라는 뜻이 되지 않도록, 아예 키를 만들지 않는다.
 */
export function buildCalendarSegments(
  dates: Record<string, CalendarDateValues>,
): CalendarSegment[] {
  const segments: CalendarSegment[] = [];
  for (const [date, values] of Object.entries(dates)) {
    const segment: CalendarSegment = { from: date, to: date };
    if (values.p1 !== undefined) segment.price1 = values.p1 === "REMOVE" ? null : values.p1;
    if (values.p2 !== undefined) segment.price2 = values.p2 === "REMOVE" ? null : values.p2;
    if (values.p3 !== undefined) segment.price3 = values.p3 === "REMOVE" ? null : values.p3;
    if (values.m !== undefined) segment.minStay = values.m;
    if (values.mx !== undefined) segment.maxStay = values.mx;
    if (values.na !== undefined) segment.numAvail = values.na;
    if (values.ov !== undefined) segment.override = values.ov || null;
    segments.push(segment);
  }
  return consolidateCalendarRanges(segments);
}
