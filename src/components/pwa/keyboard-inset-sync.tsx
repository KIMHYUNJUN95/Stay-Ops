"use client";

import { useEffect } from "react";

/**
 * Publishes the on-screen keyboard height as a `--keyboard-inset` CSS variable on <html>, using the
 * VisualViewport API. Fixed bottom bars (e.g. form submit bars) can then sit at
 * `bottom: var(--keyboard-inset, 0px)` so the keyboard never covers them — the single biggest
 * keyboard-related native-feel gap on iOS (where the layout viewport doesn't resize on keyboard
 * open). Renders nothing; no-op where VisualViewport is unavailable.
 */
export function KeyboardInsetSync() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      // How much the keyboard (and any bottom browser UI) overlaps the layout viewport bottom.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);

  return null;
}
