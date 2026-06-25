import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function BoardListRow({
  title,
  category,
  authorName,
  timeLabel,
  commentCount,
  isPinned = false,
  isUnread = false,
  pinnedBadge,
  unreadAria,
  onClick,
}: {
  id: string;
  title: string;
  category: string | null;
  authorName: string;
  timeLabel: string;
  commentCount: number;
  isPinned?: boolean;
  isUnread?: boolean;
  pinnedBadge: string;
  unreadAria: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-start gap-3",
        isPinned
          ? "mx-[-18px] border-b border-border bg-primary/[0.07] px-5 py-[15px]"
          : "border-b border-border/60 px-0.5 py-[15px]",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {/* 작성자 이니셜 아바타 */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/[0.12]">
        <span className="text-[13px] font-extrabold text-primary">
          {authorName.charAt(0)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* 제목 행: 뱃지 + 안읽음 dot + 제목 */}
          <div className="flex items-center gap-[7px]">
            {isPinned && (
              <span className="shrink-0 rounded-[6px] bg-[hsl(40_78%_92%)] px-[7px] py-[2px] text-[10.5px] font-black text-[hsl(38_72%_42%)]">
                {pinnedBadge}
              </span>
            )}
            {category && (
              <span className="shrink-0 rounded-[6px] bg-primary/[0.09] px-[7px] py-[2px] text-[10.5px] font-black text-primary">
                {category}
              </span>
            )}
            {isUnread && (
              <span
                className="size-[7px] shrink-0 rounded-full bg-primary"
                aria-label={unreadAria}
              />
            )}
            <span
              className={cn(
                "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] leading-[1.35] tracking-[-0.01em] text-foreground",
                isUnread ? "font-extrabold" : "font-bold",
              )}
            >
              {title}
            </span>
          </div>

          {/* 메타 행 */}
          <p className="mt-[5px] text-[11.5px] font-semibold text-muted-foreground">
            {authorName} · {timeLabel}
          </p>
        </div>

        {/* 댓글 수 */}
        {commentCount > 0 && (
          <div className="inline-flex shrink-0 items-center gap-1 pt-[1px] text-xs font-extrabold text-muted-foreground">
            <MessageCircle className="size-[15px]" aria-hidden="true" />
            {commentCount}
          </div>
        )}
      </div>
    </div>
  );
}
