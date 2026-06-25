"use client";

import type { ReactNode } from "react";
import { Pencil, Pin, PinOff, Share2, Trash2 } from "lucide-react";
import { BottomSheet, useBottomSheetClose } from "@/components/shell/bottom-sheet";
import { cn } from "@/lib/utils";

type ActionVariant = "default" | "primary" | "danger";

function ActionRow({
  icon,
  label,
  variant = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  variant?: ActionVariant;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[54px] w-full items-center gap-[14px] border-b border-border/60 px-1 text-left last:border-0"
    >
      <span
        className={cn(
          "inline-flex size-[38px] shrink-0 items-center justify-center rounded-[11px]",
          variant === "primary" && "bg-primary/[0.12] text-primary",
          variant === "danger" &&
            "bg-[hsl(6_70%_95.5%)] text-[hsl(4_62%_46%)]",
          variant === "default" &&
            "bg-[hsl(40_22%_90%)] text-[hsl(222_20%_28%)]",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[14.5px] font-bold",
          variant === "primary" && "text-primary",
          variant === "danger" && "text-[hsl(4_62%_46%)]",
          variant === "default" && "text-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function ActionSheetContent({
  isOwn,
  isPinned,
  onEdit,
  onPin,
  onShare,
  onDelete,
}: {
  isOwn: boolean;
  isPinned: boolean;
  onEdit?: () => void;
  onPin?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
}) {
  const close = useBottomSheetClose();

  return (
    <div className="pt-1">
      <div className="flex flex-col">
        {isOwn && (
          <ActionRow
            icon={<Pencil className="size-[19px]" />}
            label="글 수정"
            onClick={onEdit ?? close}
          />
        )}
        <ActionRow
          icon={
            isPinned ? (
              <PinOff className="size-[19px]" />
            ) : (
              <Pin className="size-[19px]" />
            )
          }
          label={isPinned ? "고정 해제" : "상단 고정"}
          variant="primary"
          onClick={onPin ?? close}
        />
        <ActionRow
          icon={<Share2 className="size-[19px]" />}
          label="공유"
          onClick={onShare ?? close}
        />
        {isOwn && (
          <ActionRow
            icon={<Trash2 className="size-[19px]" />}
            label="글 삭제"
            variant="danger"
            onClick={onDelete ?? close}
          />
        )}
      </div>
      <button
        type="button"
        onClick={close}
        className="mt-[10px] h-[52px] w-full rounded-[14px] border border-border bg-background text-[14.5px] font-extrabold text-[hsl(222_20%_28%)]"
      >
        취소
      </button>
    </div>
  );
}

export function BoardActionSheet({
  isOwn,
  isPinned,
  onClose,
  onEdit,
  onPin,
  onShare,
  onDelete,
}: {
  isOwn: boolean;
  isPinned: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onPin?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <ActionSheetContent
        isOwn={isOwn}
        isPinned={isPinned}
        onEdit={onEdit}
        onPin={onPin}
        onShare={onShare}
        onDelete={onDelete}
      />
    </BottomSheet>
  );
}