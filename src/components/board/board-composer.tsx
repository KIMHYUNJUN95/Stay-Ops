"use client";
import { useState } from "react";
import { Camera, Send } from "lucide-react";
import { BoardAvatar } from "@/components/board/board-avatar";
import { cn } from "@/lib/utils";
import type { BoardDictionary } from "@/lib/board-i18n";

export function BoardComposer({
  myInitial = "나",
  copy,
}: {
  myInitial?: string;
  copy: Pick<BoardDictionary, "commentPlaceholder" | "commentAttachPhoto" | "commentSend">;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <div className="shrink-0 flex items-center gap-[9px] border-t border-border bg-background px-[14px] py-[11px] pb-[calc(11px+env(safe-area-inset-bottom,0px))]">
      <BoardAvatar initial={myInitial} size={32} />
      <div
        className={cn(
          "flex flex-1 items-center gap-2 h-[42px] rounded-full border bg-surface pl-[14px] pr-[6px]",
          focused
            ? "border-primary shadow-[0_0_0_3px_hsl(223_46%_32%/0.12)]"
            : "border-border",
        )}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={copy.commentPlaceholder}
          className="flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-[hsl(222_10%_62%)]"
        />
        <button
          type="button"
          className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-muted-foreground"
          aria-label={copy.commentAttachPhoto}
        >
          <Camera className="size-[19px]" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        aria-label={copy.commentSend}
        className="inline-flex size-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(223_50%_42%)] to-[hsl(223_54%_22%)] text-white shadow-[0_10px_20px_-10px_hsl(223_46%_32%/0.6)]"
      >
        <Send className="size-[19px]" aria-hidden="true" />
      </button>
    </div>
  );
}
