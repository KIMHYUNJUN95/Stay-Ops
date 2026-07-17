"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type InviteCopyButtonProps = {
  code: string;
  labels: { copy: string; copied: string; failed: string };
};

/**
 * Copies an invite code to the clipboard. Mirrors the small `.ui-btn--sm` secondary style used by the
 * other invite-card controls, and shows a transient "copied" (or "failed") state for ~1.6s. Uses the
 * async Clipboard API with a legacy `execCommand` fallback for non-secure contexts.
 */
export function InviteCopyButton({ code, labels }: InviteCopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        ok = true;
      } else {
        const area = document.createElement("textarea");
        area.value = code;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        document.body.removeChild(area);
      }
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 1600);
  }

  return (
    <button
      type="button"
      className="ui-btn ui-btn--secondary ui-btn--sm"
      onClick={copy}
    >
      <span className="ic">{state === "copied" ? <Check /> : <Copy />}</span>
      {state === "copied"
        ? labels.copied
        : state === "failed"
          ? labels.failed
          : labels.copy}
    </button>
  );
}
