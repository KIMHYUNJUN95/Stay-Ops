/**
 * Tiny module-scoped signal for the direction of the next mobile navigation, so the route
 * transition (`src/app/mobile/template.tsx`) can play an iOS-style push (forward) vs pop (back)
 * slide. Forward is the default; `goBack()` in the mobile shell flags "back" right before it
 * navigates. The template consumes the value on its next mount, then it resets to "forward".
 */
export type NavDirection = "forward" | "back";

let pending: NavDirection = "forward";

export function setNavDirection(direction: NavDirection): void {
  pending = direction;
}

/** Read and reset the pending direction (defaults back to "forward"). */
export function consumeNavDirection(): NavDirection {
  const direction = pending;
  pending = "forward";
  return direction;
}
