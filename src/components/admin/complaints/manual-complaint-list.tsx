"use client";

// 수동 컴플레인 목록 — 행 표시 + 삭제(확인 모달). 컴플레인 본체는 MVP hard delete이고 되돌릴 수
// 없으므로 공용 파괴적 작업 패턴(.modal / .btn--danger)과 확인 UX를 쓴다 (CLAUDE.md §9, 문서 25 §164).
// 행별 삭제 버튼 노출은 "작성자 본인 또는 조정 권한"일 때만. 실제 권한은 deleteComplaint가 서버에서
// 다시 검증하므로 UI 게이트는 노출 판단용일 뿐이다.

import { useEffect, useState, useTransition } from "react";
import { ShieldAlert, Trash2, X } from "lucide-react";
import { deleteComplaintAction } from "@/app/admin/complaints/actions";
import type { Complaint } from "@/lib/complaints";
import type { Dictionary } from "@/lib/i18n";

type Props = {
  complaints: Complaint[];
  currentUserId: string;
  canModerate: boolean;
  copy: Dictionary["complaints"];
};

export function ManualComplaintList({ complaints, currentUserId, canModerate, copy }: Props) {
  const [target, setTarget] = useState<Complaint | null>(null);
  const [pending, startTransition] = useTransition();

  // Esc 로 닫기 — 진행 중에는 무시(공용 모달 관례).
  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, pending]);

  function confirmDelete() {
    if (!target) return;
    const form = new FormData();
    form.set("complaintId", target.id);
    startTransition(async () => {
      await deleteComplaintAction(form);
      setTarget(null);
    });
  }

  return (
    <>
      {complaints.map((complaint) => {
        const canDelete = canModerate || complaint.createdByUserId === currentUserId;
        return (
          <div className="cxrow" key={complaint.id}>
            <div className="cxmain">
              <div className="cxtop">
                <span className="cxttl">{complaint.title}</span>
                <span className={complaint.status === "open" ? "rchip review" : "rchip done"}>
                  {complaint.status === "open" ? copy.statusOpen : copy.statusDone}
                </span>
              </div>
              <div className="cxmeta">
                <span className="rchip void">{complaint.platform}</span>
                <span>
                  {complaint.propertyName ?? "—"}
                  {complaint.roomLabel ? ` · ${complaint.roomLabel}` : ""}
                </span>
                <span className="cxdot" />
                <span>{complaint.createdAt.slice(0, 10)}</span>
                <span className="cxdot" />
                <span>{complaint.authorName}</span>
              </div>
            </div>
            {canDelete ? (
              <button
                type="button"
                className="cxrowdel"
                aria-label={copy.deleteAction}
                title={copy.deleteAction}
                onClick={() => setTarget(complaint)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}

      {target ? (
        <>
          <div
            className="modal-scrim on"
            onClick={pending ? undefined : () => setTarget(null)}
          />
          <div className="modal on" role="dialog" aria-modal="true" style={{ width: 440 }}>
            <div className="modal__h">
              <div className="modal__kicker">{copy.deleteKicker}</div>
              <button
                type="button"
                className="panel__x"
                aria-label={copy.cancel}
                disabled={pending}
                onClick={() => setTarget(null)}
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="modal__body">
              <div className="cxdelhead">
                <span className="cxdelhead__ic">
                  <Trash2 aria-hidden="true" />
                </span>
                <div>
                  <div className="cxdelhead__t">{copy.deleteTitle}</div>
                  <div className="cxdelhead__s">{target.title}</div>
                </div>
              </div>
              <div className="cxdelwarn">
                <span className="cxdelwarn__ic">
                  <ShieldAlert aria-hidden="true" />
                </span>
                <span>{copy.deleteBody}</span>
              </div>
            </div>

            <div className="modal__foot">
              <div style={{ display: "flex", gap: 9, marginLeft: "auto" }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={pending}
                  onClick={() => setTarget(null)}
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={pending}
                  onClick={confirmDelete}
                >
                  <span className="ic">
                    <Trash2 aria-hidden="true" />
                  </span>
                  {copy.deleteConfirm}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
