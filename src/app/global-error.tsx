"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <html lang="en">
      <body>
        <main className="min-h-dvh bg-white px-6 py-10 text-slate-950">
          <h1 className="text-xl font-bold">A global error occurred.</h1>
          <button
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
