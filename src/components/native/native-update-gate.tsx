"use client";

import { useEffect, useState } from "react";
import { getNativeAppInfo, MIN_NATIVE_BUILD, NATIVE_STORE_URL, type NativeAppInfo } from "@/lib/native-app";
import type { Dictionary } from "@/lib/i18n";

/**
 * 「앱 업데이트 필요」 화면 (2026-10-09, 웹 · 앱 버전 어긋남 대비).
 *
 * 앱은 배포된 웹을 띄우므로 웹 배포는 깔린 모든 앱 버전에 즉시 들어간다. 새 웹이 **새 네이티브 기능 없이는 동작할 수 없게**
 * 바뀌었다면 `MIN_NATIVE_BUILD`(src/lib/native-app.ts)를 올리고, 그보다 낮은 설치본에는 이 화면이 앱 전체를 덮는다.
 * 스토어 주소가 있으면 「업데이트」 버튼, 없으면(iOS 등록 전) 안내만. 브라우저 · PWA 에서는 아무것도 안 한다.
 */
export function NativeUpdateGate({ copy }: { copy: Dictionary["appShell"] }) {
  const [outdated, setOutdated] = useState<NativeAppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getNativeAppInfo().then((info) => {
      if (!cancelled && info && info.build < MIN_NATIVE_BUILD[info.platform]) setOutdated(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!outdated) return null;
  const storeUrl = NATIVE_STORE_URL[outdated.platform];

  return (
    <div
      aria-labelledby="native-update-title"
      aria-modal="true"
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-background px-4 text-center"
      data-native-back-overlay=""
      role="dialog"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-[340px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- 앱 아이콘 그대로(최적화 엔드포인트 불필요) */}
        <img alt="" className="mx-auto mb-5 size-16 rounded-[15px]" height={64} src="/icons/icon-192.png" width={64} />
        <h1 className="mb-2.5 text-[20px] font-bold leading-snug text-foreground" id="native-update-title">
          {copy.updateTitle}
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">{copy.updateBody}</p>
        {storeUrl ? (
          <a
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[14px] bg-primary text-[15px] font-bold text-primary-foreground"
            href={storeUrl}
          >
            {copy.updateAction}
          </a>
        ) : null}
      </div>
    </div>
  );
}
