"use client";

import { useEffect } from "react";

/**
 * The offline fallback promises it'll reload once you're back online — this makes that true.
 * Reloads when the browser fires `online` (and once on mount if connectivity is already back).
 */
export function OfflineAutoReload() {
  useEffect(() => {
    const reload = () => window.location.reload();
    if (navigator.onLine) {
      reload();
      return;
    }
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);
  return null;
}
