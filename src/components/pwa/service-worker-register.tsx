"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Registers the service worker (production only) so the installed PWA is installable on Android
 * (Chrome's install prompt requires a SW with a fetch handler) and gets an offline fallback.
 * Dev is skipped so a cached SW never interferes with HMR. Renders nothing.
 */
export function ServiceWorkerRegister() {
  const router = useRouter();

  // The SW serves the cold-launch document from a stale-while-revalidate cache for an instant
  // paint, then messages us once it has revalidated: pull fresh server data quietly (router.refresh)
  // so the momentarily-stale screen self-corrects — or hard-reload if the revalidation redirected
  // (e.g. the session expired and the server wants to send us to login).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (type === "sw-nav-fresh") {
        router.refresh();
      } else if (type === "sw-nav-redirected") {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // When a newly-installed SW takes control (after a deploy), reload ONCE so the client picks up
    // the new app shell + content-hashed chunks instead of being stuck on the old version (which can
    // also cause chunk-load errors). Only reload if an OLD SW was already controlling this page —
    // otherwise the first-ever install's clients.claim() would trigger a needless reload loop.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal — the app still works online */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
