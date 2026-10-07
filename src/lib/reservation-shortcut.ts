/**
 * 예약 바로가기 — Slack 알림 등 **앱 밖에서 건네는 예약 링크**(`/go/reservation/<id>`)가 어디로 가는가.
 *
 * 도메인 계약: docs/product/36-automation-control.md → 「예약 바로가기 링크」
 *
 * 링크는 채널 사람 누구나 누를 수 있다. 그래서 판매 캘린더 주소를 직접 주지 않고 이 문을 거친다:
 * - 로그인 안 됨 → 로그인 뒤 다시 이 링크로.
 * - 판매 캘린더 권한(`ops_admin.access` + 관리자 웹 역할) 있음 → 기기에 맞는 판매 캘린더에서 그 예약을 연다
 *   (폰 = `/mobile/ops/calendar`, 그 외 = `/admin/ops/calendar`, 둘 다 `?resv=` 를 받는다).
 * - 권한 없음 → **「권한이 없어요」 화면**. 운영 관리자 화면들은 권한이 없으면 말없이 홈으로 보내지만(32번 「진입점」),
 *   링크를 눌러 온 사람은 무엇을 열려 했는지 알고 있으므로 이유를 보여 준다(2026-10-07 사용자 요구).
 *
 * **순수하다** — 판단만 하고 리다이렉트 · 화면은 `src/app/go/reservation/[id]/page.tsx` 가 한다.
 */

export function reservationShortcutPath(reservationId: string): string {
  return `/go/reservation/${encodeURIComponent(reservationId)}`;
}

const RESERVATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReservationShortcutId(value: string): boolean {
  return RESERVATION_ID.test(value);
}

export type ReservationShortcutInput = {
  reservationId: string;
  state: "unauthenticated" | "onboarding" | "ready";
  /** 판매 캘린더를 열 수 있는가 — `ops_admin.access` 그리고 관리자 웹 역할(쓰기 액션이 그 역할을 다시 본다). */
  canOpenCalendar: boolean;
  surface: "mobile" | "desktop" | "unknown";
};

export type ReservationShortcutResult =
  | { kind: "redirect"; path: string }
  | { kind: "denied" }
  | { kind: "invalid" };

export function resolveReservationShortcut(input: ReservationShortcutInput): ReservationShortcutResult {
  // 로그인부터 — 로그인 전에는 링크가 맞는지도, 누구인지도 알려 주지 않는다.
  const self = reservationShortcutPath(input.reservationId);
  if (input.state === "unauthenticated") {
    return { kind: "redirect", path: `/auth/login?next=${encodeURIComponent(self)}` };
  }
  if (input.state === "onboarding") {
    return { kind: "redirect", path: `/onboarding?next=${encodeURIComponent(self)}` };
  }
  if (!input.canOpenCalendar) return { kind: "denied" };
  if (!isReservationShortcutId(input.reservationId)) return { kind: "invalid" };
  const base = input.surface === "mobile" ? "/mobile/ops/calendar" : "/admin/ops/calendar";
  return { kind: "redirect", path: `${base}?resv=${encodeURIComponent(input.reservationId)}` };
}
