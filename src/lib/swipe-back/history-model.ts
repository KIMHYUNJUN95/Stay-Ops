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
 * 모바일 앱 화면인가(`/mobile` 과 그 아래 — 쿼리 · 해시가 붙어도 된다). 스와이프는 이런 화면에서만 받고, 돌아갈 곳도 이런 화면일
 * 때만 간다(로그인 · 온보딩 · 계정으로 밀려 나가지 않게).
 *
 * 메뉴 첫 화면(홈 · 청소 · 요청 …)도 받는다(2026-10-09 사용자 결정). 원래는 「뒤가 없는 화면」으로 막았는데, 사용자가 실제로
 * 머무는 화면 대부분이 메뉴 첫 화면이라 「안 되는 화면이 더 많다」가 됐고, Android 뒤로가기 버튼은 거기서도 이전 화면으로 가서
 * 기기마다 달랐다. 이제 돌아갈 곳(`findBackTarget`)이 있으면 어디서든 받는다 — 앱을 막 열어 이전 화면이 없을 때만 받지 않는다.
 */
export function isSwipeBackScreen(path: string): boolean {
  return path === "/mobile" || /^\/mobile[/?#]/.test(path);
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
