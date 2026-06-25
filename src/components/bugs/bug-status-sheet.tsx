"use client";

import { BottomSheet } from "@/components/shell/bottom-sheet";
import { BugStatusBadge } from "@/components/bugs/bug-status-badge";
import type { BugStatus } from "@/components/bugs/bug-types";

const ALL_STATUSES: BugStatus[] = ["submitted", "reviewing", "fixed", "closed"];

// TODO i18n: 상태 라벨은 bug-status-badge와 동일하게 유지
const STATUS_LABEL: Record<BugStatus, string> = {
  submitted: "접수",
  reviewing: "검토 중",
  fixed: "수정 완료",
  closed: "종료",
};

type Props = {
  currentStatus: BugStatus;
  onSelect: (status: BugStatus) => void;
  onClose: () => void;
};

export function BugStatusSheet({ currentStatus, onSelect, onClose }: Props) {
  return (
    <BottomSheet onClose={onClose} ariaLabel="상태 변경">
      {/* TODO i18n: 시트 헤더 */}
      <div className="mb-[6px] text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
        상태 변경
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
                {STATUS_LABEL[status]}
              </span>
              <BugStatusBadge status={status} size="md" />
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
