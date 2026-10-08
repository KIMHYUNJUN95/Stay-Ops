/**
 * Lightweight haptic feedback.
 *
 * - **iOS · Android app (Capacitor):** `@capacitor/haptics` — the Taptic Engine on iOS, the system haptic
 *   motor on Android (2026-10-09, native quality N15). Without this the iOS app had no haptics at all.
 * - **Browser / PWA:** the Vibration API where it exists (Android Chrome). A safe no-op on iOS Safari /
 *   installed iOS PWAs, which do NOT expose `navigator.vibrate`.
 *
 * Call sites never check capability — `haptic()` can be called from any interaction handler. If the
 * installed app predates the haptics plugin (`hasNativePlugin`), it falls back to the Vibration API.
 */
import { hasNativePlugin } from "@/lib/native-app";

export type HapticKind = "light" | "medium" | "success" | "warning" | "error";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 14,
  success: [10, 40, 12],
  warning: [16, 60, 16],
  error: [24, 40, 24, 40, 24],
};

let nativeHaptics: Promise<typeof import("@capacitor/haptics")> | null = null;

function nativeHaptic(kind: HapticKind) {
  nativeHaptics ??= import("@capacitor/haptics");
  void nativeHaptics
    .then(({ Haptics, ImpactStyle, NotificationType }) => {
      switch (kind) {
        case "light":
          return Haptics.impact({ style: ImpactStyle.Light });
        case "medium":
          return Haptics.impact({ style: ImpactStyle.Medium });
        case "success":
          return Haptics.notification({ type: NotificationType.Success });
        case "warning":
          return Haptics.notification({ type: NotificationType.Warning });
        case "error":
          return Haptics.notification({ type: NotificationType.Error });
      }
    })
    .catch(() => undefined);
}

export function haptic(kind: HapticKind = "light"): void {
  if (typeof navigator === "undefined") return;
  if (hasNativePlugin("Haptics")) {
    nativeHaptic(kind);
    return;
  }
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return; // iOS Safari / standalone: unsupported — no-op.
  try {
    vibrate(PATTERNS[kind]);
  } catch {
    /* some browsers throw if called outside a user gesture — ignore */
  }
}
