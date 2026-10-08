/**
 * 앱 안 이동 기록 추적 — 화면 스와이프 뒤로가기(2026-10-08)의 바탕.
 *
 * 문서: docs/product/16-mobile-navigation.md 「뒤로가기 — 화면 스와이프」
 *
 * 브라우저 history 는 「지금이 몇 번째 기록인지」 · 「이전 기록의 주소가 무엇인지」를 알려 주지 않는다. 스와이프 뒤로가기는
 * 그 둘이 있어야 (1) 갈 곳이 있는지, (2) 손가락을 따라 밀 때 아래에 깔 이전 화면이 무엇인지 안다. 그래서
 * `pushState` · `replaceState` 를 감싸 **기록마다 번호(`__so`)를 state 에 붙이고**, 번호 → 주소 표를 sessionStorage 에 둔다.
 *
 * - Next App Router 는 매 렌더마다 자기 state(`__NA` · 트리)로 replaceState 한다. 우리 래퍼가 그때마다 번호를 다시 붙이므로
 *   번호가 지워지지 않는다. Next 의 popstate 처리는 `__NA` · 트리만 읽어 여분 키는 상관없다.
 * - Next 도 같은 두 함수를 감싼다(app-router 의 useEffect). 어느 쪽이 바깥이든 모든 호출이 우리 래퍼를 지난다.
 * - 뒤로 · 앞으로(popstate)는 state 의 번호로 방향을 정확히 안다 — 주소 비교로 추측하지 않는다.
 * - 새로고침해도 history.state 는 남으므로 번호가 이어진다.
 *
 * 순수 판정(`findBackTarget`)은 `history-model.ts` 에 있다(단위 테스트).
 */

import { findBackTarget, type BackTarget } from "./history-model";

type Traverse = { direction: "back" | "forward" | "none"; uaVisual: boolean; at: number };
type Listener = () => void;

type TrackerState = {
  index: number;
  urls: (string | null)[];
  lastTraverse: Traverse | null;
  listeners: Set<Listener>;
};

const STORAGE_KEY = "stayops:history-urls";
const STATE_KEY = "__so";
const GLOBAL_KEY = "__stayopsHistoryTracker";
/** 기록 표가 끝없이 자라지 않게 — 이보다 오래된 칸은 null(갈 수는 있지만 밑그림 · 주소를 모른다). */
const MAX_URLS = 200;

function currentPath(): string {
  return window.location.pathname + window.location.search;
}

function readIndex(state: unknown): number | null {
  const value = (state as Record<string, unknown> | null)?.[STATE_KEY];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function withIndex(data: unknown, index: number): unknown {
  // Next 는 객체만 넘긴다. 다른 값(문자열 등)은 건드리지 않는다 — 번호는 잃지만 동작은 그대로.
  if (data === null || data === undefined) return { [STATE_KEY]: index };
  if (typeof data !== "object") return data;
  return { ...(data as Record<string, unknown>), [STATE_KEY]: index };
}

function loadUrls(): (string | null)[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.map((v) => (typeof v === "string" ? v : null)) : [];
  } catch {
    return [];
  }
}

let saveTimer = 0;
function scheduleSave(tracker: TrackerState) {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tracker.urls));
    } catch {
      // 사생활 모드 · 저장소 막힘 — 새로고침 전까지는 메모리 표로 충분하다.
    }
  }, 120);
}

function emit(tracker: TrackerState) {
  scheduleSave(tracker);
  for (const listener of tracker.listeners) listener();
}

function setUrl(tracker: TrackerState, index: number, url: string) {
  tracker.urls[index] = url;
  // 앞쪽 오래된 칸은 비운다(배열 길이는 번호와 맞아야 하므로 자르지 않는다).
  const stale = index - MAX_URLS;
  if (stale >= 0) for (let i = 0; i <= stale && tracker.urls[i] !== null; i += 1) tracker.urls[i] = null;
}

function resolveUrl(url: string | URL | null | undefined): string {
  if (url === null || url === undefined) return currentPath();
  try {
    const parsed = new URL(String(url), window.location.href);
    return parsed.pathname + parsed.search;
  } catch {
    return currentPath();
  }
}

function install(): TrackerState {
  const urls = loadUrls();
  let index = readIndex(window.history.state);
  if (index === null) {
    // 이 문서의 첫 기록인데 번호가 없다 — 앱 밖에서 들어왔거나(새 탭 · 알림) 전체 새로 불러오기로 넘어왔다.
    // 같은 탭에서 앱 화면에서 넘어왔다면(로그인 리다이렉트 등) 그 뒤에 잇고, 아니면 0 부터.
    const sameOrigin = document.referrer.startsWith(window.location.origin);
    index = sameOrigin && urls.length > 0 ? urls.length : 0;
    if (index === 0) urls.length = 0;
  }
  const tracker: TrackerState = { index, urls, lastTraverse: null, listeners: new Set() };
  urls.length = Math.max(urls.length, index + 1);
  for (let i = 0; i < urls.length; i += 1) if (urls[i] === undefined) urls[i] = null;
  setUrl(tracker, index, currentPath());

  // 이 기록에 번호를 박아 둔다(Next 가 곧 replaceState 하지만, 그 전에 popstate 가 와도 방향을 알게).
  const realReplace = window.history.replaceState.bind(window.history);
  realReplace(withIndex(window.history.state, index), "");

  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;

  window.history.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    const next = tracker.index + 1;
    tracker.index = next;
    tracker.lastTraverse = null; // 새 이동이 시작됐다 — 그 전의 뒤로가기는 이제 이 화면의 이유가 아니다
    tracker.urls.length = next; // 앞으로 가기 기록은 버려진다(브라우저와 같다)
    setUrl(tracker, next, resolveUrl(url));
    originalPush.call(window.history, withIndex(data, next), unused, url);
    emit(tracker);
  };
  window.history.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    originalReplace.call(window.history, withIndex(data, tracker.index), unused, url);
    setUrl(tracker, tracker.index, resolveUrl(url));
    emit(tracker);
  };

  // capture 단계 — Next 의 popstate 처리(새 화면 그리기 시작)보다 먼저 방향을 기록한다.
  window.addEventListener(
    "popstate",
    (event: PopStateEvent) => {
      const index = readIndex(event.state);
      const uaVisual = Boolean((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition);
      let direction: Traverse["direction"] = "back";
      if (index !== null) {
        direction = index < tracker.index ? "back" : index > tracker.index ? "forward" : "none";
        tracker.index = index;
      } else {
        // 번호 없는 기록(다른 문서가 만든 것) — 표를 믿을 수 없으니 여기서 새로 시작한다.
        tracker.index = 0;
        tracker.urls.length = 0;
      }
      tracker.urls.length = Math.max(tracker.urls.length, tracker.index + 1);
      for (let i = 0; i < tracker.urls.length; i += 1) if (tracker.urls[i] === undefined) tracker.urls[i] = null;
      setUrl(tracker, tracker.index, currentPath());
      tracker.lastTraverse = { at: performance.now(), direction, uaVisual };
      emit(tracker);
    },
    true,
  );

  return tracker;
}

function tracker(): TrackerState | null {
  if (typeof window === "undefined") return null;
  const holder = window as unknown as Record<string, TrackerState | undefined>;
  // 개발 서버 HMR 로 모듈이 다시 평가돼도 한 번만 감싼다.
  holder[GLOBAL_KEY] ??= install();
  return holder[GLOBAL_KEY] ?? null;
}

/** 루트에서 한 번 — 이후 모든 이동이 기록된다. 서버에서는 아무것도 안 한다. */
export function installHistoryTracker(): void {
  tracker();
}

export function getHistoryIndex(): number {
  return tracker()?.index ?? 0;
}

export function getHistoryUrl(index: number): string | null {
  return tracker()?.urls[index] ?? null;
}

/**
 * 스와이프 뒤로가기가 갈 곳 — 지금 화면(pathname)과 **다른 화면**인 가장 가까운 이전 기록.
 * 같은 화면 안의 쿼리 이동(`?month=` 등)은 화면이 아니므로 건너뛴다. 없으면 null.
 */
export function getBackTarget(): BackTarget | null {
  const state = tracker();
  if (!state) return null;
  return findBackTarget(state.urls, state.index);
}

/** 마지막 뒤로 · 앞으로 이동(popstate)을 꺼내고 지운다(화면 전환이 한 번만 쓴다). `maxAgeMs` 보다 오래됐으면 null. */
export function consumeRecentTraverse(maxAgeMs: number): Traverse | null {
  const state = tracker();
  const last = state?.lastTraverse ?? null;
  if (state) state.lastTraverse = null;
  if (!last || performance.now() - last.at > maxAgeMs) return null;
  return last;
}

export function subscribeHistory(listener: Listener): () => void {
  const state = tracker();
  if (!state) return () => undefined;
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}
