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
      <div className="mt-4 flex items-center gap-2.5">
        <button
          className="h-11 rounded-full bg-primary px-6 text-[14px] font-extrabold text-primary-foreground transition-transform active:scale-[0.97]"
          onClick={reset}
          type="button"
        >
          다시 시도 · 再試行 · Retry
        </button>
        <Link
          className="h-11 rounded-full border border-border bg-surface px-6 text-[14px] font-bold leading-[44px] text-foreground transition-transform active:scale-[0.97]"
          href="/mobile"
        >
          홈 · ホーム · Home
        </Link>
      </div>
    </main>
  );
}
