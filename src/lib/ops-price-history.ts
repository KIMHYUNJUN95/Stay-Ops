/**
 * 칸별 가격 변경 이력 — **순수 모듈**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「이력을 남긴다」
 * 원본: STAY ARI Manager `priceHistoryByRoomDate`
 *
 * ## 왜 이력이 필요한가
 *
 * 이 값들은 **채널로 그대로 나간다.** 가격이 이상하면 제일 먼저 나오는 질문이 「누가 언제
 * 얼마에서 얼마로 바꿨나」다. 작업 큐에는 결과만 남고 **이전 값이 없어** 되돌릴 근거가 없다.
 */

/** 한 줄의 이력. DB 행을 화면이 쓰는 모양으로 줄인 것이다. */
export type PriceHistoryEntry = {
  /** `price1` | `min_stay` 등. */
  field: string;
  /** `null` 은 **값이 없었다**는 뜻이다. 0 이 아니다. */
  oldValue: number | null;
  newValue: number | null;
  /** ISO. */
  at: string;
  by: string | null;
  /** `amount` | `percent` | `min_stay`. */
  mode: string | null;
  percent: number | null;
};

export type PriceHistoryRow = PriceHistoryEntry & { roomLabel: string; stayDate: string };

/** 한 칸에 몇 줄까지 들고 있을지. 그 아래는 세기만 한다. */
export const HISTORY_PER_CELL = 5;

export function historyCellKey(roomLabel: string, stayDate: string): string {
  return `${roomLabel}|${stayDate}`;
}

export type CellHistory = {
  /** 최신순. 최대 `HISTORY_PER_CELL` 줄. */
  entries: PriceHistoryEntry[];
  /** 그 칸의 **전체** 변경 횟수. 잘린 줄이 있어도 몇 번 바뀌었는지는 알아야 한다. */
  total: number;
};

/**
 * 행 목록을 칸별로 모은다.
 *
 * 입력은 **최신순으로 정렬돼 있다고 가정하지 않는다** — 여기서 정렬한다. DB 정렬에 기대면
 * 쿼리를 손대는 날 조용히 순서가 뒤집힌다.
 */
export function buildHistoryByCell(rows: PriceHistoryRow[]): Map<string, CellHistory> {
  const byCell = new Map<string, CellHistory>();
  for (const row of rows) {
    const key = historyCellKey(row.roomLabel, row.stayDate);
    const bucket = byCell.get(key) ?? { entries: [], total: 0 };
    bucket.total += 1;
    bucket.entries.push(row);
    byCell.set(key, bucket);
  }
  for (const bucket of byCell.values()) {
    bucket.entries.sort((a, b) => b.at.localeCompare(a.at));
    bucket.entries = bucket.entries.slice(0, HISTORY_PER_CELL);
  }
  return byCell;
}

/** 한 줄을 사람이 읽는 문장으로. 문구는 부르는 쪽이 사전에서 넘긴다. */
export type HistoryCopy = {
  /** `"{from} → {to}"` */
  change: string;
  /** 값이 없던 칸. `"{to} 로 설정"` */
  set: string;
  /** 값을 지운 칸. `"{from} 삭제"` */
  cleared: string;
  minStay: string;
  percentSuffix: string;
  unknownUser: string;
};

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

/**
 * 「10/14 14:03 · 김현준 · ¥38,453 → ¥42,000 (+9%)」
 *
 * 시각은 **도쿄 기준**이다 — 운영 날짜가 전부 도쿄다(CLAUDE.md §7). 브라우저 로컬로 찍으면
 * 해외에서 열었을 때 하루가 어긋난다.
 */
export function describeHistoryEntry(entry: PriceHistoryEntry, copy: HistoryCopy): string {
  // **자리를 직접 맞춘다.** 로케일에 맡기면 `sv-SE` 는 `24/09`, `ko-KR` 은 또 다르게 내놓아
  // 같은 이력이 사람마다 다른 순서로 읽힌다. 시각 표기는 이력에서 정렬 기준이기도 하다.
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
  }).formatToParts(new Date(entry.at));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const when = `${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;

  const value = (raw: number | null) =>
    raw === null ? null : entry.field === "min_stay" ? copy.minStay.replace("{n}", String(raw)) : yen(raw);

  const from = value(entry.oldValue);
  const to = value(entry.newValue);
  const what =
    from === null && to !== null
      ? copy.set.replace("{to}", to)
      : to === null && from !== null
        ? copy.cleared.replace("{from}", from)
        : copy.change.replace("{from}", from ?? "—").replace("{to}", to ?? "—");

  const percent =
    entry.mode === "percent" && entry.percent !== null
      ? ` ${copy.percentSuffix.replace("{n}", entry.percent > 0 ? `+${entry.percent}` : String(entry.percent))}`
      : "";

  return `${when} · ${entry.by ?? copy.unknownUser} · ${what}${percent}`;
}

/** 칸에 붙일 여러 줄 설명. `title` 속성에 그대로 넣는다. */
export function describeCellHistory(history: CellHistory, copy: HistoryCopy & { more: string }): string {
  const lines = history.entries.map((entry) => describeHistoryEntry(entry, copy));
  const hidden = history.total - history.entries.length;
  if (hidden > 0) lines.push(copy.more.replace("{count}", String(hidden)));
  return lines.join("\n");
}
