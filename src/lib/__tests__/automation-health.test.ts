import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { HEALTH_WEBHOOK_SILENT_MS, silenceAlert, type HealthAlert } from "@/lib/automation/health";
import { buildFailureAlertText, buildHealthAlertText } from "@/lib/automation/messages";
import { dictionaries } from "@/lib/i18n";

/**
 * 시스템 경보 — 문제일 때만, 같은 문제는 한 번(12시간마다 다시).
 * 도메인 계약: docs/product/36-automation-control.md → 「시스템 경보」
 */
describe("시스템 경보", () => {
  const last = "2026-10-08T05:38:39Z"; // 14:38 도쿄

  it("웹훅 — 4시간 전에는 조용하고, 넘으면 경보 · 같은 끊김은 같은 키 · 12시간마다 새 키", () => {
    const at = (hours: number) => new Date(Date.parse(last) + hours * 3_600_000);
    expect(silenceAlert("webhook_silent", last, at(3.9), HEALTH_WEBHOOK_SILENT_MS)).toBeNull();
    const first = silenceAlert("webhook_silent", last, at(4.5), HEALTH_WEBHOOK_SILENT_MS);
    const later = silenceAlert("webhook_silent", last, at(9), HEALTH_WEBHOOK_SILENT_MS);
    const reminder = silenceAlert("webhook_silent", last, at(13), HEALTH_WEBHOOK_SILENT_MS);
    expect(first?.hours).toBe(4);
    expect(later?.key).toBe(first?.key);
    expect(reminder?.key).not.toBe(first?.key);
    expect(silenceAlert("webhook_silent", null, at(30), HEALTH_WEBHOOK_SILENT_MS)).toBeNull();
  });

  it("문장 — 제목 + 할 일, 빈 줄(오류 메시지 없음)은 뺀다 (ko · ja)", () => {
    const alert: HealthAlert = { at: "2026-10-08T06:00:00Z", error: "", failedRooms: 2, key: "k", kind: "price_failed", requestedBy: "김현준" };
    const ko = buildHealthAlertText(dictionaries.ko.automationMessages, alert, "2026-10-08");
    expect(ko.split("\n")).toEqual([
      "🚨 *가격 반영이 Beds24 에 안 됨*",
      "10/8(목) 15:00 · 요청 김현준 · 실패 객실 2개",
      "판매 캘린더 이력에서 확인하고 다시 반영해 주세요.",
    ]);
    const ja = buildHealthAlertText(
      dictionaries.ja.automationMessages,
      { hours: 5, key: "k", kind: "webhook_silent", lastAt: last },
      "2026-10-08",
    );
    expect(ja.split("\n")[0]).toBe("🚨 *Beds24 Webhook が 5時間届いていません*");
    expect(ja).toContain("最終受信 10/8(木) 14:38");
  });

  // 2026-10-08 — 자동화 실패도 기술 키(job=…) 대신 무엇이 안 됐고 무엇을 하면 되는지.
  it("자동화 실패 문장 — 발송 실패 · 데이터 경고 · 시험 메시지 제목", () => {
    const copy = dictionaries.ko.automationMessages;
    expect(buildFailureAlertText(copy, { date: "2026-10-09", failed: 1, jobKey: "cleaning_list", kind: "send_failed", sent: 0 }, "2026-10-09").split("\n")).toEqual([
      "🚨 *청소 · 셋팅 명단 발송 실패*",
      "대상 10/9(금) · 보냄 0곳 · 실패 1곳",
      "Slack 웹훅이 살아 있는지, 관제실 실행 기록의 실패 사유를 확인해 주세요. 정시 발송은 마감까지 다시 시도합니다.",
    ]);
    const issue = buildFailureAlertText(copy, { date: "2026-10-09", issues: [{ bookingId: "94292271", code: "AA302" }], kind: "data_issue" }, "2026-10-09");
    expect(issue).toContain("🚨 *청소 명단 — 정보가 빠진 예약 1건*");
    expect(issue).toContain("AA302(94292271)");
    expect(issue).not.toContain("job=");
    expect(copy.failure.title).toBe("🚨 *{title}*");
  });
});
