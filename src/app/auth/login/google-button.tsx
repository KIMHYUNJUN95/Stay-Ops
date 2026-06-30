"use client";

import { useFormStatus } from "react-dom";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="abtn__g" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.9a5.05 5.05 0 01-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.18v2.84A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.83 14.09a6.6 6.6 0 010-4.18V7.07H2.18a11 11 0 000 9.86l3.65-2.84z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.07.56 4.21 1.65l3.14-3.14C17.45 1.46 14.97.5 12 .5A11 11 0 002.18 7.07l3.65 2.84C6.7 7.3 9.13 4.75 12 4.75z" />
    </svg>
  );
}

/**
 * Google sign-in submit button with an in-place loading state.
 *
 * On submit the page does NOT navigate — `useFormStatus` flips `pending`, the label
 * goes transparent, pointer-events lock, and a navy spinner spins in place (the
 * "Google 진행 중" frame). Must be rendered inside the `signInWithGoogle` <form>.
 */
export function GoogleSubmitButton({ label }: { label: string; compact?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="abtn abtn--google"
      style={pending ? { pointerEvents: "none" } : undefined}
    >
      {pending ? (
        <span
          className="ic"
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            border: "2.4px solid color-mix(in oklab, currentColor 30%, transparent)",
            borderTopColor: "currentColor",
            animation: "spin 0.7s linear infinite",
          }}
        />
      ) : (
        <GoogleGlyph />
      )}
      {label}
    </button>
  );
}
