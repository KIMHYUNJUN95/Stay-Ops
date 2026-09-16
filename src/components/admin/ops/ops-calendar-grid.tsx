import type {
  OpsCalendarBar,
  OpsCalendarBlock,
  OpsCalendarDay,
  OpsCalendarRate,
  OpsCalendarRoom,
} from "@/lib/ops-calendar";

/**
 * 판매 캘린더 격자.
 *
 * ## 한 객실은 가로 트랙 세 줄이다
 *
 * ```txt
 * │ 402호 │ 42.7K  34.0K  21.4K …  ← 가격 (가장 중요)
 * │       │   2      2     2   …   ← 최소 숙박일 (아주 흐리게)
 * │       │ ▓▓ Sy Yeow ▓▓          ← 예약 막대 / BLOCK
 * ```
 *
 * 한 칸에 셋을 우겨넣지 않는다 — 저쪽 원본과 같은 구조다.
 *
 * ## 가로축이 반 칸 어긋난다
 *
 * 가격·최소숙박은 **그 날 밤의 값**이라 칸에 속한다. 예약 막대는 **날짜와 날짜 사이**를 잇는
 * 것이라 체크인 칸의 가운데에서 체크아웃 칸의 가운데까지 그린다. 그래야 같은 날 나가는 예약과
 * 들어오는 예약이 그 칸 가운데에서 만나 하루에 둘이 보인다.
 */

type Copy = {
  blockLabel: string;
  emptyBody: string;
  emptyTitle: string;
  monthTag: string;
  roomCount: string;
  roomsHeader: string;
  /** 일요일(0)부터. `Date.getUTCDay()` 인덱스와 그대로 맞춘다. */
  weekDaysFromSunday: readonly string[];
};

/**
 * 격자 칸의 가격 표기 — `42659` → `42.7K`.
 *
 * 칸 폭이 30px 대라 `¥42,659` 는 들어가지 않는다. 천 단위로 줄이되 **소수 한 자리는 남긴다** —
 * `42K` 와 `43K` 로 뭉개면 2,000엔 차이가 사라져 가격표를 읽는 의미가 없어진다.
 */
function formatPrice(value: number): string {
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
}

/** 가로축에서 `date` 가 몇 번째 칸인가. 창 밖이면 `null`. */
function columnOf(days: OpsCalendarDay[], date: string): number | null {
  const index = days.findIndex((day) => day.date === date);
  return index === -1 ? null : index;
}

/**
 * 막대의 가로 위치.
 *
 * 체크인/체크아웃이 창 밖이면 가장자리로 자른다 — 1년 전에 들어온 손님도 이 창에 걸치면
 * 그려야 한다. 자른 쪽은 반 칸 오프셋을 주지 않는다(가장자리에 딱 붙어야 「밖에서 이어진다」로
 * 읽힌다).
 */
function barGeometry(days: OpsCalendarDay[], checkIn: string, checkOut: string) {
  const total = days.length;
  if (total === 0) return null;
  const first = days[0].date;
  const lastExclusive = days[total - 1].date;

  const inColumn = columnOf(days, checkIn);
  const outColumn = columnOf(days, checkOut);

  // 창 전체를 지나가거나 한쪽이 밖인 경우를 먼저 정리한다.
  const startUnits = inColumn === null ? (checkIn < first ? 0 : null) : inColumn + 0.5;
  const endUnits =
    outColumn === null ? (checkOut > lastExclusive ? total : null) : outColumn + 0.5;
  if (startUnits === null || endUnits === null) return null;
  if (endUnits <= startUnits) return null;

  return {
    left: `calc(${(startUnits / total) * 100}% + 1px)`,
    width: `calc(${((endUnits - startUnits) / total) * 100}% - 2px)`,
  };
}

/** BLOCK 은 **밤의 범위이며 양끝을 포함한다.** 9/23~9/26 이면 네 밤이다. */
function blockGeometry(days: OpsCalendarDay[], startDate: string, endDate: string) {
  const total = days.length;
  if (total === 0) return null;
  const startColumn = columnOf(days, startDate);
  const endColumn = columnOf(days, endDate);
  const from = startColumn ?? (startDate < days[0].date ? 0 : null);
  const to = endColumn ?? (endDate > days[total - 1].date ? total - 1 : null);
  if (from === null || to === null || to < from) return null;
  return {
    left: `calc(${(from / total) * 100}% + 1px)`,
    width: `calc(${((to - from + 1) / total) * 100}% - 2px)`,
  };
}

export function OpsCalendarGrid({
  bars,
  blocks,
  copy,
  days,
  gapCells,
  rates,
  rooms,
  today,
}: {
  bars: OpsCalendarBar[];
  blocks: OpsCalendarBlock[];
  copy: Copy;
  days: OpsCalendarDay[];
  /** `roomKey|YYYY-MM-DD` — 1박 갭인 칸. */
  gapCells: Set<string>;
  rates: Map<string, OpsCalendarRate>;
  rooms: OpsCalendarRoom[];
  today: string;
}) {
  if (rooms.length === 0) {
    return (
      <div className="opsg">
        <div className="ops__empty">
          <h2>{copy.emptyTitle}</h2>
          <p>{copy.emptyBody}</p>
        </div>
      </div>
    );
  }

  const weekdays = copy.weekDaysFromSunday;
  const barsByRoom = new Map<string, OpsCalendarBar[]>();
  for (const bar of bars) {
    const list = barsByRoom.get(bar.roomKey);
    if (list) list.push(bar);
    else barsByRoom.set(bar.roomKey, [bar]);
  }
  const blocksByRoom = new Map<string, OpsCalendarBlock[]>();
  for (const block of blocks) {
    const list = blocksByRoom.get(block.roomKey);
    if (list) list.push(block);
    else blocksByRoom.set(block.roomKey, [block]);
  }

  // 건물이 바뀌는 자리에 묶음 머리글을 넣는다. 건물 하나만 골랐어도 「객실 N」이 보여야
  // 격자가 전부인지 잘린 것인지 알 수 있다.
  const roomsByProperty: { property: string; rooms: OpsCalendarRoom[] }[] = [];
  for (const room of rooms) {
    const last = roomsByProperty.at(-1);
    if (last && last.property === room.propertyName) last.rooms.push(room);
    else roomsByProperty.push({ property: room.propertyName, rooms: [room] });
  }

  const cellClass = (day: OpsCalendarDay, roomKey?: string) =>
    [
      "opsg__cell",
      day.isWeekend ? "we" : "",
      day.date < today ? "past" : "",
      day.startsMonth ? "m1" : "",
      roomKey && gapCells.has(`${roomKey}|${day.date}`) ? "gap" : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="opsg">
      <div className="opsg__head">
        <div className="opsg__corner">{copy.roomsHeader}</div>
        {days.map((day) => (
          <div
            className={[
              "opsg__day",
              day.isWeekend ? "we" : "",
              day.isToday ? "today" : "",
              day.startsMonth ? "m1" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={day.date}
          >
            {day.startsMonth && (
              <span className="opsg__mtag">
                {copy.monthTag.replace("{month}", String(Number(day.date.slice(5, 7))))}
              </span>
            )}
            <div className="opsg__dn">{day.day}</div>
            <div className="opsg__dw">{weekdays[day.weekday]}</div>
          </div>
        ))}
      </div>

      <div className="opsg__scroll">
        {roomsByProperty.map((group) => (
          <div key={group.property}>
            <div className="opsg__group">
              {group.property}
              <span className="opsg__gcount">
                · {copy.roomCount.replace("{count}", String(group.rooms.length))}
              </span>
            </div>
            {group.rooms.map((room) => {
              const roomBars = barsByRoom.get(room.key) ?? [];
              const roomBlocks = blocksByRoom.get(room.key) ?? [];
              const occupied = new Set<string>();
              for (const bar of roomBars) {
                if (bar.isCancelled) continue;
                for (const day of days) {
                  if (day.date >= bar.checkIn && day.date < bar.checkOut) occupied.add(day.date);
                }
              }
              for (const block of roomBlocks) {
                for (const day of days) {
                  if (day.date >= block.startDate && day.date <= block.endDate) {
                    occupied.add(day.date);
                  }
                }
              }

              return (
                <div className="opsg__row" key={room.key}>
                  <div className="opsg__label">
                    <span className="opsg__rn">{room.displayRoomLabel}</span>
                  </div>
                  <div className="opsg__tracks">
                    {/* 가격. 값이 없으면 대시 — **0원이 아니다.** */}
                    <div className="opsg__track">
                      {days.map((day) => {
                        const price = rates.get(`${room.key}|${day.date}`)?.price ?? null;
                        return (
                          <div className={cellClass(day)} key={`p-${day.date}`}>
                            <span className={`opsg__price${price === null ? " none" : ""}`}>
                              {price === null ? "–" : formatPrice(price)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 최소 숙박일. 아주 흐리게 — 가격을 읽는 데 방해가 되면 안 된다. */}
                    <div className="opsg__track">
                      {days.map((day) => {
                        const minStay = rates.get(`${room.key}|${day.date}`)?.minStay ?? null;
                        return (
                          <div className={cellClass(day, room.key)} key={`m-${day.date}`}>
                            <span className="opsg__min">{minStay ?? ""}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 예약 · BLOCK */}
                    <div className="opsg__track">
                      {days.map((day) => (
                        <div className={cellClass(day)} key={`r-${day.date}`}>
                          {!occupied.has(day.date) && day.date >= today && (
                            <span className="opsg__plus">+</span>
                          )}
                        </div>
                      ))}
                      {roomBlocks.map((block) => {
                        const geometry = blockGeometry(days, block.startDate, block.endDate);
                        if (!geometry) return null;
                        return (
                          <div className="opsg__block" key={block.id} style={geometry}>
                            {copy.blockLabel}
                          </div>
                        );
                      })}
                      {days.map((day) =>
                        gapCells.has(`${room.key}|${day.date}`) ? (
                          <div
                            className="opsg__gap"
                            key={`g-${day.date}`}
                            style={{
                              left: `calc(${(days.indexOf(day) / days.length) * 100}% + 1px)`,
                              width: `calc(${(1 / days.length) * 100}% - 2px)`,
                            }}
                          />
                        ) : null,
                      )}
                      {roomBars.map((bar) => {
                        const geometry = barGeometry(days, bar.checkIn, bar.checkOut);
                        if (!geometry) return null;
                        return (
                          <div
                            className={`opsg__bar ${bar.channel}${bar.isCancelled ? " cancelled" : ""}`}
                            key={bar.id}
                            style={geometry}
                            title={`${bar.guestName} · ${bar.checkIn} → ${bar.checkOut}`}
                          >
                            {bar.guestName}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
