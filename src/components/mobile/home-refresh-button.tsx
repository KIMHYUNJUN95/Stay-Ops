"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type HomeRefreshButtonProps = {
  ariaLabel?: string;
  className?: string;
  label: string;
};

export function HomeRefreshButton({ ariaLabel, className, label }: HomeRefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      aria-label={ariaLabel ?? label}
      className={className}
      disabled={isPending}
      onClick={() => startTransition(() => { router.refresh(); })}
      type="button"
    >
      {label}
    </button>
  );
}
