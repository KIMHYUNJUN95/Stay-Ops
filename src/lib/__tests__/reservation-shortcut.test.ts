import { describe, expect, it } from "vitest";
import { reservationShortcutPath, resolveReservationShortcut } from "@/lib/reservation-shortcut";
import { isSurfaceNeutralPath } from "@/lib/surface-routing";

/**
 * 예약 바로가기(`/go/reservation/<id>`) — Slack 알림 링크를 누른 사람을 어디로 보내나.
 * 도메인 계약: docs/product/36-automation-control.md → 「예약 바로가기 링크」
 */

const ID = "0b7c1f7e-9a51-4d1c-8a51-2f6f3f1e2d10";
const base = { canOpenCalendar: true, reservationId: ID, state: "ready" as const, surface: "desktop" as const };

describe("예약 바로가기", () => {
  it("권한 있으면 PC 는 대시보드 판매 캘린더, 폰은 모바일 판매 캘린더에서 그 예약을 연다", () => {
    expect(resolveReservationShortcut(base)).toEqual({ kind: "redirect", path: `/admin/ops/calendar?resv=${ID}` });
    expect(resolveReservationShortcut({ ...base, surface: "unknown" })).toEqual({ kind: "redirect", path: `/admin/ops/calendar?resv=${ID}` });
    expect(resolveReservationShortcut({ ...base, surface: "mobile" })).toEqual({ kind: "redirect", path: `/mobile/ops/calendar?resv=${ID}` });
  });

  it("권한이 없으면 말없이 보내지 않고 「권한 없음」", () => {
    expect(resolveReservationShortcut({ ...base, canOpenCalendar: false })).toEqual({ kind: "denied" });
  });

  it("로그인 전이면 로그인 뒤 이 링크로 돌아온다 — 잘못된 링크여도 로그인부터", () => {
    const path = reservationShortcutPath(ID);
    expect(resolveReservationShortcut({ ...base, state: "unauthenticated" })).toEqual({
      kind: "redirect",
      path: `/auth/login?next=${encodeURIComponent(path)}`,
    });
    expect(resolveReservationShortcut({ ...base, reservationId: "x", state: "unauthenticated" }).kind).toBe("redirect");
    expect(resolveReservationShortcut({ ...base, state: "onboarding" })).toEqual({
      kind: "redirect",
      path: `/onboarding?next=${encodeURIComponent(path)}`,
    });
  });

  it("예약 id 가 아니면 「올바른 링크가 아니에요」", () => {
    expect(resolveReservationShortcut({ ...base, reservationId: "93557561" })).toEqual({ kind: "invalid" });
  });

  it("로그인 화면이 폰에서도 바로가기 next 를 /mobile 로 덮지 않는다", () => {
    expect(isSurfaceNeutralPath(reservationShortcutPath(ID))).toBe(true);
    expect(isSurfaceNeutralPath("/admin/ops/calendar")).toBe(false);
  });
});
