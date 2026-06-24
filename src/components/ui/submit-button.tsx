"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  children: ReactNode;
  /** Shown while the enclosing form's action is pending. Defaults to a spinner + the label. */
  pendingChildren?: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "glass" | "destructive";
  autoFocus?: boolean;
  disabled?: boolean;
};

/**
 * Submit button that disables itself + shows a spinner while the enclosing `<form action={...}>`
 * server action is in flight (via `useFormStatus`). Prevents double-submit and the "dead" feel of a
 * still-tappable button during the round-trip. Must be rendered INSIDE the `<form>`.
 */
export function SubmitButton({
  children,
  pendingChildren,
  className,
  variant = "primary",
  autoFocus,
  disabled,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      aria-busy={pending}
      autoFocus={autoFocus}
      className={className}
      disabled={pending || disabled}
      type="submit"
      variant={variant}
    >
      {pending
        ? (pendingChildren ?? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {children}
            </span>
          ))
        : children}
    </Button>
  );
}
