import type { CalendarDateValues } from "@/lib/beds24/calendar-write-payload";

/**
 * 작업 합치기 — **순수 모듈**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「작업 큐」
 * 원본: STAY ARI Manager `functions/index.js` — `processPriceJob` 의 coalescing 전처리
 *
 * ## 왜 합치는가
 *
 * 가격을 여러 번 고치면 작업이 그만큼 쌓인다. 하나씩 돌리면 **같은 객실·날짜에 Beds24 를
 * 여러 번 부르고**, 크레딧은 계정 단위라 그만큼 예약 동기화가 굶는다. 게다가 중간 상태가
 * 채널에 잠깐씩 나간다 — 5만원으로 바꿨다가 6만원으로 바꾸면 5만원이 실제로 팔릴 수 있다.
 *
 * ## 나중 것이 이긴다 (last-write-wins)
 *
 * 같은 `(객실, 날짜)` 를 여럿이 건드리면 **만든 시각이 늦은 쪽**의 값을 쓴다. 항목 단위가
 * 아니라 **날짜 단위로 통째로** 덮는다 — 저쪽과 같다. 앞 작업이 가격을, 뒤 작업이
 * 최소숙박을 바꿨다면 뒤 작업의 의도가 「이 날짜는 최소숙박만 건드린다」이므로 그대로 둔다.
 */

export type PriceJobRoomUpdate = {
  externalRoomId: string;
  roomLabel: string | null;
  dates: Record<string, CalendarDateValues>;
};

export type MergeableJob = {
  id: string;
  createdAt: string;
  roomUpdates: PriceJobRoomUpdate[];
};

/**
 * 합칠 수 있는 작업인가.
 *
 * **같은 종류 · 같은 건물 · 2분 안**에 만들어진 것만 합친다. 시간 창이 없으면 아주 오래된
 * 작업까지 빨려 들어와, 사람이 「아까 그건 취소됐나?」 하고 볼 화면이 사라진다.
 */
export const COALESCE_WINDOW_MS = 2 * 60 * 1000;

export function isWithinCoalesceWindow(primaryCreatedAt: string, otherCreatedAt: string): boolean {
  const diff = Math.abs(new Date(primaryCreatedAt).getTime() - new Date(otherCreatedAt).getTime());
  return Number.isFinite(diff) && diff <= COALESCE_WINDOW_MS;
}

/**
 * 여러 작업의 `roomUpdates` 를 하나로 합친다.
 *
 * 입력 순서와 무관하게 **`createdAt` 오름차순**으로 정렬한 뒤 덮는다 — 워커가 어떤 순서로
 * 집어 오든 결과가 같아야 한다.
 */
export function mergePriceJobRoomUpdates(jobs: MergeableJob[]): PriceJobRoomUpdate[] {
  const ordered = [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const datesByRoom = new Map<string, Map<string, CalendarDateValues>>();
  const labelByRoom = new Map<string, string | null>();

  for (const job of ordered) {
    for (const update of job.roomUpdates) {
      const roomId = String(update.externalRoomId);
      if (!roomId) continue;
      if (update.roomLabel) labelByRoom.set(roomId, update.roomLabel);
      else if (!labelByRoom.has(roomId)) labelByRoom.set(roomId, null);

      const dates = datesByRoom.get(roomId) ?? new Map<string, CalendarDateValues>();
      for (const [date, values] of Object.entries(update.dates ?? {})) {
        // 날짜 단위로 통째로 덮는다. 항목별로 섞으면 뒤 작업이 안 건드린 항목까지 살아난다.
        dates.set(date, values);
      }
      datesByRoom.set(roomId, dates);
    }
  }

  return [...datesByRoom].map(([externalRoomId, dates]) => ({
    dates: Object.fromEntries(dates),
    externalRoomId,
    roomLabel: labelByRoom.get(externalRoomId) ?? null,
  }));
}

/** 합친 뒤 Beds24 를 부를 객실 수. 진행률의 분모다. */
export function countTargetRooms(roomUpdates: PriceJobRoomUpdate[]): number {
  return new Set(roomUpdates.map((update) => update.externalRoomId)).size;
}
