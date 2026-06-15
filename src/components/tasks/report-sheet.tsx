"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, FileText, Lock, RefreshCw, X } from "lucide-react";
import { generateDailyReport } from "@/app/mobile/tasks/report-actions";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];
type Status = "loading" | "done" | "forbidden" | "empty" | "error";

// Clipboard write with a legacy fallback (mirrors the calendar's copy util) so it works in
// non-secure contexts / older webviews.
async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

/**
 * Bottom sheet that generates and displays the AI daily work report for a given Tokyo date.
 * Same portal+animation pattern as PhotoGallery (mount→show, body scroll lock, Esc to close, portal
 * to <body> so the mobile shell's transformed scroll container can't trap `position: fixed`).
 *
 * Permission is enforced server-side: a non-staff caller gets `forbidden`, which renders the
 * "권한 없음" state in place of the report — satisfying the "권한 없는 사람이 누르면 팝업" requirement.
 */
export function ReportSheet({
  copy,
  date,
  locale,
  onClose,
}: {
  copy: Copy;
  date: string;
  locale: Locale;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const close = useCallback(() => {
    setShown(false);
    setTimeout(onClose, 320); // matches the sheet transition duration
  }, [onClose]);

  const run = useCallback(() => {
    setStatus("loading");
    setCopied(false);
    generateDailyReport(date).then((res) => {
      if (res.ok) {
        setText(res.text);
        setStatus("done");
      } else {
        setStatus(res.reason);
      }
    });
  }, [date]);

  // Play the slide-in on mount; kick off generation (rAF-scheduled so the loading setState is not
  // called synchronously inside the effect body).
  useEffect(() => {
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    const b = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [run]);

  // Lock body scroll + Esc to close while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const onCopy = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T00:00:00+09:00`));

  if (typeof document === "undefined") return null;

  const centered = (icon: React.ReactNode, title: string, body: string, retry?: boolean) => (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
        {icon}
      </span>
      <p className="text-[15px] font-extrabold text-foreground">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      {retry ? (
        <button
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-bold text-primary"
          onClick={run}
          type="button"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {copy.reportRegenerate}
        </button>
      ) : null}
    </div>
  );

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/45 transition-opacity duration-300 motion-reduce:transition-none",
        shown ? "opacity-100" : "opacity-0",
      )}
      onClick={close}
    >
      <div
        className={cn(
          "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3",
          "transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
          shown ? "translate-y-0" : "translate-y-full",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-slate-200" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/[0.09] text-primary">
                <FileText className="size-[17px]" aria-hidden="true" />
              </span>
              <p className="text-[16px] font-black tracking-[-0.01em] text-foreground">
                {copy.reportTitle}
              </p>
            </div>
            <p className="ml-10 mt-[3px] text-[12px] font-medium text-muted-foreground">{dateLabel}</p>
          </div>
          <button
            aria-label={copy.cancel}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-colors active:bg-slate-100"
            onClick={close}
            type="button"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {status === "loading"
          ? centered(
              <RefreshCw className="size-6 animate-spin" aria-hidden="true" />,
              copy.reportGenerating,
              copy.reportSubtitle,
            )
          : status === "forbidden"
            ? centered(
                <Lock className="size-6" aria-hidden="true" />,
                copy.reportNoPermissionTitle,
                copy.reportNoPermissionBody,
              )
            : status === "empty"
              ? centered(
                  <FileText className="size-6" aria-hidden="true" />,
                  copy.reportEmptyTitle,
                  copy.reportEmptyBody,
                )
              : status === "error"
                ? centered(
                    <RefreshCw className="size-6" aria-hidden="true" />,
                    copy.reportError,
                    copy.reportSubtitle,
                    true,
                  )
                : (
                  <div>
                    <textarea
                      className="h-[44vh] w-full resize-none rounded-2xl border border-border bg-muted/40 p-3.5 text-[13.5px] leading-relaxed text-foreground outline-none focus:border-primary"
                      onChange={(e) => setText(e.target.value)}
                      value={text}
                    />
                    <p className="mt-1.5 px-0.5 text-[11.5px] text-muted-foreground">
                      {copy.reportEditHint}
                    </p>
                    <div className="mt-3 flex gap-2.5">
                      <button
                        className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-[13.5px] font-bold text-foreground transition-colors active:bg-slate-50"
                        onClick={run}
                        type="button"
                      >
                        <RefreshCw className="size-4" aria-hidden="true" />
                        {copy.reportRegenerate}
                      </button>
                      <button
                        className="inline-flex h-12 flex-[1.4] items-center justify-center gap-1.5 rounded-2xl bg-primary text-[13.5px] font-extrabold text-primary-foreground transition-opacity active:opacity-90"
                        onClick={onCopy}
                        type="button"
                      >
                        <Copy className="size-4" aria-hidden="true" />
                        {copied ? copy.reportCopied : copy.reportCopy}
                      </button>
                    </div>
                  </div>
                )}
      </div>
    </div>,
    document.body,
  );
}
