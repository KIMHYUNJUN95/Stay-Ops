"use client";

import { useState, type ReactNode } from "react";
import { consumeNavDirection } from "@/lib/nav-direction";

/**
 * Route transition wrapper for every /mobile/* screen. A `template.tsx` (unlike a layout) remounts when the first segment
 * under /mobile changes (switching sections), so this is where we play an iOS-style slide: forward navigations push in
 * from the right, back navigations pop in from the left, and a screen the user already swiped back to (or the browser
 * already animated) appears without a slide. The direction is consumed once at mount (`src/lib/nav-direction.ts`).
 * CSS lives in `globals.css` (`.screen-push` / `.screen-pop`), which honor `prefers-reduced-motion`.
 *
 * The class is dropped when the slide ends: its `animation-fill-mode: both` otherwise leaves a transform on this wrapper
 * for the screen's whole life, which makes it a stacking context and the containing block for every `position: fixed`
 * descendant. The swipe-back gesture needs neither (docs/product/16-mobile-navigation.md 「뒤로가기 — 화면 스와이프」).
 */
export default function MobileTemplate({ children }: { children: ReactNode }) {
  const [direction] = useState(consumeNavDirection);
  const [settled, setSettled] = useState(direction === "none");
  const className = settled ? undefined : direction === "back" ? "screen-pop" : "screen-push";
  return (
    <div
      className={className}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setSettled(true);
      }}
    >
      {children}
    </div>
  );
}
