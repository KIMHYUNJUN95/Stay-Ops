"use client";

// 수동 컴플레인 삭제 확인 — 공용 `BottomSheet` 규격 (목업 2j).
//
// v1 은 중앙 모달이었으나 CLAUDE.md §3 상 **모든 슬라이드업 표면은 공용 BottomSheet** 다.
// 스크림·핸들·드래그 닫기·Esc 는 전부 그 컴포넌트가 담당하고, 여기서는 내용만 그린다.
//
// 컴플레인 본체는 MVP hard delete 라 되돌릴 수 없다 — 그래서 확인 UX 를 유지한다(§9).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { CIc, CxIcon } from "./cx-icons";
import { deleteComplaintAction } from "@/app/mobile/complaints/actions";

export type DeleteSheetLabels = {
  title: string;
  body: string;
  linkedNote: string;
  cancel: string;
  confirm: string;
  failed: string;
};

export function ComplaintDeleteSheet({
  complaintId,
  complaintTitle,
  labels,
  onClose,
}: {
  complaintId: string;
  complaintTitle: string;
  labels: DeleteSheetLabels;
  onClose: () => void;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete(close: () => void) {
    setFailed(false);
    startTransition(async () => {
      const result = await deleteComplaintAction(complaintId);
      if ("error" in result) {
        setFailed(true);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <BottomSheet ariaLabel={labels.title} onClose={onClose}>
      {({ close }) => (
        <div className="cx cx-delsheet">
          <div className="cx-delsheet__head">
            <span className="cx-delsheet__ic">
              <CIc>{CxIcon.warn}</CIc>
            </span>
            <h3>{labels.title}</h3>
            <p>{labels.body}</p>
          </div>

          {/* 무엇을 지우는지 다시 보여 준다 — 시트가 올라온 뒤 대상이 안 보이면 오삭제가 난다. */}
          <div className="cx-delsheet__target">{complaintTitle}</div>

          <div className="cx-delsheet__note">
            <CIc>{CxIcon.info}</CIc>
            <span>{labels.linkedNote}</span>
          </div>

          {failed && <p className="cx-delsheet__err">{labels.failed}</p>}

          <div className="cx-delsheet__acts">
            <button type="button" className="cx-delsheet__cancel" onClick={close} disabled={isPending}>
              {labels.cancel}
            </button>
            <button
              type="button"
              className="cx-delsheet__go"
              onClick={() => handleDelete(close)}
              disabled={isPending}
            >
              <CIc>{CxIcon.trash}</CIc>
              {labels.confirm}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
