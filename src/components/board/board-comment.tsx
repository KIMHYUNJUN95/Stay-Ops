"use client";
import { BoardAvatar } from "@/components/board/board-avatar";
import type { AvatarColor } from "@/components/board/board-types";
import type { BoardDictionary } from "@/lib/board-i18n";

export type CommentData = {
  id: string;
  authorName: string;
  authorInitial: string;
  avatarColor: AvatarColor;
  role?: string;
  timeLabel: string;
  content: string;
  imageLabel?: string;
  reaction?: { emoji: string; count: number };
  isOwn?: boolean;
};

export function BoardComment({
  comment,
  isLast = false,
  onDelete,
  copy,
}: {
  comment: CommentData;
  isLast?: boolean;
  onDelete?: (id: string) => void;
  copy: Pick<BoardDictionary, "commentDelete">;
}) {
  return (
    <div
      className={`flex gap-[10px] py-[13px] ${!isLast ? "border-b border-border/60" : ""}`}
    >
      <BoardAvatar
        initial={comment.authorInitial}
        color={comment.avatarColor}
        size={32}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[7px]">
          <span className="text-[13px] font-extrabold tracking-[-0.01em]">
            {comment.authorName}
          </span>
          {comment.role && (
            <span className="rounded-full bg-primary/[0.09] px-[6px] py-[1px] text-[10px] font-bold text-primary">
              {comment.role}
            </span>
          )}
          <span className="text-[11px] font-semibold text-[hsl(222_10%_62%)]">
            {comment.timeLabel}
          </span>
          {comment.isOwn && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="ml-auto text-[11px] font-extrabold text-[hsl(4_62%_46%)] px-1 py-0.5"
            >
              {copy.commentDelete}
            </button>
          )}
        </div>
        <div className="mt-[3px] text-[13px] font-medium leading-[1.6] text-[hsl(222_20%_28%)]">
          {comment.content}
        </div>
        {comment.imageLabel && (
          <div className="mt-[9px]">
            <div className="w-[132px] h-[96px] rounded-[10px] border border-border bg-[repeating-linear-gradient(135deg,hsl(40_22%_90%)_0_11px,hsl(40_26%_87%)_11px_22px)] flex items-center justify-center">
              <span className="font-mono text-[10px] font-bold text-[hsl(222_10%_62%)]">
                {comment.imageLabel}
              </span>
            </div>
          </div>
        )}
        {comment.reaction && (
          <span className="mt-[9px] inline-flex items-center gap-[5px] h-[26px] rounded-full border border-border bg-background px-[9px] text-[11.5px] font-extrabold text-[hsl(222_20%_28%)]">
            <span className="text-[13px] leading-none">{comment.reaction.emoji}</span>
            {comment.reaction.count}
          </span>
        )}
      </div>
    </div>
  );
}
