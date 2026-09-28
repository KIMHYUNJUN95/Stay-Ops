/**
 * 예약 막대를 **겹치지 않게 층으로 나눈다**.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「취소된 예약 보기」
 * 원본: STAY ARI Manager `BuildingCalendar.jsx` → `cancelledBarLaneMap`
 *
 * ## 왜 필요한가
 *
 * 취소된 예약은 **같은 밤에 여러 건이 겹친다.** 한 손님이 취소하고 다른 손님이 잡았다가 또
 * 취소하면 그 밤에 취소 막대가 세 개다. 한 줄에 그리면 서로 덮어 **아무것도 못 읽는다.**
 *
 * 2026-09-28 실측(최근 90일): 취소가 걸린 방-밤 3,069칸 중 **622칸(20%)이 2건 이상**이고
 * 한 칸 최대 **5건**이다. 드문 일이 아니다.
 *
 * ## 규칙
 *
 * 방마다 따로 센다. 체크인 순으로 훑으며 **비어 있는 첫 층**에 놓는다 — 층이 모자라면
 * 새로 만든다. 같은 층에 놓으려면 앞 막대가 **끝나 있어야** 한다.
 *
 * ```txt
 *  층0  ▓▓▓▓ A ▓▓▓▓        ▓▓ C ▓▓
 *  층1        ▓▓▓▓ B ▓▓▓▓
 * ```
 *
 * **체크아웃 날 밤은 비어 있다.** `checkOut === 다음 checkIn` 이면 겹치지 않으므로 같은 층에
 * 놓는다 — 예약 막대가 그 칸 가운데에서 만나는 것과 같은 규칙이다.
 *
 * ## 순수하다
 *
 * DB·DOM 을 모른다. 층이 하나 어긋나면 막대가 겹치거나 빈 줄이 생기는데 눈으로는 「원래
 * 저런가」 싶어 그냥 넘어간다. 그래서 테스트로 고정한다(`ops-bar-lanes.test.ts`).
 */

export type LaneBar = {
  id: string;
  roomKey: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`. 이 날 밤은 비어 있다. */
  checkOut: string;
};

export type BarLaneResult = {
  /** 막대 id → 층 번호(0부터). */
  laneById: Map<string, number>;
  /** 방 → 그 방이 쓰는 층 수(최소 1). 트랙 높이를 정하는 값이다. */
  laneCountByRoom: Map<string, number>;
};

export function assignBarLanes(bars: readonly LaneBar[]): BarLaneResult {
  const byRoom = new Map<string, LaneBar[]>();
  for (const bar of bars) {
    const list = byRoom.get(bar.roomKey);
    if (list) list.push(bar);
    else byRoom.set(bar.roomKey, [bar]);
  }

  const laneById = new Map<string, number>();
  const laneCountByRoom = new Map<string, number>();

  for (const [roomKey, roomBars] of byRoom) {
    // 체크인 순. 같은 날 시작하면 **짧은 것을 먼저** 놓는다 — 긴 것이 먼저 0층을 차지하면
    // 짧은 것들이 전부 아래층으로 밀려 층이 불필요하게 늘어난다.
    const sorted = [...roomBars].sort(
      (a, b) => a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut),
    );
    /** 층별로 「지금까지 가장 늦은 체크아웃」. */
    const laneEnds: string[] = [];
    for (const bar of sorted) {
      let lane = laneEnds.findIndex((end) => end <= bar.checkIn);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(bar.checkOut);
      } else {
        laneEnds[lane] = bar.checkOut;
      }
      laneById.set(bar.id, lane);
    }
    laneCountByRoom.set(roomKey, Math.max(laneEnds.length, 1));
  }

  return { laneById, laneCountByRoom };
}

/**
 * 층이 밀린 막대를 **`+N` 하나로 접는다**.
 *
 * 저쪽은 겹치는 취소 막대를 전부 층으로 쌓아 그렸는데, 한 칸에 5건까지 쌓이면 트랙이
 * 세 배로 커지고 **줄이 늘어져 읽기가 더 힘들다**(2026-09-28 사용자 지적).
 *
 * 그래서 **0층만 그리고**, 가려진 막대가 있는 구간에는 `+N` 배지를 놓는다. 눌러야 내역이
 * 보이지만, 평소에는 격자가 조용하고 높이도 그대로다. 「몇 건이 더 있다」는 사실은 숫자로
 * 남으므로 **정보가 사라지지는 않는다.**
 *
 * ## 구간으로 묶는 이유
 *
 * 밤마다 배지를 찍으면 배지가 줄줄이 늘어서 그게 또 시끄럽다. **가려진 막대가 있는 밤이
 * 이어지면 한 구간**으로 묶어 배지 하나만 놓는다.
 *
 * `count` 는 그 구간에 걸친 **가려진 막대 수**다 — 「이 자리에 N건이 더 있다」는 뜻이라
 * 0층 막대는 세지 않는다.
 */
export type BarOverflowSegment = {
  roomKey: string;
  startDate: string;
  endDate: string;
  /** 가려진 막대 수. 배지에 `+{count}` 로 찍힌다. */
  count: number;
  /** 눌렀을 때 보여줄 막대 id — **0층 포함** 그 구간에 걸친 전부. */
  barIds: string[];
};

export function buildBarOverflowSegments(
  bars: readonly LaneBar[],
  lanes: BarLaneResult,
): BarOverflowSegment[] {
  const byRoom = new Map<string, LaneBar[]>();
  for (const bar of bars) {
    const list = byRoom.get(bar.roomKey);
    if (list) list.push(bar);
    else byRoom.set(bar.roomKey, [bar]);
  }

  const segments: BarOverflowSegment[] = [];
  for (const roomKey of [...byRoom.keys()].sort()) {
    const roomBars = byRoom.get(roomKey) ?? [];
    const hidden = roomBars.filter((bar) => (lanes.laneById.get(bar.id) ?? 0) > 0);
    if (hidden.length === 0) continue;

    // 가려진 막대가 덮는 밤 전부. 문자열 날짜라 정렬이 곧 시간순이다.
    const nights = new Set<string>();
    for (const bar of hidden) for (const night of eachNight(bar.checkIn, bar.checkOut)) nights.add(night);
    const sorted = [...nights].sort();

    let start = sorted[0];
    let previous = sorted[0];
    const flush = () => {
      const overlapping = (candidate: LaneBar) =>
        candidate.checkIn <= previous && start < candidate.checkOut;
      segments.push({
        barIds: roomBars.filter(overlapping).map((bar) => bar.id),
        count: hidden.filter(overlapping).length,
        endDate: previous,
        roomKey,
        startDate: start,
      });
    };
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] === nextNight(previous)) {
        previous = sorted[index];
        continue;
      }
      flush();
      start = sorted[index];
      previous = sorted[index];
    }
    flush();
  }
  return segments;
}

/** 체크인~체크아웃 사이의 「밤」. **체크아웃 날 밤은 비어 있다.** */
function eachNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const cursor = new Date(`${checkIn}T12:00:00Z`);
  while (cursor.toISOString().slice(0, 10) < checkOut) {
    nights.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
}

function nextNight(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}
