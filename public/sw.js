/* StayOps service worker — minimal & conservative.
 *
 * Goals: (1) make the app installable (Android needs a SW with a fetch handler for the install
 * prompt), (2) give a friendly offline page instead of the browser error, (3) speed up static
 * assets. It deliberately does NOT cache HTML/RSC navigations — those stay network-first so the
 * installed app is never stuck on stale content (the previous no-SW state had no staleness; we
 * keep that guarantee for dynamic content). Bump CACHE to invalidate old static caches on deploy. */
const CACHE = "stayops-static-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navigations: always try the network first; fall back to the offline page when truly offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(OFFLINE_URL)) || Response.error();
        }
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
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
