"use client";

import { useState, type ReactNode } from "react";
import { consumeNavDirection } from "@/lib/nav-direction";

/**
 * Route transition wrapper for every /mobile/* screen. A `template.tsx` (unlike a layout) remounts
 * on each navigation, so this is where we play an iOS-style slide: forward navigations push in from
 * the right, back navigations (flagged by the shell's `goBack()`) pop in from the left. The
 * direction is consumed once at mount. CSS lives in `globals.css` (`.screen-push` / `.screen-pop`),
 * which honor `prefers-reduced-motion`.
 */
export default function MobileTemplate({ children }: { children: ReactNode }) {
  const [direction] = useState(consumeNavDirection);
  return <div className={direction === "back" ? "screen-pop" : "screen-push"}>{children}</div>;
}
