import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AUTOMATION_BUILDING_ORDER, cleaningRoomCode } from "@/lib/automation/data";
import { defaultJobConfig, parseSettings } from "@/lib/automation/jobs";
import {
  alertPlatformLabel,
  automationBuildingLabel,
  buildCleaningListMessage,
  buildDailyReportMessage,
  buildReservationAlertMessage,
  cleaningStructureKey,
  computeDailyStats,
  dailySnapshotOf,
  isFreshCancellation,
  sameSnapshot,
  isSameDayBooking,
  type CleaningListModel,
} from "@/lib/automation/messages";
import { bookDateOf, cancelInstantOf, type AutomationReservation } from "@/lib/automation/reservation-fields";
import { computeNextWake, isScheduledSendDue, nextScheduledSend, tokyoClock } from "@/lib/automation/schedule";
import { dictionaries } from "@/lib/i18n";
import { CALENDAR_BUILDING_ORDER, getCanonicalPropertyName } from "@/lib/room-label-normalization";

/**
 * 자동화 — 저쪽(STAY ARI Manager `slackReports.js`) 규칙 재현과 시각 계산.
 * 도메인 계약: docs/product/36-automation-control.md
 */

const at = (iso: string) => new Date(iso);

describe("자동화 시각 (도쿄)", () => {
  const job = { ...defaultJobConfig("daily_report"), enabled: true, lastDoneOn: null };

  it("도쿄 시계 — UTC 21:30 은 도쿄 다음 날 06:30", () => {
    expect(tokyoClock(at("2026-10-05T21:30:00Z"))).toEqual({ date: "2026-10-06", minutes: 390, weekday: 2 });
  });

  it("발송 시각 전에는 보내지 않고, 06:30 ~ 09:00 사이에 보낸다", () => {
    expect(isScheduledSendDue(job, at("2026-10-05T21:29:00Z"))).toBe(false); // 06:29
    expect(isScheduledSendDue(job, at("2026-10-05T21:30:00Z"))).toBe(true); // 06:30
    expect(isScheduledSendDue(job, at("2026-10-06T00:00:00Z"))).toBe(true); // 09:00
    expect(isScheduledSendDue(job, at("2026-10-06T00:01:00Z"))).toBe(false); // 09:01
  });

  it("오늘 이미 끝냈으면 보내지 않는다 · 꺼져 있으면 보내지 않는다 · 요일이 빠지면 보내지 않는다", () => {
    expect(isScheduledSendDue({ ...job, lastDoneOn: "2026-10-06" }, at("2026-10-05T22:00:00Z"))).toBe(false);
    expect(isScheduledSendDue({ ...job, enabled: false }, at("2026-10-05T22:00:00Z"))).toBe(false);
    expect(isScheduledSendDue({ ...job, weekdays: [1, 3, 4, 5, 6, 7] }, at("2026-10-05T22:00:00Z"))).toBe(false); // 화요일 빠짐
  });

  it("다음 발송 — 오늘 끝났으면 내일 06:30, 창 전이면 오늘 06:30", () => {
    expect(nextScheduledSend(job, at("2026-10-05T20:00:00Z"))?.toISOString()).toBe("2026-10-05T21:30:00.000Z");
    expect(nextScheduledSend({ ...job, lastDoneOn: "2026-10-06" }, at("2026-10-05T22:00:00Z"))?.toISOString()).toBe(
      "2026-10-06T21:30:00.000Z",
    );
  });

  it("실패 직후엔 5분 뒤, 보낸 뒤 확인 창 안이면 10분 뒤", () => {
    const now = at("2026-10-05T22:00:00Z"); // 07:00
    expect(computeNextWake({ ...job, recheckUntil: null }, now, { retryAfterFailure: true })?.toISOString()).toBe(
      "2026-10-05T22:05:00.000Z",
    );
    expect(computeNextWake({ ...job, lastDoneOn: "2026-10-06", recheckUntil: "18:00" }, now)?.toISOString()).toBe(
      "2026-10-05T22:10:00.000Z",
    );
    expect(computeNextWake({ ...job, enabled: false, recheckUntil: null }, now)).toBeNull();
  });

  // 2026-10-07 디버깅 — 화면의 「확인 간격(분)」이 저장만 되고 10분 고정으로 돌던 것.
  it("확인 간격(분) 설정을 따른다", () => {
    const now = at("2026-10-05T22:00:00Z"); // 07:00
    expect(
      computeNextWake({ ...job, lastDoneOn: "2026-10-06", recheckEveryMinutes: 30, recheckUntil: "18:00" }, now)?.toISOString(),
    ).toBe("2026-10-05T22:30:00.000Z");
  });
});

function reservation(partial: Partial<AutomationReservation> & { raw: Record<string, unknown> }): AutomationReservation {
  return {
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    guestName: "Kim",
    id: Math.random().toString(36).slice(2),
    propertyName: "아라키초A",
    roomLabel: "201",
    status: "confirmed",
    updatedAt: "2026-10-05T10:00:00Z",
    ...partial,
  };
}

describe("예약 원본 필드 (저쪽 normalize)", () => {
  it("예약일은 bookingTime 의 도쿄 날짜", () => {
    expect(bookDateOf({ bookingTime: "2026-10-04T16:00:00Z" })).toBe("2026-10-05");
    expect(bookDateOf({ bookTime: "2026-10-05" })).toBe("2026-10-05");
    expect(bookDateOf({ invoiceItems: [{ invoiceDate: "2026-10-07" }, { invoiceDate: "2026-10-03" }] })).toBe("2026-10-03");
    expect(bookDateOf({})).toBeNull();
  });

  it("취소 시각이 없으면 취소된 예약만 마지막 수정 시각을 쓴다", () => {
    expect(cancelInstantOf({ modifiedTime: "2026-10-05T01:00:00Z" }, true)).toBe("2026-10-05T01:00:00Z");
    expect(cancelInstantOf({ modifiedTime: "2026-10-05T01:00:00Z" }, false)).toBeNull();
  });
});

describe("일일 운영 리포트", () => {
  const reportDate = "2026-10-05";
  const stats = () =>
    computeDailyStats({
      buildingOrder: CALENDAR_BUILDING_ORDER,
      canonicalProperty: getCanonicalPropertyName,
      channels: ["airbnb", "booking"],
      excludedProperties: [],
      reportDate,
      reservations: [
        reservation({ raw: { bookingTime: "2026-10-05T03:00:00Z", price: 50000, referer: "Airbnb", status: "confirmed" } }),
        reservation({ checkIn: "2026-11-02", propertyName: "가부키초", raw: { bookingTime: "2026-10-05T05:00:00Z", price: 30000, referer: "Booking.com", status: "new" } }),
        // 금액 0 → 제외
        reservation({ raw: { bookingTime: "2026-10-05T05:00:00Z", price: 0, referer: "Airbnb", status: "confirmed" } }),
        // 수기 예약 → 일일 리포트 채널이 아님
        reservation({ raw: { bookingTime: "2026-10-05T05:00:00Z", price: 9000, referer: "Direct", status: "confirmed" } }),
        // 이번 달이지만 어제가 아님 → 당월 누적에만
        reservation({ raw: { bookingTime: "2026-10-02T05:00:00Z", price: 20000, referer: "Airbnb", status: "confirmed" } }),
        // 어제 취소(도쿄) — UTC 로는 10/04
        reservation({ status: "cancelled", raw: { cancelTime: "2026-10-04T20:00:00Z", price: 0, referer: "Airbnb", status: "cancelled" } }),
        // 그제 취소 → 제외
        reservation({ status: "cancelled", raw: { cancelTime: "2026-10-03T20:00:00Z", referer: "Airbnb", status: "cancelled" } }),
      ],
    });

  it("신규 · 취소 · 매출 · 당월 누적을 저쪽 규칙대로 센다", () => {
    const result = stats();
    expect(dailySnapshotOf(result)).toEqual({ mtdNew: 3, revenue: 80000, totalCancel: 1, totalNew: 2 });
    expect(result.newByChannel).toEqual({ airbnb: 1, booking: 1 });
    expect(result.cancelByChannel).toEqual({ airbnb: 1, booking: 0 });
    // 건물 줄은 0건이어도 전부 나온다(저쪽처럼).
    expect(result.buildings.map((item) => item.propertyName)).toEqual([...CALENDAR_BUILDING_ORDER]);
  });

  // 2026-10-07 — 당월 누적만 바뀐 것으로는 재전송하지 않는다(이번 달 예약이 오늘 취소될 때마다 바뀌어 매일 나갔다).
  it("변동 재전송 기준 = 어제 신규 · 취소 · 매출, 당월 누적은 보지 않는다", () => {
    const base = { mtdNew: 100, revenue: 5000, totalCancel: 3, totalNew: 10 };
    expect(sameSnapshot(base, { ...base, mtdNew: 99 })).toBe(true);
    expect(sameSnapshot(base, { ...base, totalNew: 9 })).toBe(false);
    expect(sameSnapshot(base, { ...base, revenue: 4000 })).toBe(false);
  });

  it("메시지 — 한국어는 저쪽 형식, 영어는 영어로", () => {
    const ko = buildDailyReportMessage({ copy: dictionaries.ko.automationMessages, locale: "ko", propertyLabel: (n) => n, stats: stats() });
    expect(ko).toContain("일일 운영 리포트 · 2026-10-05");
    expect(ko).toContain("신규 예약 2건　취소 1건　매출 *¥80,000*");
    expect(ko).toContain("• 가부키초  ·  예약 1건 [11월 *1건*]  취소 0건  ·  *¥30,000*");
    const en = buildDailyReportMessage({ copy: dictionaries.en.automationMessages, locale: "en", propertyLabel: (n) => n, stats: stats() });
    expect(en).toContain("New 2　Cancelled 1　Revenue *¥80,000*");
    expect(en).toContain("By check-in month: Oct 2");
  });

  it("변동 재전송 — 직전 숫자와 다르면 변동 줄과 상세가 붙는다", () => {
    const text = buildDailyReportMessage({
      copy: dictionaries.ko.automationMessages,
      locale: "ko",
      previous: { mtdNew: 2, revenue: 50000, totalCancel: 1, totalNew: 1 },
      propertyLabel: (n) => n,
      stats: stats(),
    });
    expect(text).toContain("전번 대비 변동: 예약 +1 | 매출 *+¥30,000* | 당월누적 +1");
    expect(text).toContain("■ 변동 상세");
  });
});

describe("청소 · 셋팅 명단", () => {
  const model: CleaningListModel = {
    cleaning: [
      { code: "AA201", guestName: "Tanaka", kind: "turnover", pax: 2, propertyName: "아라키초A", roomKey: "아라키초A_201" },
      { code: "AA302", guestName: null, kind: "no_checkin", pax: 3, propertyName: "아라키초A", roomKey: "아라키초A_302" },
    ],
    setting: [{ code: "K802", guestName: "Garcia", kind: "setting", pax: 2, propertyName: "가부키초", roomKey: "가부키초_802" }],
    targetDate: "2026-10-06",
  };

  it("넣은 이름만 붙고, 없으면 아무것도 안 붙는다", () => {
    const text = buildCleaningListMessage({
      buildingOrder: CALENDAR_BUILDING_ORDER,
      copy: dictionaries.ko.automationMessages,
      model,
      names: new Map([["아라키초A_201", "김민지"]]),
      propertyLabel: (n) => n,
    });
    expect(text).toContain("*AA201* | Tanaka (2) | 김민지");
    expect(text).toContain("*AA302* | 체크인 X (3)\n");
    expect(text).not.toContain("미배정");
    expect(text).toContain("*셋팅해야 하는 객실*");
  });

  // 2026-10-07 — 「청소 방 직접 추가」 · 데이터 경고 · 정정본은 현장 일이 바뀔 때만.
  it("직접 더한 방은 청소 칸에 메모(없으면 「추가 청소」)로, 정보가 빠진 예약은 끝에 경고로", () => {
    const text = buildCleaningListMessage({
      buildingOrder: AUTOMATION_BUILDING_ORDER,
      copy: dictionaries.ko.automationMessages,
      model: {
        ...model,
        cleaning: [
          ...model.cleaning,
          { code: "203", guestName: null, kind: "extra", note: "연박 청소", pax: null, propertyName: "STAY ARI Apartment Hotel", roomKey: "STAY ARI Apartment Hotel_203" },
          { code: "205", guestName: null, kind: "extra", note: null, pax: null, propertyName: "STAY ARI Apartment Hotel", roomKey: "STAY ARI Apartment Hotel_205" },
        ],
        dataIssues: [{ bookingId: "94292271", code: "AA302" }],
      },
      names: new Map([["STAY ARI Apartment Hotel_203", "김민지"]]),
      propertyLabel: (n) => n,
    });
    expect(text).toContain("*203* | 연박 청소 | 김민지");
    expect(text).toContain("*205* | 추가 청소");
    expect(text.trim().split("\n").pop()).toBe("⚠️ 확인 필요: 정보가 빠진 예약 1건 — AA302(94292271)");
    expect(text.indexOf("*203*")).toBeLessThan(text.indexOf("셋팅해야 하는 객실"));
  });

  it("정정본 지문 — 게스트 이름만 바뀌면 같고, 인원 · 추가 방이 바뀌면 다르다", () => {
    const renamed = { ...model, cleaning: model.cleaning.map((room) => ({ ...room, guestName: room.guestName ? `${room.guestName}!` : null })) };
    expect(cleaningStructureKey(renamed)).toBe(cleaningStructureKey(model));
    const paxChanged = { ...model, setting: model.setting.map((room) => ({ ...room, pax: 5 })) };
    expect(cleaningStructureKey(paxChanged)).not.toBe(cleaningStructureKey(model));
    const withExtra = {
      ...model,
      cleaning: [...model.cleaning, { code: "203", guestName: null, kind: "extra" as const, note: null, pax: null, propertyName: "STAY ARI Apartment Hotel", roomKey: "x_203" }],
    };
    expect(cleaningStructureKey(withExtra)).not.toBe(cleaningStructureKey(model));
  });

  it("청소 명단 정정본 하루 상한 기본값은 8(묶어 보내므로 폭주 방지용)", () => {
    expect(defaultJobConfig("cleaning_list").settings.resend.maxPerDay).toBe(8);
    expect(defaultJobConfig("daily_report").settings.resend.maxPerDay).toBe(3);
  });

  it("정정본 판단 지문은 이름을 보지 않는다", () => {
    expect(cleaningStructureKey(model)).toBe(cleaningStructureKey({ ...model }));
    const changed = { ...model, setting: [] };
    expect(cleaningStructureKey(changed)).not.toBe(cleaningStructureKey(model));
  });
});

describe("취소 · 당일예약 알림", () => {
  it("당일예약 = 확정 · 예약일 = 입실일 = 오늘 · 금액 > 0", () => {
    const today = "2026-10-06";
    expect(isSameDayBooking(reservation({ checkIn: today, raw: { bookingTime: "2026-10-06T01:00:00Z", price: 1000, status: "new" } }), today)).toBe(true);
    expect(isSameDayBooking(reservation({ checkIn: today, raw: { bookingTime: "2026-10-05T01:00:00Z", price: 1000, status: "new" } }), today)).toBe(false);
    expect(isSameDayBooking(reservation({ checkIn: today, raw: { bookingTime: "2026-10-06T01:00:00Z", price: 0, status: "new" } }), today)).toBe(false);
  });

  it("켜기 전(또는 하루 넘게 지난) 취소는 보내지 않는다", () => {
    const row = reservation({ status: "cancelled", raw: { cancelTime: "2026-10-06T00:00:00Z" } });
    expect(isFreshCancellation(row, "2026-10-05T12:00:00Z")).toBe(true);
    expect(isFreshCancellation(row, "2026-10-06T01:00:00Z")).toBe(false);
  });

  it("취소 알림 — 제목은 「🔔 취소 1건」(「당일 취소」 아님) · 인원 · 바로가기", () => {
    const text = buildReservationAlertMessage({
      copy: dictionaries.ko.automationMessages,
      kind: "cancel",
      openUrl: "https://example.test/go/reservation/1",
      propertyLabel: "아라키초A",
      reservation: reservation({ status: "cancelled", raw: { bookId: "777", cancelTime: "2026-10-06T00:41:00Z", numAdult: 2, numChild: 1, price: 86400, referer: "Airbnb" } }),
      roomLabel: "302",
    });
    expect(text.split("\n")[0]).toBe("🔔 취소 1건");
    expect(text).toContain("인원: 성인 2명, 아동 1명 (총 3명)");
    expect(text).toContain("취소 시각: 2026-10-06 09:41 (JST)");
    expect(text).toContain("예약ID: 777");
    expect(text).toContain("StayOps 에서 열기: https://example.test/go/reservation/1");
  });

  // 2026-10-07 저쪽 메시지와 대조 후 사용자 결정 — 36번 「표시 형식」.
  it("금액은 0원도 *¥0*, 플랫폼 Booking.com 은 Booking", () => {
    const cancelled = buildReservationAlertMessage({
      copy: dictionaries.ko.automationMessages,
      kind: "cancel",
      openUrl: null,
      propertyLabel: "STAY ARI Apartment Hotel",
      reservation: reservation({ status: "cancelled", raw: { cancelTime: "2026-09-28T22:44:00Z", id: "93557561", price: 0, referer: "Booking.com" } }),
      roomLabel: "206",
    });
    expect(cancelled).toContain("금액: *¥0* | 예약ID: 93557561");
    expect(cancelled).toContain("플랫폼: Booking\n");
    expect(cancelled).not.toContain("StayOps 에서 열기");
    const sameDay = buildReservationAlertMessage({
      copy: dictionaries.ja.automationMessages,
      kind: "same_day",
      openUrl: null,
      propertyLabel: "STAY ARI Apartment Hotel",
      reservation: reservation({ raw: { id: "93804456", price: 23413, referer: "Booking.com" } }),
      roomLabel: "305",
    });
    expect(sameDay.split("\n")[0]).toBe("🔔 当日予約 1件");
    expect(sameDay).toContain("金額: *¥23,413*");
    expect(alertPlatformLabel("Airbnb")).toBe("Airbnb");
    expect(alertPlatformLabel("booking.com")).toBe("Booking");
  });
});

describe("메시지 표시 형식 — 저쪽 이름 · 순서 (2026-10-07)", () => {
  const plain = (name: string) => `plain:${name}`;

  it("청소 명단 제목은 「오쿠보A (B동)」, 일일 리포트는 「오쿠보A동」 · 「사노시」, 나머지는 건물 정보 이름", () => {
    const ko = dictionaries.ko.automationMessages;
    expect(automationBuildingLabel(ko, "cleaning", "오쿠보A", plain)).toBe("오쿠보A (B동)");
    expect(automationBuildingLabel(ko, "cleaning", "오쿠보B", plain)).toBe("오쿠보B (A동)");
    expect(automationBuildingLabel(ko, "cleaning", "오쿠보C", plain)).toBe("오쿠보C동");
    expect(automationBuildingLabel(ko, "daily", "오쿠보A", plain)).toBe("오쿠보A동");
    expect(automationBuildingLabel(ko, "daily", "사노", plain)).toBe("사노시");
    expect(automationBuildingLabel(ko, "cleaning", "사노", plain)).toBe("plain:사노");
    expect(automationBuildingLabel(ko, "daily", "아라키초A", plain)).toBe("plain:아라키초A");
    expect(automationBuildingLabel(dictionaries.ja.automationMessages, "cleaning", "오쿠보A", plain)).toBe("大久保A（B棟）");
  });

  it("건물 순서 = 저쪽 청소 명단 순서(다카다노바바 → 오쿠보 → 스테이아리), 사노 맨 끝", () => {
    expect([...AUTOMATION_BUILDING_ORDER]).toEqual([
      "아라키초A", "아라키초B", "가부키초", "다카다노바바", "오쿠보A", "오쿠보B", "오쿠보C", "STAY ARI Apartment Hotel", "사노",
    ]);
  });

  it("스테이아리 방은 숫자만(O · sky 접두어 없음), 다른 건물은 저쪽 코드", () => {
    expect(cleaningRoomCode("STAY ARI Apartment Hotel", "O107")).toBe("107");
    expect(cleaningRoomCode("아라키초A", "702")).toBe("AA702");
    expect(cleaningRoomCode("다카다노바바", "6F")).toBe("T6");
    expect(cleaningRoomCode("오쿠보A", "오쿠보A")).toBeNull();
  });

  it("정정본 머리말에 ↻ 아이콘", () => {
    const text = buildCleaningListMessage({
      buildingOrder: AUTOMATION_BUILDING_ORDER,
      copy: dictionaries.ko.automationMessages,
      correction: true,
      model: { cleaning: [], setting: [], targetDate: "2026-10-07" },
      names: new Map(),
      propertyLabel: (n) => n,
    });
    expect(text.split("\n")[0]).toBe(":arrows_counterclockwise: *청소/셋팅 명단 정정본*");
  });
});

describe("설정 · 다국어", () => {
  it("모르는 설정 값은 기본값으로", () => {
    expect(parseSettings({ channels: ["x"], resend: { maxPerDay: 99, until: "25:00" } })).toEqual({
      channels: ["airbnb", "booking"],
      excludedProperties: [],
      resend: { debounceMinutes: 10, enabled: true, maxPerDay: 20, until: "18:00" },
    });
  });

  it("자동화 문구는 ko · ja · en 모두 같은 키를 가진다(빠지면 영어로 새지 않게)", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    const en = keys({ a: dictionaries.en.automation, m: dictionaries.en.automationMessages }).sort();
    for (const locale of ["ko", "ja"] as const) {
      const local = keys({ a: dictionaries[locale].automation, m: dictionaries[locale].automationMessages }).sort();
      expect(local).toEqual(en);
      // 번역이 영어 그대로 남지 않았는지(대표 키).
      expect(dictionaries[locale].automation.title).not.toBe(dictionaries.en.automation.title);
      expect(dictionaries[locale].automationMessages.daily.title).not.toBe(dictionaries.en.automationMessages.daily.title);
    }
  });
});
