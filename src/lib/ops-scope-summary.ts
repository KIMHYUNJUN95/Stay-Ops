/**
 * 패널 머리말에 뜨는 **무엇을 고쳤는가** — 「아라키초A 402 · 501 / 오쿠보B 107 외 3 · 11/20 → 11/22」.
 *
 * 데스크톱 격자와 모바일 격자(2026-10-01)가 같은 문장을 써야 해서 여기로 뺐다. 숫자만 보여주면(「9칸」)
 * 정작 **어느 방 어느 날**인지 모른 채 적용하게 된다 — 가격은 채널로 그대로 나간다.
 *
 * - **건물별로 묶는다** — 「502 · 107」만으로는 어느 건물인지 모른다(2026-09-28 지적). 격자 순서를 따른다.
 * - 객실이 많으면 앞의 넷만 적고 나머지는 개수로 줄인다. 날짜는 처음과 끝만 쓴다.
 */
export type OpsScopeSummary = { rooms: string; dates: string };

export function buildOpsScopeSummary(args: {
  selection: ReadonlyArray<{ roomKey: string; date: string }>;
  /** 격자에 보이는 순서대로. */
  rooms: ReadonlyArray<{ key: string; propertyName: string; displayRoomLabel: string }>;
  /** `"외 {count}"`. */
  andMore: string;
  roomLimit?: number;
}): OpsScopeSummary | null {
  const { selection, rooms, andMore } = args;
  if (selection.length === 0) return null;
  const roomLimit = args.roomLimit ?? 4;
  const selectedKeys = new Set(selection.map((cell) => cell.roomKey));
  const byProperty = new Map<string, string[]>();
  for (const room of rooms) {
    if (!selectedKeys.has(room.key)) continue;
    const list = byProperty.get(room.propertyName);
    if (list) list.push(room.displayRoomLabel);
    else byProperty.set(room.propertyName, [room.displayRoomLabel]);
  }
  let shownCount = 0;
  const parts: string[] = [];
  for (const [property, labels] of byProperty) {
    if (shownCount >= roomLimit) break;
    const take = labels.slice(0, roomLimit - shownCount);
    shownCount += take.length;
    parts.push(`${property} ${take.join(" · ")}`);
  }
  const totalRooms = selectedKeys.size;
  const roomText =
    totalRooms > shownCount
      ? `${parts.join(" / ")} ${andMore.replace("{count}", String(totalRooms - shownCount))}`
      : parts.join(" / ");
  const selectedDates = [...new Set(selection.map((cell) => cell.date))].sort();
  const short = (date: string) => date.slice(5).replace("-", "/");
  const first = selectedDates[0];
  const last = selectedDates[selectedDates.length - 1];
  return {
    dates: first === last ? short(first) : `${short(first)} → ${short(last)}`,
    rooms: roomText,
  };
}
