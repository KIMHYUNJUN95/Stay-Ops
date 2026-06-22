"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (production only) so the installed PWA is installable on Android
 * (Chrome's install prompt requires a SW with a fetch handler) and gets an offline fallback.
 * Dev is skipped so a cached SW never interferes with HMR. Renders nothing.
 */
export function ServiceWorkerRegister() {
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
