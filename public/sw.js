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
const STATIC_CACHE = "stayops-static-v1";
const NAV_CACHE = "stayops-nav-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
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

async function notifyNavRevalidated(res) {
  const wins = await self.clients.matchAll({ type: "window" });
  // A redirect / error means the stale page we served is no longer valid (e.g. logged out) — ask
  // the client to hard-reload so the server can send it to the right place. Otherwise, ask it to
  // quietly pull fresh server data.
  const redirected = !res || res.redirected || !res.ok;
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
              await navCache.put(req, res.clone());
            } else {
              // Redirect (logged out / moved) or error → drop any stale auth'd copy.
              await navCache.delete(req);
            }
            return res;
          })
          .catch(() => null);

        if (cached) {
          // Instant paint from the last good copy; refresh cache + the open page in the background.
          event.waitUntil(revalidate.then((res) => notifyNavRevalidated(res)));
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
