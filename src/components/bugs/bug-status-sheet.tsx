"use client";

import { BottomSheet } from "@/components/shell/bottom-sheet";
import { BugStatusBadge } from "@/components/bugs/bug-status-badge";
import { bugStatusLabel, type BugCopy, type BugStatus } from "@/components/bugs/bug-types";

const ALL_STATUSES: BugStatus[] = ["submitted", "reviewing", "fixed", "closed"];

type Props = {
  copy: BugCopy;
  currentStatus: BugStatus;
  onSelect: (status: BugStatus) => void;
  onClose: () => void;
};

export function BugStatusSheet({ copy, currentStatus, onSelect, onClose }: Props) {
  return (
    <BottomSheet onClose={onClose} ariaLabel={copy.statusChangeSheetTitle}>
      <div className="mb-[6px] text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
        {copy.statusChangeSheetTitle}
      </div>
      <div className="flex flex-col gap-[2px] pb-[8px]">
        {ALL_STATUSES.map((status) => {
          const isCurrent = status === currentStatus;
          return (
            <button
              key={status}
              type="button"
              onClick={() => {
                if (!isCurrent) onSelect(status);
                else onClose();
              }}
              className="flex items-center justify-between rounded-[12px] px-[4px] py-[12px] text-left active:bg-[hsl(222_10%_96%)]"
            >
              <span
                className={
                  isCurrent
                    ? "text-[15px] font-extrabold text-foreground"
                    : "text-[15px] font-semibold text-foreground"
                }
              >
                {bugStatusLabel(copy, status)}
              </span>
              <BugStatusBadge status={status} size="md" label={bugStatusLabel(copy, status)} />
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
