"use client";

import { useEffect, useState } from "react";
import { getDictionary } from "@/lib/i18n";

type Props = {
  initialTime: string;
  locale: string;
};

function getJstHHMM(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date());
}

export function HomeLastUpdatedClock({ initialTime, locale }: Props) {
  const [time, setTime] = useState(initialTime);
  const dict = getDictionary(locale);

  useEffect(() => {
    // Sync to next real-clock minute boundary for accurate display
    const msToNextMinute = 60000 - (Date.now() % 60000);
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const timeoutId = setTimeout(() => {
      setTime(getJstHHMM());
      intervalId = setInterval(() => setTime(getJstHHMM()), 60000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, []);

  return (
    <p aria-live="polite" className="px-1 text-[11px] text-slate-400">
      {dict.mobile.homeLastUpdated(time)}
    </p>
  );
}
