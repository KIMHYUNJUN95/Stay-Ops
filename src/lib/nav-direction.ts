/**
 * Tiny module-scoped signal for the direction of the next mobile navigation, so the route
 * transition (`src/app/mobile/template.tsx`) can play an iOS-style push (forward) vs pop (back)
 * slide. Forward is the default; `goBack()` in the mobile shell flags "back" right before it
 * navigates. The template consumes the value on its next mount, then it resets to "forward".
 */
export type NavDirection = "forward" | "back";

let pending: NavDirection = "forward";
let stampedAt = 0;

export function setNavDirection(direction: NavDirection): void {
  pending = direction;
  stampedAt = typeof performance !== "undefined" ? performance.now() : 0;
}

/**
 * Read and reset the pending direction (defaults back to "forward"). A "back" flag is only honored
 * if it was set very recently — otherwise a `goBack()` that navigated to a screen which doesn't
 * mount the mobile template (e.g. /account, /admin) would leave "back" stuck and mis-animate the
 * NEXT forward navigation as a pop.
 */
export function consumeNavDirection(): NavDirection {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const fresh = stampedAt > 0 && now - stampedAt < 1200;
  const direction = fresh ? pending : "forward";
  pending = "forward";
  stampedAt = 0;
  return direction;
}
