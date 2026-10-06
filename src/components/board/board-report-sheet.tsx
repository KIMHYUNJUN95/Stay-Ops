"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

export type BoardReportReasonCode = "spam" | "harassment" | "inappropriate" | "privacy" | "other";

export type BoardReportSheetCopy = Pick<
  Dictionary["board"],
  | "reportTitle"
  | "reportBodyPost"
  | "reportBodyComment"
  | "reasonSpam"
  | "reasonHarassment"
  | "reasonInappropriate"
  | "reasonPrivacy"
  | "reasonOther"
  | "reportNotePlaceholder"
  | "reportSubmit"
>;

export function boardReasonLabel(
  copy: Pick<BoardReportSheetCopy, "reasonSpam" | "reasonHarassment" | "reasonInappropriate" | "reasonPrivacy" | "reasonOther">,
  code: BoardReportReasonCode,
) {
  return {
    spam: copy.reasonSpam,
    harassment: copy.reasonHarassment,
    inappropriate: copy.reasonInappropriate,
    privacy: copy.reasonPrivacy,
    other: copy.reasonOther,
  }[code];
}

const REASONS: BoardReportReasonCode[] = ["spam", "harassment", "inappropriate", "privacy", "other"];

/**
 * 게시판 글 · 댓글 신고 시트 (2026-10-06). 사유 하나(필수) + 메모(선택). 제출은 부모가 서버 액션으로 한다 —
 * 앱 스토어 UGC 요건(신고 수단). 문서: docs/product/23-board-workflow.md → 「신고 · 차단」.
 */
export function BoardReportSheet({
  targetType,
  copy,
  pending,
  onClose,
  onSubmit,
}: {
  targetType: "post" | "comment";
  copy: BoardReportSheetCopy;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: BoardReportReasonCode, note: string) => void;
}) {
  const [reason, setReason] = useState<BoardReportReasonCode | null>(null);
  const [note, setNote] = useState("");

  return (
    <BottomSheet onClose={onClose} ariaLabel={copy.reportTitle}>
      <div className="pt-1">
        <p className="text-[16px] font-black tracking-[-0.01em] text-foreground">{copy.reportTitle}</p>
        <p className="mt-1 text-[12.5px] font-semibold leading-[1.5] text-muted-foreground">
          {targetType === "post" ? copy.reportBodyPost : copy.reportBodyComment}
        </p>
        <div className="mt-3 flex flex-col" role="radiogroup" aria-label={copy.reportTitle}>
          {REASONS.map((code) => (
            <button
              aria-checked={reason === code}
              className="flex h-[48px] items-center gap-3 border-b border-border/60 px-1 text-left last:border-0"
              key={code}
              onClick={() => setReason(code)}
              role="radio"
              type="button"
            >
              <span
                className={cn(
                  "inline-flex size-[20px] shrink-0 items-center justify-center rounded-full border-2",
                  reason === code ? "border-primary" : "border-border",
                )}
              >
                {reason === code && <span className="size-[10px] rounded-full bg-primary" />}
              </span>
              <span className="text-[14px] font-bold text-foreground">{boardReasonLabel(copy, code)}</span>
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 min-h-[76px] w-full resize-none rounded-[12px] border border-border bg-background px-3 py-2.5 text-[13.5px] font-medium outline-none focus:border-primary"
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.reportNotePlaceholder}
          value={note}
        />
        <button
          className="mt-3 h-[52px] w-full rounded-[14px] bg-[hsl(4_72%_52%)] text-[14.5px] font-extrabold text-white disabled:opacity-50"
          disabled={!reason || pending}
          onClick={() => reason && onSubmit(reason, note)}
          type="button"
        >
          {copy.reportSubmit}
        </button>
      </div>
    </BottomSheet>
  );
}
