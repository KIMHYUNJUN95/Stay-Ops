"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FALLBACK_COPY, resolveFallbackLocale } from "@/lib/fallback-copy";

/**
 * Mobile error boundary — replaces the bare white root error page with a branded screen so a thrown
 * error on any /mobile/* screen reads as a recoverable in-app state, not a crash.
 *
 * **Shown in the user's own language (2026-08-04).** It used to stack all three locales at once
 * because "the boundary renders without session locale context" — but the root layout writes the
 * session language onto `<html lang>`, and this is a client component, so it can just read it.
 * Stacking three languages also made the buttons wrap mid-label on a phone. Falls back to `ko`
 * when the attribute is missing (see `resolveFallbackLocale`).
 */
export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 첫 페인트부터 맞는 언어로 그리기 위해 lazy initializer 에서 읽는다. 이 경계는 클라이언트에서만
  // 렌더되지만, 스트리밍 중 서버에서 평가될 여지를 남겨 `document` 유무를 확인한다.
  const [locale] = useState(() =>
    resolveFallbackLocale(typeof document === "undefined" ? null : document.documentElement.lang),
  );
  const copy = FALLBACK_COPY[locale];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-foreground">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-[linear-gradient(160deg,#36568f,#1a2c4f)] text-2xl font-black italic text-[#f7f4ee]">
        S
      </div>
      <h1 className="mt-2 text-[19px] font-black tracking-[-0.02em]">{copy.errorTitle}</h1>
      <p className="text-[13.5px] font-medium leading-relaxed text-muted-foreground">
        {copy.errorBody}
      </p>
      <div className="mt-4 flex items-center gap-2.5">
        <button
          className="flex h-12 items-center justify-center rounded-full bg-primary px-7 text-[14px] font-extrabold text-primary-foreground transition-transform active:scale-[0.97]"
          onClick={reset}
          type="button"
        >
          {copy.retry}
        </button>
        <Link
          className="flex h-12 items-center justify-center rounded-full border border-border bg-surface px-7 text-[14px] font-bold text-foreground transition-transform active:scale-[0.97]"
          href="/mobile"
        >
          {copy.home}
        </Link>
      </div>
    </main>
  );
}
