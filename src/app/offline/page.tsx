import type { Metadata } from "next";
import { OfflineAutoReload } from "@/app/offline/offline-auto-reload";

// i18n-ignore-file: offline fallback is static and trilingual because session locale may be unavailable.

export const metadata: Metadata = {
  title: "오프라인 · StayOps",
};

/**
 * Offline fallback served by the service worker when a navigation fails with no network.
 * Static + self-contained (no session / data / i18n context, since it must render offline).
 * Trilingual to match the product's ko/ja/en requirement.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-foreground">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-[linear-gradient(160deg,#36568f,#1a2c4f)] text-2xl font-black italic text-[#f7f4ee]">
        S
      </div>
      <h1 className="mt-2 text-[19px] font-black tracking-[-0.02em]">연결이 끊겼어요</h1>
      <p className="text-[13.5px] font-medium leading-relaxed text-muted-foreground">
        인터넷에 연결되면 자동으로 다시 불러옵니다.
        <br />
        オフラインです。接続が戻ると自動で再読み込みします。
        <br />
        You’re offline. We’ll reload automatically once you’re back online.
      </p>
      <OfflineAutoReload />
    </main>
  );
}
