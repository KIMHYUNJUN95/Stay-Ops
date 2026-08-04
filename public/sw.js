/* StayOps service worker.
 *
 * Goals: (1) installable PWA (Android's install prompt needs a SW with a fetch handler),
 * (2) friendly offline page, (3) fast static assets, (4) **instant cold-launch** for the installed
 * app via a stale-while-revalidate app-shell cache for full-document navigations.
 *
 * Cold-launch strategy (2026-07-22): a full-document navigation (installed PWA open / hard refresh)
 * is served from the last cached copy INSTANTLY, then revalidated in the background. This trades a
 * brief moment of stale content for a screen that appears immediately instead of waiting on a full
 * server render. Two safeguards keep it honest for an auth'd ops app:
 *   - Only successful, same-origin, non-redirected HTML is cached. A redirect (e.g. logged-out →
 *     /auth/login) EVICTS the stale auth'd copy instead of being served as content.
 *   - After serving stale, clients are messaged so the page pulls fresh server data (router.refresh)
 *     — or hard-reloads if the revalidation redirected. So the user sees content instantly AND it
 *     self-corrects to fresh within a moment. Client-side (RSC) navigations inside the running app
 *     are NOT touched by this handler, so in-app data stays live as before.
 * Bump the cache names to invalidate old caches on deploy. */
const STATIC_CACHE = "stayops-static-v2";
const NAV_CACHE = "stayops-nav-v2";
const OFFLINE_URL = "/offline";
// 오프라인 화면이 쓰는 앱 아이콘. 네트워크 없이 뜨는 화면이라 **함께 프리캐시해야** 한다 —
// 런타임 캐시에만 기대면 한 번도 받은 적 없는 기기에서 깨진 이미지가 뜬다(2026-08-04).
const OFFLINE_ICON = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, OFFLINE_ICON]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, NAV_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// A full-document navigation we may cache for instant cold-launch. Auth flows and API/action
// endpoints must always hit the network (never serve a stale auth'd shell for them, and never
// cache a login/redirect as if it were app content).
function isCacheableNavigation(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p.startsWith("/auth") || p.startsWith("/onboarding") || p.startsWith("/api")) return false;
  return true;
}

async function offlineFallback() {
  const cache = await caches.open(STATIC_CACHE);
  return (await cache.match(OFFLINE_URL)) || Response.error();
}

/** 캐시 사본이 "방금 담은 것"으로 볼 수 있는 시간. 이 안쪽이면 새로고침 신호를 보내지 않는다. */
const NAV_FRESH_MS = 30_000;

/** 담은 시각을 헤더에 실어 저장한다(Response 에는 저장 시각이 남지 않는다). */
async function putNavCached(cache, req, res) {
  const body = await res.clone().blob();
  const headers = new Headers(res.headers);
  headers.set("x-so-cached-at", String(Date.now()));
  await cache.put(req, new Response(body, { status: res.status, statusText: res.statusText, headers }));
}

/** 헤더가 없는 예전 사본은 `0` 이라 항상 stale 로 취급된다 — 안전한 쪽으로 기운다. */
function isRecentlyCached(res) {
  const at = Number(res.headers.get("x-so-cached-at") || 0);
  return at > 0 && Date.now() - at < NAV_FRESH_MS;
}

async function notifyNavRevalidated(res, requestedUrl) {
  const wins = await self.clients.matchAll({ type: "window" });
  // 리다이렉트/에러면 우리가 내준 캐시 사본이 더 이상 유효하지 않다는 뜻이라(로그아웃 등) 하드
  // 리로드를 시킨다. 그 외에는 조용히 서버 데이터만 다시 당긴다.
  //
  // **단, 최종 URL 이 요청한 URL 과 같으면 리다이렉트로 치지 않는다**(2026-08-04). 미들웨어가 세션
  // 쿠키를 갱신하며 같은 주소로 307 을 내보내는 경우가 있는데, 그걸 "다른 곳으로 가야 한다"로
  // 읽어서 `window.location.reload()` 를 걸었다 — 화면이 한 번 더 깜빡이는 원인이었다.
  const movedElsewhere = !!res && res.redirected && res.url && res.url !== requestedUrl;
  const redirected = !res || !res.ok || movedElsewhere;
  const message = { type: redirected ? "sw-nav-redirected" : "sw-nav-fresh" };
  for (const win of wins) win.postMessage(message);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Full-document navigations: stale-while-revalidate for cacheable app routes, network-first
  // (with offline fallback) otherwise.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const url = new URL(req.url);

        if (!isCacheableNavigation(url)) {
          try {
            return await fetch(req);
          } catch {
            return offlineFallback();
          }
        }

        const navCache = await caches.open(NAV_CACHE);
        const cached = await navCache.match(req);

        const revalidate = fetch(req)
          .then(async (res) => {
            if (res.ok && !res.redirected && res.type === "basic") {
              await putNavCached(navCache, req, res);
            } else {
              // Redirect (logged out / moved) or error → drop any stale auth'd copy.
              await navCache.delete(req);
            }
            return res;
          })
          .catch(() => null);

        if (cached) {
          // 방금 담은 사본이면 굳이 화면을 새로고침하지 않는다(2026-08-04).
          //
          // 예전에는 캐시로 그린 **모든** 내비게이션마다 `router.refresh()` 를 걸었다. 앱을
          // 잠깐 백그라운드에 뒀다 돌아오거나 같은 화면을 연달아 열면, 캐시 페인트 → 새로고침
          // 재렌더로 화면이 두 번 깜빡였다. 사본이 몇십 초 안쪽이면 서버 데이터가 달라졌을 가능성이
          // 낮으므로 조용히 넘어간다 — 캐시 갱신 자체는 그대로 돌기 때문에 다음 진입은 최신이다.
          const fresh = isRecentlyCached(cached);
          event.waitUntil(
            revalidate.then((res) => {
              if (!fresh) return notifyNavRevalidated(res, req.url);
            }),
          );
          return cached;
        }

        // No cached copy yet (first launch / just evicted): use the network, fall back to offline.
        const res = await revalidate;
        return res || offlineFallback();
      })(),
    );
    return;
  }

  // Immutable static assets: cache-first (they're content-hashed, so never stale).
  const url = new URL(req.url);
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons"))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
