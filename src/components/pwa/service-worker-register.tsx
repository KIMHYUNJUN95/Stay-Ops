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
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal — the app still works online */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
