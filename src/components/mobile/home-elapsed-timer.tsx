"use client";

import { useEffect, useState } from "react";

function computeElapsed(startedAt: string): string {
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type HomeElapsedTimerProps = {
  startedAt: string;
};

export function HomeElapsedTimer({ startedAt }: HomeElapsedTimerProps) {
  const [elapsed, setElapsed] = useState(() => computeElapsed(startedAt));

  useEffect(() => {
    const id = setInterval(() => setElapsed(computeElapsed(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return <span className="tabular-nums">{elapsed}</span>;
}
