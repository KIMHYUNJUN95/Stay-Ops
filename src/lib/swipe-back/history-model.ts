/**
 * 스와이프 뒤로가기 — 순수 판정(단위 테스트: `src/lib/__tests__/swipe-back.test.ts`).
 * 문서: docs/product/16-mobile-navigation.md 「뒤로가기 — 화면 스와이프」
 */

export type BackTarget = {
  /** `history.go()` 에 넘길 음수. 같은 화면 쿼리 기록을 건너뛰면 -2 이하가 된다. */
  delta: number;
  index: number;
  url: string;
};

function pathOf(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * 지금 기록(`index`)보다 앞에 있는, **pathname 이 다른** 가장 가까운 기록.
 * 주소를 모르는 칸(null — 표가 끊긴 곳)을 만나면 거기서 멈춘다(어디로 갈지 모르면 가지 않는다).
 */
export function findBackTarget(urls: readonly (string | null)[], index: number): BackTarget | null {
  const current = urls[index];
  if (!current) return null;
  const here = pathOf(current);
  for (let i = index - 1; i >= 0; i -= 1) {
    const url = urls[i];
    if (!url) return null;
    if (pathOf(url) !== here) return { delta: i - index, index: i, url };
  }
  return null;
}

/**
 * 스와이프를 받는 화면인가 — 메뉴(탭 · 사이드 메뉴)의 첫 화면은 「뒤」가 없다(네이티브 탭 앱과 같다). 그 아래 화면만 받는다.
 * `/mobile/notifications` 처럼 메뉴가 아닌 곳에서 여는 화면은 받는다.
 */
export function isSwipeBackScreen(pathname: string, rootPaths: ReadonlySet<string>): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (!path.startsWith("/mobile")) return false;
  return !rootPaths.has(path);
}

/** 방향 잠금 — 손가락이 이만큼(px) 움직이기 전에는 가로 · 세로를 정하지 않는다. */
export const LOCK_DISTANCE = 10;

/**
 * 첫 움직임으로 제스처를 정한다. 오른쪽으로, 세로보다 충분히 가로(약 40° 이내)일 때만 뒤로가기다.
 * 아직 덜 움직였으면 "pending", 세로 · 왼쪽이면 "reject"(이 터치는 끝까지 스크롤 · 다른 제스처 몫).
 */
export function decideLock(dx: number, dy: number): "pending" | "accept" | "reject" {
  if (Math.hypot(dx, dy) < LOCK_DISTANCE) return "pending";
  return dx > 0 && dx > Math.abs(dy) * 1.2 ? "accept" : "reject";
}

/**
 * 손을 뗐을 때 뒤로 갈지. 화면 폭의 35% 를 넘겼거나, 오른쪽으로 빠르게 튕겼으면 간다(짧게 휙 쳐도 간다 — iOS 와 같다).
 * 마지막에 왼쪽으로 되돌리고 있었으면 가지 않는다. `velocity` 는 px/ms(오른쪽 +).
 */
export function decideCommit(offset: number, velocity: number, width: number): boolean {
  if (velocity < -0.15) return false;
  if (offset > width * 0.35) return true;
  return velocity > 0.35 && offset > 16;
}

/** 놓은 뒤 남은 거리를 마저 가는 시간(ms) — 튕긴 속도를 이어받되 너무 빠르거나 늘어지지 않게. */
export function settleDuration(remaining: number, velocity: number): number {
  const speed = Math.max(Math.abs(velocity), 1.1);
  return Math.round(Math.min(320, Math.max(140, Math.abs(remaining) / speed)));
}
