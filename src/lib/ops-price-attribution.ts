/**
 * 가격 개입 전환 — 「가격을 바꿔서 예약이 들어왔는가」. **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「가격 개입 전환」
 * 원본: STAY ARI Manager `src/utils/priceAttribution.js` (`buildPriceAttributionResult`, 2026-09-24)
 *
 * ## 판정 (저쪽과 같다)
 *
 * 예약 하나가 가격 개입 G 의 전환이려면 전부 참이어야 한다 —
 *
 * 1. **같은 방**이다.
 * 2. 숙박이 G 가 바꾼 날짜(그 방)를 **하나 이상** 덮는다.
 * 3. 예약 생성 시각이 `G 적용 < 생성 ≤ G 적용 + 48h` 다(경계: 적용과 같은 시각은 안 친다).
 * 4. 그 겹치는 날짜 중 하나 이상이 **G 적용 당시 비어 있었다** — 그 방·그 날짜를 처음 차지한
 *    확정 예약의 생성 시각이 G 보다 늦다(또는 없다). 이미 팔린 날의 가격을 바꾼 것은 전환이 아니다.
 *    생성 시각을 모르는 예약은 「처음부터 있었다」로 본다(저쪽 `-Infinity`).
 *
 * 후보가 여럿이면 **가장 최근 개입** 하나(저쪽과 같다). 취소된 예약은 넣지 않는다(호출부가 거른다).
 *
 * ## 저쪽과 다르게 한 것
 *
 * - 개입의 단위: 저쪽은 로그 문서(여러 방·날짜의 평균 + `priceSnapshot`), 우리는 **칸 단위 이력**
 *   (`price_change_logs` — 방·날짜·이전·이후)을 작업(`job_id`)으로 묶는다. 그래서 「그 예약의 방·
 *   날짜에서 얼마를 바꿨나」를 **추정 없이** 뽑는다(저쪽은 스냅샷이 없으면 로그 평균으로 대신했다).
 * - 생성 시각: Beds24 `bookingTime`(UTC ISO)만 쓴다 — 실측 100% 차 있다. 날짜만 있는 값으로 23:59
 *   를 가정하는 저쪽의 대체 경로는 쓸 일이 없다.
 */

export const PRICE_ATTRIBUTION_WINDOW_HOURS = 48;

/** 판매 캘린더가 판정하는 기간 — 가격을 바꾼 시각 기준 최근 N일. */
export const OPS_PRICE_ATTRIBUTION_LOOKBACK_DAYS = 90;

/** 가격 변경 이력 한 칸. 같은 작업(`groupId`)의 칸들이 한 번의 개입이다. */
export type AttributionCell = {
  groupId: string;
  roomKey: string;
  stayDate: string;
  appliedAtMs: number;
  oldValue: number | null;
  newValue: number | null;
  changedBy: string | null;
};

/** 확정 예약. `createdAtMs` 를 모르면 `null` — 전환 후보가 못 되고, 「처음부터 있었다」로 센다. */
export type AttributionReservation = {
  id: string;
  roomKey: string;
  checkIn: string;
  checkOut: string;
  createdAtMs: number | null;
};

export type PriceConversion = {
  reservationId: string;
  groupId: string;
  appliedAtMs: number;
  bookingCreatedAtMs: number;
  /** 가격을 바꾼 뒤 몇 시간 만에 들어왔나(소수 1자리). */
  hoursToBooking: number;
  /** 그 예약의 숙박에 걸린, 이 개입이 바꾼 밤들. */
  nights: Array<{ date: string; oldValue: number | null; newValue: number | null }>;
  oldAverage: number | null;
  newAverage: number | null;
  delta: number | null;
  /** 이전 대비 %(소수 1자리). 이전 값을 모르면 `null`. */
  percent: number | null;
  changedBy: string | null;
};

type Group = {
  groupId: string;
  appliedAtMs: number;
  changedBy: string | null;
  cellsByRoom: Map<string, Map<string, AttributionCell>>;
};

function average(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (known.length === 0) return null;
  return Math.round(known.reduce((sum, value) => sum + value, 0) / known.length);
}

function eachNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const cursor = new Date(`${checkIn}T12:00:00Z`);
  for (let guard = 0; guard < 400; guard += 1) {
    const date = cursor.toISOString().slice(0, 10);
    if (date >= checkOut) break;
    nights.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
}

export function attributePriceConversions(args: {
  cells: readonly AttributionCell[];
  reservations: readonly AttributionReservation[];
  windowHours?: number;
}): PriceConversion[] {
  const windowMs = (args.windowHours ?? PRICE_ATTRIBUTION_WINDOW_HOURS) * 60 * 60 * 1000;

  // ── 개입: 작업 단위로 묶는다. 적용 시각은 그 작업에서 가장 이른 칸.
  const groups = new Map<string, Group>();
  for (const cell of args.cells) {
    if (!Number.isFinite(cell.appliedAtMs)) continue;
    let group = groups.get(cell.groupId);
    if (!group) {
      group = { appliedAtMs: cell.appliedAtMs, cellsByRoom: new Map(), changedBy: cell.changedBy, groupId: cell.groupId };
      groups.set(cell.groupId, group);
    }
    group.appliedAtMs = Math.min(group.appliedAtMs, cell.appliedAtMs);
    const byDate = group.cellsByRoom.get(cell.roomKey) ?? new Map<string, AttributionCell>();
    byDate.set(cell.stayDate, cell);
    group.cellsByRoom.set(cell.roomKey, byDate);
  }
  const groupsByRoom = new Map<string, Group[]>();
  for (const group of groups.values()) {
    for (const roomKey of group.cellsByRoom.keys()) {
      const list = groupsByRoom.get(roomKey) ?? [];
      list.push(group);
      groupsByRoom.set(roomKey, list);
    }
  }

  // ── 그 방·그 날짜를 **처음 차지한** 예약의 생성 시각. 모르면 -∞(처음부터 있었다).
  const earliestOccupied = new Map<string, number>();
  for (const reservation of args.reservations) {
    const createdAt = reservation.createdAtMs ?? Number.NEGATIVE_INFINITY;
    for (const night of eachNight(reservation.checkIn, reservation.checkOut)) {
      const key = `${reservation.roomKey}|${night}`;
      const existing = earliestOccupied.get(key);
      if (existing === undefined || createdAt < existing) earliestOccupied.set(key, createdAt);
    }
  }

  const conversions: PriceConversion[] = [];
  for (const reservation of args.reservations) {
    const createdAt = reservation.createdAtMs;
    if (createdAt === null || !Number.isFinite(createdAt)) continue;
    const candidates = groupsByRoom.get(reservation.roomKey);
    if (!candidates) continue;
    const stay = eachNight(reservation.checkIn, reservation.checkOut);

    let best: { group: Group; overlap: string[] } | null = null;
    for (const group of candidates) {
      if (createdAt <= group.appliedAtMs || createdAt > group.appliedAtMs + windowMs) continue;
      const targets = group.cellsByRoom.get(reservation.roomKey);
      if (!targets) continue;
      const overlap = stay.filter((night) => targets.has(night));
      if (overlap.length === 0) continue;
      const vacantThen = overlap.some((night) => {
        const occupiedAt = earliestOccupied.get(`${reservation.roomKey}|${night}`);
        return occupiedAt === undefined || occupiedAt > group.appliedAtMs;
      });
      if (!vacantThen) continue;
      if (!best || group.appliedAtMs > best.group.appliedAtMs) best = { group, overlap };
    }
    if (!best) continue;

    const targets = best.group.cellsByRoom.get(reservation.roomKey)!;
    const nights = best.overlap.map((date) => ({
      date,
      newValue: targets.get(date)?.newValue ?? null,
      oldValue: targets.get(date)?.oldValue ?? null,
    }));
    const oldAverage = average(nights.map((night) => night.oldValue));
    const newAverage = average(nights.map((night) => night.newValue));
    const delta = oldAverage !== null && newAverage !== null ? newAverage - oldAverage : null;
    conversions.push({
      appliedAtMs: best.group.appliedAtMs,
      bookingCreatedAtMs: createdAt,
      changedBy: best.group.changedBy,
      delta,
      groupId: best.group.groupId,
      hoursToBooking: Math.round(((createdAt - best.group.appliedAtMs) / 3_600_000) * 10) / 10,
      newAverage,
      nights,
      oldAverage,
      percent:
        delta !== null && oldAverage ? Math.round((delta / oldAverage) * 1000) / 10 : null,
      reservationId: reservation.id,
    });
  }

  return conversions.sort((a, b) => b.bookingCreatedAtMs - a.bookingCreatedAtMs);
}
