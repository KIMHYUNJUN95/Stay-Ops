/**
 * 링크 공유 (2026-10-09, 네이티브 품질 N16).
 *
 * - **앱(Capacitor):** `@capacitor/share` — OS 공유 시트. Android WebView 에는 `navigator.share` 가 없어 예전엔 링크 복사로만 끝났다.
 * - **브라우저 · PWA:** Web Share API, 없으면 클립보드 복사.
 *
 * 결과: `shared`(공유 시트를 띄움 — 사용자가 취소한 것도 포함) · `copied`(복사함 → 「복사됨」 토스트) · `failed`.
 */
import { hasNativePlugin } from "@/lib/native-app";

export type ShareLinkResult = "shared" | "copied" | "failed";

function isCancel(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name ?? "";
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return name === "AbortError" || message.includes("cancel");
}

async function copyToClipboard(url: string): Promise<ShareLinkResult> {
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function shareLink({ title, url }: { title: string; url: string }): Promise<ShareLinkResult> {
  if (hasNativePlugin("Share")) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, url, dialogTitle: title });
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "shared";
      return copyToClipboard(url);
    }
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "shared";
      return copyToClipboard(url);
    }
  }
  return copyToClipboard(url);
}
