"use client";

import { useEffect } from "react";
import { reportClientError, shouldCollectUncaughtErrors } from "@/lib/client-error-report";

/**
 * 잡히지 않은 화면 오류를 서버 로그로 보낸다 — **앱 · 설치한 PWA 에서만** (2026-10-09, 앱 출시 준비 — 오류 수집).
 * 루트 레이아웃에 한 번. 오류 화면에 걸린 오류는 `AppErrorScreen` 이 따로 보낸다. 받는 쪽: `/api/client-errors`.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    if (!shouldCollectUncaughtErrors()) return;

    function onError(event: ErrorEvent) {
      // 다른 출처 스크립트의 오류는 내용 없이 「Script error.」로만 온다 — 쓸모가 없어 버린다.
      if (!event.error && (!event.message || event.message === "Script error.")) return;
      reportClientError(event.error ?? event.message, "window-error");
    }
    function onRejection(event: PromiseRejectionEvent) {
      reportClientError(event.reason, "unhandled-rejection");
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
