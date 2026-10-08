"use client";

import { AppErrorScreen } from "@/components/app-error-screen";

// 루트 레이아웃까지 무너진 경우 — 이 파일이 <html> 을 대신 그린다. 다시 시도 = 새로 불러오기.
// 언어는 문서가 아니라 언어 쿠키 · 기기 언어로 고른다(`documentLocale={false}`) — 여기 <html lang> 은 고정값이다.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <AppErrorScreen
          documentLocale={false}
          error={error}
          onRetry={() => window.location.reload()}
          source="global-error"
        />
      </body>
    </html>
  );
}
