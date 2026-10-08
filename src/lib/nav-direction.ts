import { consumeRecentTraverse } from "@/lib/swipe-back/history-tracker";

/**
 * Direction of the next mobile navigation, so the route transition (`src/app/mobile/template.tsx`) can play an iOS-style
 * push (forward) vs pop (back) slide — or nothing when the screen already moved under the user's finger.
 *
 * - **"none"** — set by the swipe-back gesture right before it navigates: the screen was already dragged off and the
 *   previous screen is sitting underneath, so a second slide would play the transition twice.
 * - **back / forward history traversal** (OS edge swipe, browser back, Android back button) is read from the history
 *   tracker. Until 2026-10-08 nothing set "back", so every back navigation played the *forward* push slide. When the
 *   browser already animated the traversal itself (Safari edge swipe — `PopStateEvent.hasUAVisualTransition`), we play
 *   nothing, for the same double-animation reason.
 *
 * The template consumes the value once on mount, then it resets to "forward".
 */
export type NavDirection = "forward" | "back" | "none";

let pending: NavDirection | null = null;
let stampedAt = 0;

/** An explicit direction is only honored briefly — a navigation that never mounts the mobile template must not leave it stuck. */
const EXPLICIT_TTL_MS = 3000;
/** A popstate older than this is not the reason the template is mounting now. */
const TRAVERSE_TTL_MS = 3000;

export function setNavDirection(direction: NavDirection): void {
  pending = direction;
  stampedAt = typeof performance !== "undefined" ? performance.now() : 0;
}

export function clearNavDirection(): void {
  pending = null;
  stampedAt = 0;
}

/** Read and reset the pending direction (defaults to "forward"). */
export function consumeNavDirection(): NavDirection {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const explicit = pending && stampedAt > 0 && now - stampedAt < EXPLICIT_TTL_MS ? pending : null;
  clearNavDirection();
  const traverse = consumeRecentTraverse(TRAVERSE_TTL_MS);
  if (explicit) return explicit;
  if (traverse?.direction === "back") return traverse.uaVisual ? "none" : "back";
  if (traverse?.direction === "forward") return traverse.uaVisual ? "none" : "forward";
  return "forward";
}
