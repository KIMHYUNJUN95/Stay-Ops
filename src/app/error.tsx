"use client";

import { useEffect } from "react";

export default function Error({
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
    <main className="min-h-dvh bg-white px-6 py-10 text-slate-950">
      <h1 className="text-xl font-bold">Something went wrong.</h1>
      <button
        className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </main>
  );
}
