/**
 * Lightweight haptic feedback.
 *
 * Uses the Vibration API where it exists (Android Chrome, and future native wrappers). It is a
 * safe no-op on iOS Safari / installed iOS PWAs, which do NOT expose `navigator.vibrate` — so this
 * can be called from any interaction handler without a capability check at the call site.
 *
 * When the app is later wrapped natively (Capacitor), swap the implementation here for
 * `@capacitor/haptics` (Taptic Engine on iOS) — every call site stays unchanged.
 */
export type HapticKind = "light" | "medium" | "success" | "warning" | "error";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 14,
  success: [10, 40, 12],
  warning: [16, 60, 16],
  error: [24, 40, 24, 40, 24],
};

export function haptic(kind: HapticKind = "light"): void {
  if (typeof navigator === "undefined") return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return; // iOS Safari / standalone: unsupported — no-op.
  try {
    vibrate(PATTERNS[kind]);
  } catch {
    /* some browsers throw if called outside a user gesture — ignore */
  }
}
