"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, FileText, Lock, RefreshCw, Send } from "lucide-react";
import { generateDailyReport, sendDailyReportToSlack } from "@/app/mobile/tasks/report-actions";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];
type Status = "loading" | "done" | "forbidden" | "empty" | "error";
type SlackStatus = "idle" | "sending" | "sent" | "not_configured" | "too_long" | "error";

/** 보조 액션(다시 생성 · Slack) 공통 스타일 — 한 곳에 두어 두 버튼의 타이포가 갈리지 않게 한다. */
const secondaryBtn =
  "inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-border " +
  "bg-surface text-[13.5px] font-bold tracking-[-0.01em] text-foreground transition-colors " +
  "active:bg-muted/60 disabled:opacity-50";

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
  const [status, setStatus] = useState<Status>("loading");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [slackStatus, setSlackStatus] = useState<SlackStatus>("idle");

  const run = useCallback(() => {
    setStatus("loading");
    setCopied(false);
    setSlackStatus("idle");
    generateDailyReport(date).then((res) => {
      if (res.ok) {
        setText(res.text);
        setStatus("done");
      } else {
        setStatus(res.reason);
      }
    });
  }, [date]);

  // Kick off generation on mount (rAF-scheduled so the loading setState is not called
  // synchronously inside the effect body).
  useEffect(() => {
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }, [run]);

  const onCopy = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onSlackSend = async () => {
    setSlackStatus("sending");
    const result = await sendDailyReportToSlack(date, text);
    if (result.ok) {
      setSlackStatus("sent");
      return;
    }
    // 서버는 `forbidden` / `empty` 도 돌려주지만 그 둘은 전용 안내 문구가 없다(그리고 이 시트는
    // 이미 생성된 보고서를 보여주는 중이라 실제로 나올 일이 드물다). 전용 상태를 만들지 않고
    // 일반 오류로 접는다 — 안내할 말이 없는 상태를 UI 에 늘리지 않는다.
    setSlackStatus(
      result.reason === "not_configured" || result.reason === "too_long" ? result.reason : "error",
    );
  };

  const slackMessage =
    slackStatus === "sent"
      ? copy.reportSlackSent
      : slackStatus === "not_configured"
        ? copy.reportSlackNotConfigured
        : slackStatus === "too_long"
          ? copy.reportSlackTooLong
          : slackStatus === "error"
            ? copy.reportSlackError
            : null;

  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T00:00:00+09:00`));

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

  return (
    <BottomSheet
      ariaLabel={copy.reportTitle}
      header={
        <div className="mb-4 gap-3">
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
        </div>
      }
      onClose={onClose}
    >
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
                      onChange={(e) => {
                        setText(e.target.value);
                        setSlackStatus("idle");
                      }}
                      value={text}
                    />
                    <p className="mt-1.5 px-0.5 text-[11.5px] text-muted-foreground">
                      {copy.reportEditHint}
                    </p>
                    {slackMessage ? (
                      <p className="mt-2 px-0.5 text-[11.5px] text-muted-foreground" role="status">
                        {slackMessage}
                      </p>
                    ) : null}
                    {/* 액션 3개를 한 줄에 넣으면 각 버튼이 ~125px 라, 가장 긴 라벨("Slack으로
                        보내기" / "Send to Slack")이 눌려 보이고 그 버튼만 폰트를 줄여야 했다.
                        → 보조 2개를 위 줄, 주 동작(복사)을 아래 전체 폭으로 나눈다. 라벨이 길어도
                        여유가 생기고 세 버튼의 타이포를 하나로 통일할 수 있다(2026-08-03). */}
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          className={cn(secondaryBtn, "flex-1")}
                          onClick={run}
                          type="button"
                        >
                          <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
                          {copy.reportRegenerate}
                        </button>
                        <button
                          className={cn(secondaryBtn, "flex-[1.35]")}
                          disabled={slackStatus === "sending"}
                          onClick={onSlackSend}
                          type="button"
                        >
                          {slackStatus === "sending" ? (
                            <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                          ) : (
                            <Send className="size-4 shrink-0" aria-hidden="true" />
                          )}
                          <span className="truncate">
                            {slackStatus === "sending" ? copy.reportSlackSending : copy.reportSlackSend}
                          </span>
                        </button>
                      </div>
                      <button
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[14px] font-extrabold tracking-[-0.01em] text-primary-foreground transition-opacity active:opacity-90"
                        onClick={onCopy}
                        type="button"
                      >
                        <Copy className="size-[17px] shrink-0" aria-hidden="true" />
                        {copied ? copy.reportCopied : copy.reportCopy}
                      </button>
                    </div>
                  </div>
                )}
    </BottomSheet>
  );
}
