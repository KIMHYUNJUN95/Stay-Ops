import { describe, expect, it } from "vitest";
import {
  findDuplicateListingIds,
  groupRoomLinks,
  isChannelUrl,
  pickSellingUnits,
  parseAirbnbListingId,
  parseRoomLinkInput,
  type RoomLinkRecord,
} from "@/lib/room-links-model";

/**
 * 룸 링크 순수 규칙 (2026-10-02).
 *
 * 계약: `src/lib/room-links-model.ts` · docs/product/35-room-links.md
 */
const link = (roomId: string, listingId: string | null, guest: string | null = null): RoomLinkRecord => ({
  channel: "airbnb",
  guestUrl: guest,
  hostUrl: listingId ? `https://www.airbnb.co.kr/hosting/listings/editor/${listingId}/details/photo-tour` : null,
  listingId,
  memo: null,
  roomId,
  updatedAt: null,
});

describe("groupRoomLinks", () => {
  it("번갈아 파는 두 유닛을 캘린더와 같은 한 행으로 묶는다", () => {
    const buildings = groupRoomLinks({
      buildingOrder: ["아라키초A"],
      links: [link("u1", "31627968"), link("u2", "1475641369123867060")],
      units: [
        { externalMinimumStay: 50, id: "u1", propertyName: "Arakicho A", roomLabel: "201", status: "active" },
        { externalMinimumStay: 2, id: "u2", propertyName: "Arakicho A", roomLabel: "201_2", status: "active" },
      ],
    });
    expect(buildings).toHaveLength(1);
    expect(buildings[0].name).toBe("아라키초A");
    expect(buildings[0].rows).toHaveLength(1);
    expect(buildings[0].rows[0].label).toBe("201");
    expect(buildings[0].rows[0].units.map((u) => [u.unitLabel, u.selling])).toEqual([
      ["201", false],
      ["201_2", true],
    ]);
  });

  it("운영 종료 유닛은 링크가 있을 때만 남긴다", () => {
    const buildings = groupRoomLinks({
      buildingOrder: [],
      links: [link("c2", "1001187077644900557")],
      units: [
        { externalMinimumStay: null, id: "c2", propertyName: "Okubo_C (kr)", roomLabel: "오쿠보 2-1", status: "inactive" },
        { externalMinimumStay: null, id: "t4", propertyName: "Takadanobaba", roomLabel: "401_2", status: "inactive" },
      ],
    });
    expect(buildings.flatMap((b) => b.rows.flatMap((r) => r.units.map((u) => u.roomId)))).toEqual(["c2"]);
  });

  it("건물은 주어진 순서, 행은 숫자 순서", () => {
    const buildings = groupRoomLinks({
      buildingOrder: ["가부키초", "아라키초A"],
      links: [],
      units: [
        { externalMinimumStay: 2, id: "a", propertyName: "Arakicho A", roomLabel: "1001", status: "active" },
        { externalMinimumStay: 2, id: "b", propertyName: "Arakicho A", roomLabel: "201", status: "active" },
        { externalMinimumStay: 2, id: "c", propertyName: "Kabukicho", roomLabel: "K202", status: "active" },
      ],
    });
    expect(buildings.map((b) => b.name)).toEqual(["가부키초", "아라키초A"]);
    expect(buildings[1].rows.map((r) => r.label)).toEqual(["201", "1001"]);
  });
});

describe("pickSellingUnits", () => {
  const unit = (id: string, activeNights: number | null, externalMinimumStay = 2, status = "active") => ({
    activeNights,
    externalMinimumStay,
    id,
    propertyName: "Arakicho A",
    roomLabel: id,
    status,
  });

  it("계정이 겹쳐 열린 기간엔 앞으로 더 오래 파는 계정만 판매 중(10/2: 201 은 10/4 까지 · 201_2 는 계속)", () => {
    expect([...pickSellingUnits([unit("201", 3), unit("201_2", 30)])]).toEqual(["201_2"]);
  });

  it("오늘 닫혀 있어도 곧 열려 더 오래 팔면 그쪽이 판매 중", () => {
    expect([...pickSellingUnits([unit("201", 2), unit("201_2", 28)])]).toEqual(["201_2"]);
  });

  it("같이 계속 팔면 둘 다, 둘 다 잠겨 있으면 없음", () => {
    expect([...pickSellingUnits([unit("a", 30), unit("b", 30)])].sort()).toEqual(["a", "b"]);
    expect(pickSellingUnits([unit("a", 0), unit("b", 0)]).size).toBe(0);
  });

  it("요금 칸이 없으면 객실 표 최소숙박으로, 운영 종료 유닛은 판매 중이 아니다", () => {
    expect([...pickSellingUnits([unit("a", null, 99), unit("b", null, 2)])]).toEqual(["b"]);
    expect([...pickSellingUnits([unit("a", 30, 2, "inactive"), unit("b", 10)])]).toEqual(["b"]);
  });
});

describe("Booking.com — 건물 단위 링크 입력", () => {
  it("엑스트라넷 주소에서 숙소 ID 를 읽고 세션 값(ses)을 버린다", () => {
    expect(
      parseRoomLinkInput({
        channel: "booking",
        guest: "",
        host: "https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/home.html?ses=abc123&lang=ko&hotel_id=5653523&f_gc_header=0",
        memo: "",
      }),
    ).toEqual({
      empty: false,
      guestUrl: null,
      hostUrl: "https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/home.html?hotel_id=5653523",
      listingId: "5653523",
      memo: null,
      ok: true,
    });
  });

  it("숙소 ID 숫자만 넣어도 엑스트라넷 주소를 만든다", () => {
    const parsed = parseRoomLinkInput({ channel: "booking", guest: "", host: "6100941", memo: "" });
    expect(parsed).toMatchObject({ hostUrl: expect.stringContaining("hotel_id=6100941"), listingId: "6100941" });
  });

  it("손님용 페이지에서 추적 · 세션 값과 언어 꼬리를 뗀다", () => {
    const parsed = parseRoomLinkInput({
      channel: "booking",
      guest: "https://www.booking.com/hotel/jp/okubo4.ko.html?label=mkt123sc-x&sid=deadbeef&dist=0",
      host: "",
      memo: "",
    });
    expect(parsed).toMatchObject({ guestUrl: "https://www.booking.com/hotel/jp/okubo4.html" });
  });
});

describe("findDuplicateListingIds", () => {
  it("같은 리스팅 ID 가 두 유닛에 붙으면 잡는다(가부키초 K202 · KK202 복사 실수)", () => {
    expect([...findDuplicateListingIds([link("a", "1004589512654505656"), link("b", "1004589512654505656"), link("c", "1")])]).toEqual([
      "1004589512654505656",
    ]);
  });
});

describe("링크 검증", () => {
  it("리스팅 ID 를 호스트 · 공개 링크에서 읽는다", () => {
    expect(parseAirbnbListingId("https://www.airbnb.co.kr/hosting/listings/editor/26860834/details/photo-tour")).toBe("26860834");
    expect(parseAirbnbListingId("https://www.airbnb.jp/rooms/1730319020821667608?x=1")).toBe("1730319020821667608");
    expect(parseAirbnbListingId("https://airbnb.co.kr/h/aco222")).toBeNull();
  });

  it("채널 도메인을 확인한다", () => {
    expect(isChannelUrl("https://airbnb.co.kr/h/abo1", "airbnb")).toBe(true);
    expect(isChannelUrl("https://www.airbnb.com/rooms/1", "airbnb")).toBe(true);
    expect(isChannelUrl("https://admin.booking.com/hotel/x", "booking")).toBe(true);
    expect(isChannelUrl("https://evil-airbnb.example.com/h/x", "airbnb")).toBe(false);
    expect(isChannelUrl("https://airbnb.co.kr/h/abo1", "booking")).toBe(false);
  });

  it("호스트 칸에 숫자만 넣으면 편집 화면 주소를 만든다", () => {
    const parsed = parseRoomLinkInput({ channel: "airbnb", guest: "airbnb.co.kr/h/abo1", host: "31627968", memo: "" });
    expect(parsed).toEqual({
      empty: false,
      guestUrl: "https://airbnb.co.kr/h/abo1",
      hostUrl: "https://www.airbnb.co.kr/hosting/listings/editor/31627968/details/photo-tour",
      listingId: "31627968",
      memo: null,
      ok: true,
    });
  });

  it("다른 채널 주소 · 깨진 주소 · 긴 메모는 거절, 전부 비면 지우기", () => {
    expect(parseRoomLinkInput({ channel: "airbnb", guest: "https://booking.com/x", host: "", memo: "" })).toEqual({ error: "guest_channel", ok: false });
    expect(parseRoomLinkInput({ channel: "booking", guest: "", host: "javascript:alert(1)", memo: "" })).toEqual({ error: "host_invalid", ok: false });
    expect(parseRoomLinkInput({ channel: "airbnb", guest: "", host: "", memo: "x".repeat(201) })).toEqual({ error: "memo_long", ok: false });
    expect(parseRoomLinkInput({ channel: "airbnb", guest: " ", host: "", memo: "" })).toEqual({ empty: true, ok: true });
  });
});
