"use client";

import { useEffect, useState } from "react";

/**
 * Launch splash — shows the app icon centered on the ivory canvas for a brief
 * moment when the document first loads (cold launch / refresh / installed PWA),
 * then fades out and unmounts. Because this is a client component it is still
 * server-rendered, so the splash is present in the initial HTML and visible at
 * first paint (no flash of empty canvas before hydration). App-internal route
 * transitions don't reload the document, so it only appears on a real launch.
 */
const HOLD_MS = 850;
const FADE_MS = 420;

export function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "fading" | "gone">("visible");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fading"), HOLD_MS);
    const goneTimer = setTimeout(() => setPhase("gone"), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        opacity: phase === "fading" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: phase === "fading" ? "none" : "auto",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        src="/icons/icon-192.png"
        width={88}
        height={88}
        style={{
          width: 88,
          height: 88,
          borderRadius: 22,
          animation: "splash-pop 520ms cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom) + 48px)",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <span
          className="wordmark"
          style={{
            fontSize: 22,
            color: "var(--foreground)",
            animation: "splash-pop 520ms cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        >
          Stay Ops
        </span>
      </div>
    </div>
  );
}
