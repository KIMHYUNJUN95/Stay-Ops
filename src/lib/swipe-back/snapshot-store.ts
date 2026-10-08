/**
 * 스와이프 뒤로가기의 「아래에 깔리는 이전 화면」 — 화면을 떠나는 순간의 DOM 복제본.
 *
 * 문서: docs/product/16-mobile-navigation.md 「뒤로가기 — 화면 스와이프」
 *
 * 네이티브 앱은 이전 화면이 메모리에 살아 있어 밀 때 아래에 그릴 수 있다. Next App Router 는 이동하면 이전 화면을
 * 없애므로, **떠나는 순간 화면의 DOM 을 복제해** 기록 번호별로 보관한다(Hotwire Native · Safari 가 떠날 때 화면을 찍어 두는
 * 것과 같은 자리). 이미지가 아니라 같은 DOM · 같은 CSS 라 해상도 · 글꼴이 그대로이고, 캡처 권한이나 네이티브 빌드가 필요 없다.
 *
 * **보이는 부분만 복제한다(2026-10-08 병목 점검).** 밀 때 보이는 것은 떠날 때의 한 화면뿐이다. 통째로 복제하면 긴 목록
 * (노드 9천 개)에서 복제 22ms · 스크롤 수집 40ms · 붙여 배치하기 145ms(CPU 4배 감속 기준)가 들어 드래그 첫 프레임이 끊겼다.
 * 그래서 위에서부터 내려가며 화면(± 여유) 밖에 있는 요소는 **같은 태그 · 같은 크기의 빈 칸**으로 바꾼다 — 자리와 스크롤
 * 높이는 그대로라 스크롤 위치를 되돌릴 수 있다. 블록 흐름에서 연달아 화면 밖인 형제는 칸 하나로 합친다.
 *
 * - 스크롤 위치는 복제되지 않으므로, 내려가는 길에 만난 스크롤 영역의 위치를 복제본 요소와 짝지어 둔다.
 * - `<iframe>`(2분할 칸)은 다시 불러오므로 빈 칸으로, `<canvas>` 는 그림을 옮겨 그린다, `<svg>` 는 통째로.
 * - 같은 번호의 다른 주소(대체 이동 · 기록이 갈라진 뒤)는 주소를 대조해 쓰지 않는다.
 * - 메모리 — 최근 `MAX_SNAPSHOTS` 개만 둔다.
 */

type ScrollMark = [element: HTMLElement, top: number, left: number];

export type ScreenSnapshot = {
  url: string;
  node: HTMLElement;
  scrolls: ScrollMark[];
};

const MAX_SNAPSHOTS = 5;
/** 화면 밖이라도 이 거리(px) 안이면 복제한다 — 경계에 걸친 줄의 그림자 · 테두리가 잘리지 않게. */
const MARGIN = 48;
const snapshots = new Map<number, ScreenSnapshot>();

type Viewport = { top: number; bottom: number; left: number; right: number };

function isOutside(rect: DOMRect, view: Viewport): boolean {
  if (rect.width === 0 && rect.height === 0) return false; // 크기 없는 것(절대 위치 자식을 품은 껍데기 등)은 따라 내려간다
  return rect.bottom < view.top || rect.top > view.bottom || rect.right < view.left || rect.left > view.right;
}

/** 화면 밖 요소 자리 — 같은 태그 · 클래스(여백 · 테두리 규칙 유지)에 크기만 고정하고 속은 비운다. */
function placeholderFor(element: Element, rect: DOMRect): Element {
  const shell = element.cloneNode(false) as Element;
  if (shell instanceof HTMLElement || shell instanceof SVGElement) {
    shell.removeAttribute("id");
    shell.style.cssText += `;box-sizing:border-box;width:${rect.width}px;height:${rect.height}px;min-height:${rect.height}px;max-height:${rect.height}px;overflow:hidden;`;
  }
  return shell;
}

/** 블록 흐름(세로로 쌓이는) 부모인가 — 그렇다면 화면 밖 형제들을 칸 하나로 합쳐도 자리가 같다. */
function isBlockFlow(parent: Element): boolean {
  const style = getComputedStyle(parent);
  if (style.display === "block" || style.display === "flow-root") return true;
  return style.display === "flex" && style.flexDirection === "column" && style.flexWrap === "nowrap";
}

function copyCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement) {
  try {
    target.getContext("2d")?.drawImage(source, 0, 0);
  } catch {
    // WebGL · 오염된 캔버스 — 빈 채로 둔다.
  }
}

/** `source` 의 보이는 부분만 복제한다. `scrolls` 에 스크롤 영역 위치를 모은다. */
function cloneVisible(source: Element, view: Viewport, scrolls: ScrollMark[]): Element {
  if (source instanceof SVGSVGElement) return source.cloneNode(true) as Element;
  if (source instanceof HTMLIFrameElement) {
    const blank = document.createElement("div");
    blank.className = source.className;
    return blank;
  }
  const copy = source.cloneNode(false) as Element;
  // 같은 id 가 둘이면 label · aria-labelledby · getElementById 가 엉킨다(svg 안의 그라데이션 id 는 그대로 — 그림이 깨진다).
  if (copy instanceof HTMLElement) copy.removeAttribute("id");
  if (source instanceof HTMLCanvasElement) {
    copyCanvas(source, copy as HTMLCanvasElement);
    return copy;
  }
  if (source instanceof HTMLElement && (source.scrollTop !== 0 || source.scrollLeft !== 0)) {
    scrolls.push([copy as HTMLElement, source.scrollTop, source.scrollLeft]);
  }

  const mergeable = source.childElementCount > 8 && isBlockFlow(source);
  // 연달아 화면 밖인 형제 묶음 — 첫 요소의 위 여백 · 끝 요소의 아래 여백을 칸에 옮겨야 여백 겹침까지 같은 자리가 된다.
  let run: { first: Element; firstRect: DOMRect; lastRect: DOMRect; last: Element } | null = null;
  const flush = () => {
    if (!run) return;
    const spacer = document.createElement("div");
    const marginTop = getComputedStyle(run.first).marginTop;
    const marginBottom = getComputedStyle(run.last).marginBottom;
    spacer.style.cssText = `height:${Math.max(0, run.lastRect.bottom - run.firstRect.top)}px;margin:${marginTop} 0 ${marginBottom};flex:none;`;
    copy.appendChild(spacer);
    run = null;
  };

  for (let child = source.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === Node.TEXT_NODE) {
      flush();
      copy.appendChild(child.cloneNode(false));
      continue;
    }
    if (!(child instanceof Element)) continue;
    const rect = child.getBoundingClientRect();
    if (isOutside(rect, view)) {
      // 흐름 순서대로 아래로 이어지는 형제만 묶는다(절대 위치 등 순서를 벗어난 것은 제 칸). 요소마다 getComputedStyle 을
      // 부르면 긴 목록에서 그것만으로 수백 ms 가 들어(2026-10-08 측정) 위치 비교로 대신한다.
      const inFlow = !run || rect.top >= run.lastRect.bottom - 1;
      if (mergeable && inFlow) {
        if (run) {
          run.last = child;
          run.lastRect = rect;
        } else {
          run = { first: child, firstRect: rect, last: child, lastRect: rect };
        }
      } else {
        flush();
        copy.appendChild(placeholderFor(child, rect));
      }
      continue;
    }
    flush();
    copy.appendChild(cloneVisible(child, view, scrolls));
  }
  flush();
  return copy;
}

function buildSnapshot(root: HTMLElement): Omit<ScreenSnapshot, "url"> | null {
  const startedAt = performance.now();
  try {
    const view: Viewport = {
      bottom: window.innerHeight + MARGIN,
      left: -MARGIN,
      right: window.innerWidth + MARGIN,
      top: -MARGIN,
    };
    const scrolls: ScrollMark[] = [];
    const node = cloneVisible(root, view, scrolls) as HTMLElement;
    return { node, scrolls };
  } catch {
    return null;
  } finally {
    // 성능 패널 · 실기기 원격 디버깅에서 비용을 바로 보이게.
    performance.measure?.("swipe-back:capture", { start: startedAt });
  }
}

/** 화면이 바뀐 뒤 한가할 때 다시 복제하기까지 기다리는 시간 · 최소 간격(ms) — 시계처럼 계속 바뀌는 화면이 CPU 를 잡아먹지 않게. */
const RECAPTURE_DELAY_MS = 250;
const RECAPTURE_MIN_INTERVAL_MS = 1500;

export type ScreenCapture = {
  /** 화면을 떠날 때 — 지금 복제본을 기록 번호 `index` 에 맡긴다(오래됐으면 그 자리에서 다시 복제). */
  commit: (index: number, url: string) => void;
  dispose: () => void;
};

/**
 * 화면 하나의 복제본을 **미리, 한가할 때** 만들어 둔다(2026-10-08 병목 점검).
 *
 * 떠나는 순간(이동 커밋 안)에 복제하면 DOM 이 반쯤 바뀐 상태라 화면 전체를 다시 배치하게 된다 — 긴 목록에서 복제 자체는
 * 27ms 인데 강제 배치가 155ms 를 더했다(CPU 4배 감속). 그래서:
 * - 화면이 뜬 뒤 · 스크롤이 멈춘 뒤 · 내용이 바뀐 뒤 한가할 때(requestIdleCallback) 복제해 둔다.
 * - 링크를 누르는 순간(클릭 capture — 아직 배치가 깨끗하다) 복제본이 오래됐으면 그때 복제한다.
 * - 떠날 때는 만들어 둔 것을 맡기기만 한다. 그래도 오래됐으면(버튼으로 이동 직전에 내용이 바뀐 경우) 그 자리에서 복제한다.
 */
export function trackScreen(root: HTMLElement): ScreenCapture {
  let latest: Omit<ScreenSnapshot, "url"> | null = null;
  let stale = true;
  let lastBuiltAt = 0;
  let timer = 0;
  let idleHandle = 0;
  const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 50));
  const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;

  function build() {
    window.clearTimeout(timer);
    timer = 0;
    if (idleHandle) cancelIdle(idleHandle);
    idleHandle = 0;
    latest = buildSnapshot(root);
    stale = latest === null;
    lastBuiltAt = performance.now();
  }

  function schedule() {
    if (timer || idleHandle) return;
    const wait = Math.max(RECAPTURE_DELAY_MS, RECAPTURE_MIN_INTERVAL_MS - (performance.now() - lastBuiltAt));
    timer = window.setTimeout(() => {
      timer = 0;
      idleHandle = idle(
        () => {
          idleHandle = 0;
          if (stale && root.isConnected) build();
        },
        { timeout: 1500 },
      );
    }, wait);
  }

  function markStale() {
    stale = true;
    schedule();
  }

  // 스와이프 엔진이 판 · 루트에 거는 인라인 스타일은 화면 내용이 바뀐 게 아니다.
  const isContentChange = (records: MutationRecord[]) =>
    records.some(
      (record) =>
        !(
          record.type === "attributes" &&
          record.attributeName === "style" &&
          (record.target === root || (record.target as Element).hasAttribute?.("data-swipe-surface"))
        ),
    );
  const observer = new MutationObserver((records) => {
    if (isContentChange(records)) markStale();
  });
  observer.observe(root, { attributes: true, characterData: true, childList: true, subtree: true });

  const onScroll = () => markStale();
  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  const onClick = (event: MouseEvent) => {
    if (!stale) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (anchor) build();
  };
  root.addEventListener("click", onClick, true);

  schedule();

  return {
    commit(index, url) {
      // 아직 전달 안 된 변경(같은 커밋 직전의 것)도 센다.
      if (isContentChange(observer.takeRecords())) stale = true;
      if (stale || !latest) build();
      if (!latest) {
        snapshots.delete(index);
        return;
      }
      snapshots.delete(index);
      snapshots.set(index, { ...latest, url });
      while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value as number);
    },
    dispose() {
      observer.disconnect();
      root.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      root.removeEventListener("click", onClick, true);
      window.clearTimeout(timer);
      if (idleHandle) cancelIdle(idleHandle);
    },
  };
}

/** 기록 번호 `index` 의 밑그림 — 주소가 다르면(그 번호에 다른 화면이 들어섰으면) 없다. */
export function getSnapshot(index: number, url: string): ScreenSnapshot | null {
  const snapshot = snapshots.get(index);
  return snapshot && snapshot.url === url ? snapshot : null;
}

/** 복제본을 붙인 뒤 스크롤 위치를 되돌린다(붙어 있어야 scrollTop 이 먹는다). */
export function restoreSnapshotScroll(snapshot: ScreenSnapshot): void {
  for (const [element, top, left] of snapshot.scrolls) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
}
