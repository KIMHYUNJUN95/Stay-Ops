/**
 * 룸 링크 — 순수 규칙(묶기 · 링크 검증). DB · 세션을 모른다 — 테스트로 고정한다(`room-links-model.test.ts`).
 *
 * 도메인 계약: docs/product/35-room-links.md
 *
 * ## 한 줄 = 유닛 하나 × 채널 하나, 화면은 캘린더 행으로 다시 묶는다
 *
 * 같은 물리 객실을 두 Airbnb 계정이 번갈아 판다(아라키초A `201` / `201_2`, 가부키초 `202#` / `K202`). 링크는 유닛에
 * 붙고(`room_listing_links.room_id`), 화면은 판매 캘린더와 **같은 행 키**(`opsUnitRoomKey`)로 묶어 한 카드에 보여 준다.
 */
import { opsUnitRoomKey, ROOM_AXIS_SEPARATOR } from "@/lib/ops-room-key";

export type RoomLinkChannel = "airbnb" | "booking";
export const ROOM_LINK_CHANNELS: readonly RoomLinkChannel[] = ["airbnb", "booking"];

/** 메모 최대 길이 — DB 체크 제약(`room_listing_links_memo_len`)과 같다. */
export const ROOM_LINK_MEMO_MAX = 200;

/** 최소숙박이 이 값 이상이면 「쉬는 계정」(Beds24 잠금) — `BEDS24_INACTIVE_MIN_STAY_THRESHOLD` 와 같은 규칙. */
const INACTIVE_MIN_STAY = 50;

export type RoomLinkRecord = {
  roomId: string;
  channel: RoomLinkChannel;
  listingId: string | null;
  hostUrl: string | null;
  guestUrl: string | null;
  memo: string | null;
  updatedAt: string | null;
};

export type RoomLinkUnitInput = {
  id: string;
  propertyName: string | null | undefined;
  roomLabel: string;
  status: string;
  externalMinimumStay: number | null;
};

export type RoomLinkUnit = {
  roomId: string;
  unitLabel: string;
  /**
   * 지금 이 계정으로 팔고 있나 — 최소숙박이 잠금(50+)이 아니면 판다. 한 행에 유닛이 둘 이상일 때만 화면이 쓴다
   * (번갈아 파는 계정 중 어느 쪽이 지금인지).
   */
  selling: boolean;
  links: Partial<Record<RoomLinkChannel, RoomLinkRecord>>;
};

export type RoomLinkRow = { key: string; label: string; units: RoomLinkUnit[] };
export type RoomLinkBuilding = { name: string; rows: RoomLinkRow[] };

/** 캘린더와 같은 객실 이름 순서(숫자 인식). */
function compareLabels(a: string, b: string) {
  return a.localeCompare(b, "ko", { numeric: true });
}

/**
 * 유닛 + 링크를 건물 → 행 → 유닛으로 묶는다.
 *
 * - 운영 종료(`status !== 'active'`) 유닛도 **링크가 있으면** 넣는다 — 번갈아 파는 쉬는 계정이 대개 이 상태다
 *   (오쿠보C `오쿠보 2-1`). 링크도 없고 운영도 안 하면 뺀다(쓰지 않는 ID — 다카다노바바 `401_2`).
 * - 행 키를 못 만드는 유닛(건물 이름 없음)은 뺀다.
 * - 건물 순서는 `buildingOrder`(캘린더 탭 순서)를 따르고, 목록에 없는 건물은 이름순으로 뒤에 붙인다.
 */
export function groupRoomLinks(args: {
  units: readonly RoomLinkUnitInput[];
  links: readonly RoomLinkRecord[];
  buildingOrder: readonly string[];
}): RoomLinkBuilding[] {
  const linksByRoom = new Map<string, Partial<Record<RoomLinkChannel, RoomLinkRecord>>>();
  for (const link of args.links) {
    const bucket = linksByRoom.get(link.roomId) ?? {};
    bucket[link.channel] = link;
    linksByRoom.set(link.roomId, bucket);
  }

  const rowsByBuilding = new Map<string, Map<string, RoomLinkRow>>();
  for (const unit of args.units) {
    const links = linksByRoom.get(unit.id) ?? {};
    const hasLink = Object.keys(links).length > 0;
    if (unit.status !== "active" && !hasLink) continue;
    const key = opsUnitRoomKey({ propertyName: unit.propertyName, roomLabel: unit.roomLabel });
    if (!key) continue;
    const separator = key.indexOf(ROOM_AXIS_SEPARATOR);
    const building = key.slice(0, separator);
    const label = key.slice(separator + ROOM_AXIS_SEPARATOR.length);
    const rows = rowsByBuilding.get(building) ?? new Map<string, RoomLinkRow>();
    const row = rows.get(key) ?? { key, label, units: [] };
    row.units.push({
      roomId: unit.id,
      selling:
        unit.status === "active" &&
        (unit.externalMinimumStay === null || unit.externalMinimumStay < INACTIVE_MIN_STAY),
      unitLabel: unit.roomLabel,
      links,
    });
    rows.set(key, row);
    rowsByBuilding.set(building, rows);
  }

  const orderIndex = new Map(args.buildingOrder.map((name, index) => [name, index]));
  return [...rowsByBuilding.entries()]
    .sort(([a], [b]) => {
      const ai = orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
      return ai !== bi ? ai - bi : a.localeCompare(b, "ko");
    })
    .map(([name, rows]) => ({
      name,
      rows: [...rows.values()]
        .sort((a, b) => compareLabels(a.label, b.label))
        .map((row) => ({ ...row, units: [...row.units].sort((a, b) => compareLabels(a.unitLabel, b.unitLabel)) })),
    }));
}

/**
 * 같은 리스팅 ID 가 **두 유닛 이상**에 붙어 있으면 그 ID 들. 저쪽 원본 데이터에 실제로 있었던 복사 실수
 * (가부키초 K202 · KK202 가 같은 ID)를 화면이 경고하는 근거다.
 */
export function findDuplicateListingIds(links: readonly RoomLinkRecord[]): Set<string> {
  const seen = new Map<string, Set<string>>();
  for (const link of links) {
    if (!link.listingId) continue;
    const key = `${link.channel}:${link.listingId}`;
    const rooms = seen.get(key) ?? new Set<string>();
    rooms.add(link.roomId);
    seen.set(key, rooms);
  }
  const duplicates = new Set<string>();
  for (const [key, rooms] of seen) {
    if (rooms.size > 1) duplicates.add(key.slice(key.indexOf(":") + 1));
  }
  return duplicates;
}

// ── 링크 입력 검증 ─────────────────────────────────────────────────────

/** 앞뒤 공백 제거 · 스킴 없으면 https 를 붙여 URL 로 읽는다. http(s) 가 아니면 null. */
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** 채널에 맞는 주소인가 — Airbnb 는 `airbnb.*`(나라별 도메인), Booking.com 은 `booking.com`. */
export function isChannelUrl(url: string, channel: RoomLinkChannel): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (channel === "airbnb") return /(^|\.)airbnb\.[a-z.]+$/.test(host) || host === "abnb.me" || host.endsWith(".abnb.me");
  return host === "booking.com" || host.endsWith(".booking.com");
}

/**
 * Airbnb 리스팅 ID 를 링크에서 읽는다 — 호스트 편집(`/hosting/listings/editor/<id>`), 공개 페이지(`/rooms/<id>`),
 * 옛 관리 화면(`/manage-your-space/<id>`). 짧은 손님용 링크(`/h/…`)에는 ID 가 없다.
 */
export function parseAirbnbListingId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /\/(?:hosting\/listings\/(?:editor\/)?|rooms\/(?:plus\/)?|manage-your-space\/)(\d{5,})/.exec(url);
  return match ? match[1] : null;
}

/** 리스팅 ID → Airbnb 호스트 편집 화면 주소(저쪽 데이터와 같은 형식). */
export function airbnbHostUrlFor(listingId: string): string {
  return `https://www.airbnb.co.kr/hosting/listings/editor/${listingId}/details/photo-tour`;
}

export type RoomLinkInputError = "host_invalid" | "guest_invalid" | "host_channel" | "guest_channel" | "memo_long";

/**
 * 편집 패널 입력을 저장할 값으로 바꾼다. 호스트 칸에 **리스팅 ID 숫자만** 넣어도 된다(Airbnb) — 편집 화면 주소를 만든다.
 * 셋 다 비면 `{ empty: true }` — 그 줄을 지운다는 뜻이다.
 */
export function parseRoomLinkInput(input: {
  channel: RoomLinkChannel;
  host: string;
  guest: string;
  memo: string;
}):
  | { ok: true; empty: true }
  | { ok: true; empty: false; listingId: string | null; hostUrl: string | null; guestUrl: string | null; memo: string | null }
  | { ok: false; error: RoomLinkInputError } {
  const memo = input.memo.trim() || null;
  if (memo && memo.length > ROOM_LINK_MEMO_MAX) return { error: "memo_long", ok: false };

  const hostRaw = input.host.trim();
  let hostUrl: string | null = null;
  let listingId: string | null = null;
  if (hostRaw) {
    if (input.channel === "airbnb" && /^\d{5,}$/.test(hostRaw)) {
      listingId = hostRaw;
      hostUrl = airbnbHostUrlFor(hostRaw);
    } else {
      hostUrl = normalizeLinkUrl(hostRaw);
      if (!hostUrl) return { error: "host_invalid", ok: false };
      if (!isChannelUrl(hostUrl, input.channel)) return { error: "host_channel", ok: false };
      listingId = input.channel === "airbnb" ? parseAirbnbListingId(hostUrl) : null;
    }
  }

  let guestUrl: string | null = null;
  if (input.guest.trim()) {
    guestUrl = normalizeLinkUrl(input.guest);
    if (!guestUrl) return { error: "guest_invalid", ok: false };
    if (!isChannelUrl(guestUrl, input.channel)) return { error: "guest_channel", ok: false };
    if (!listingId && input.channel === "airbnb") listingId = parseAirbnbListingId(guestUrl);
  }

  if (!hostUrl && !guestUrl && !memo) return { empty: true, ok: true };
  return { empty: false, guestUrl, hostUrl, listingId, memo, ok: true };
}
