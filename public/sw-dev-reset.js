/* StayOps — dev-only service worker kill switch.
 *
 * `next dev` 에서는 `/sw.js` 요청이 이 파일로 rewrite 된다(`next.config.ts`).
 * 같은 origin(localhost:3000)에서 예전에 `npm start` 로 프로덕션 SW 를 설치했다면, 그 SW 가
 * 개발 서버의 문서·청크 요청을 가로채 옛 캐시를 내준다. `.next` 를 지우면 그 캐시가 가리키는
 * 청크가 사라져 **화면이 무한 로딩**에 걸린다(2026-09-28).
 *
 * 브라우저는 페이지를 열 때마다 등록된 SW 스크립트(`/sw.js`)를 HTTP 캐시 없이 다시 받아 바이트를
 * 비교한다. 여기서 내용이 달라지니 이 파일이 새 SW 로 설치되고 — 캐시를 전부 지우고, 스스로 등록을
 * 해제한 뒤, 열려 있는 탭을 한 번 다시 불러온다. 페이지 JS 가 못 떠도 동작한다.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url).catch(() => {});
      }
    })(),
  );
});
