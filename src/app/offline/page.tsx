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
      {/* 실제 PWA 앱 아이콘. 예전엔 여기에 그라데이션 박스 + 이탤릭 "S" 를 그렸는데 그건 제품
          로고가 아니었다(2026-08-04). `next/image` 대신 <img> 인 이유: 이 페이지는 서비스 워커가
          네트워크 없이 캐시에서 내보내므로, 이미지 최적화 엔드포인트(/_next/image)를 탈 수 없다.
          이 경로는 SW 가 프리캐시한다(`OFFLINE_ICON`). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="StayOps"
        className="size-16 rounded-[20px]"
        height={64}
        src="/icons/icon-192.png"
        width={64}
      />
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
