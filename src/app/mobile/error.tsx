"use client";

import { useEffect } from "react";
import Link from "next/link";

// i18n-ignore-file: trilingual error fallback renders without session locale context.

/**
 * Mobile error boundary — replaces the bare white root error page with a branded, trilingual screen
 * so a thrown error on any /mobile/* screen reads as a recoverable in-app state, not a crash.
 */
export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-foreground">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-[linear-gradient(160deg,#36568f,#1a2c4f)] text-2xl font-black italic text-[#f7f4ee]">
        S
      </div>
      <h1 className="mt-2 text-[19px] font-black tracking-[-0.02em]">문제가 발생했어요</h1>
      <p className="text-[13.5px] font-medium leading-relaxed text-muted-foreground">
        잠시 후 다시 시도해 주세요.
        <br />
        問題が発生しました。もう一度お試しください。
        <br />
        Something went wrong. Please try again.
      </p>
      {/* 3개 국어 라벨은 좁은 화면에서 한 줄에 안 들어간다. 가로로 나란히 두면 "다시 시도 · 再試行 ·
          / Retry" 처럼 단어 중간에서 접히고, Link 의 고정 line-height 때문에 두 번째 줄이 알약 밖으로
          삐져나온다(2026-08-04 실기기 확인). 세로 스택 + 전체 폭으로 바꿔 어느 언어에서도 접히지
          않게 한다. 로케일을 하나만 고를 수 없는 화면이라 라벨은 3개 국어를 유지한다 — 이 경계는
          세션 컨텍스트가 없는 상태에서도 떠야 하기 때문이다. */}
      <div className="mt-4 flex w-full max-w-[320px] flex-col gap-2.5">
        <button
          className="flex h-12 items-center justify-center rounded-full bg-primary px-6 text-[14px] font-extrabold text-primary-foreground transition-transform active:scale-[0.97]"
          onClick={reset}
          type="button"
        >
          다시 시도 · 再試行 · Retry
        </button>
        <Link
          className="flex h-12 items-center justify-center rounded-full border border-border bg-surface px-6 text-[14px] font-bold text-foreground transition-transform active:scale-[0.97]"
          href="/mobile"
        >
          홈 · ホーム · Home
        </Link>
      </div>
    </main>
  );
}
