"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MoveRight, Trash2 } from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import {
  deleteApplication,
  saveApplicationNote,
  setApplicationStatus,
} from "@/app/admin/recruit/actions";
import type { Dictionary } from "@/lib/i18n";
import type { ApplicationDetail } from "@/lib/recruit/applications";
import { nextStatusOf, prevStatusOf } from "@/lib/recruit/status";

/**
 * 상세 패널의 대화형 부분 — 연락처 마스킹 토글, 검토 메모, 하단 액션 바.
 *
 * 패널 자체는 서버 컴포넌트라 여기만 클라이언트로 갈라 둔다(`ComplaintDetailPanel` 과 같은 구성).
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

/**
 * 전화번호를 가운데만 가린다. 뒤 4자리는 남긴다 — 목록 검색이 「전화번호 뒤 4자리」로 찾는
 * 방식이고, 본인 확인 통화에서도 뒷자리를 대조하기 때문이다.
 */
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5) return "•".repeat(value.length);
  return `${digits.slice(0, 3)}-••••-${digits.slice(-4)}`;
}

function maskId(value: string): string {
  if (value.length <= 4) return "•".repeat(value.length);
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}

/** 주소는 시·구까지만 남긴다. 번지는 검토에 쓰이지 않는다. */
function maskAddress(value: string): string {
  const head = value.split(/[\s,]+/).slice(0, 2).join(" ");
  return head || value.slice(0, 6);
}

export function RecruitContactBlock({
  application,
  copy,
}: {
  application: ApplicationDetail;
  copy: Dictionary["recruit"];
}) {
  // 기본은 가림. 어깨너머 노출을 줄이고, 본 사람이 스스로 열게 한다.
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="pblock">
      <div className="pblock__t" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {copy.sectionBasic}
        <button
          type="button"
          className="linkmore"
          style={{ marginLeft: "auto" }}
          onClick={() => setRevealed((prev) => !prev)}
        >
          {revealed ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
          {revealed ? copy.hideContact : copy.revealContact}
        </button>
      </div>
      <div className="rckv">
        <span className="rckv__k">{copy.labelPhone}</span>
        <span className="rckv__v rckv__v--mono">
          {application.phone ? (revealed ? application.phone : maskPhone(application.phone)) : "—"}
        </span>
        <span className="rckv__k">{copy.labelKakao}</span>
        <span className="rckv__v rckv__v--mono">
          {application.kakaoId ? (revealed ? application.kakaoId : maskId(application.kakaoId)) : "—"}
        </span>
        <span className="rckv__k">{copy.labelAddress}</span>
        <span className="rckv__v">
          {application.address ? (
            revealed ? (
              application.address
            ) : (
              <>
                {maskAddress(application.address)}{" "}
                <span className="rckv__v--none">{copy.addressHidden}</span>
              </>
            )
          ) : (
            "—"
          )}
        </span>
      </div>
    </div>
  );
}

export function RecruitPanelActions({
  application,
  copy,
  closeHref,
}: {
  application: ApplicationDetail;
  copy: Dictionary["recruit"];
  closeHref: string;
}) {
  const router = useRouter();
  const { toast, showToast, dismiss } = useAdminToast();
  const [note, setNote] = useState(application.reviewNote ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const next = nextStatusOf(application.status);
  const prev = prevStatusOf(application.status);

  function move(to: "next" | "prev") {
    const target = to === "next" ? next : prev;
    if (!target) return;
    startTransition(async () => {
      const result = await setApplicationStatus([application.id], target);
      showToast(result.ok ? copy.statusChanged : copy.actionFailed);
      if (result.ok) router.refresh();
    });
  }

  function persistNote() {
    startTransition(async () => {
      const result = await saveApplicationNote(application.id, note);
      showToast(result.ok ? copy.noteSaved : copy.actionFailed);
      if (result.ok) router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteApplication(application.id);
      if (result.ok) {
        showToast(copy.deleted);
        router.push(closeHref);
        router.refresh();
        return;
      }
      showToast(copy.actionFailed);
      setConfirmingDelete(false);
    });
  }

  return (
    <>
      <div className="pblock">
        <div className="pblock__t">{copy.sectionNote}</div>
        <textarea
          className="rcnoteedit"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={copy.notePlaceholder}
          maxLength={2000}
        />
        <div className="rcfile__acts" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn--subtle btn--sm"
            onClick={persistNote}
            disabled={pending || note === (application.reviewNote ?? "")}
          >
            {copy.noteSave}
          </button>
        </div>
      </div>

      {/* 주 버튼 자리는 항상 오른쪽 끝, 파괴적 액션은 항상 왼쪽 끝 — 위치가 바뀌지 않아야
          반복 처리 시 오조작이 없다. 되돌리기는 여기(상세)에만 있고 벌크에는 없다. */}
      <div className="rcbar">
        <button
          type="button"
          className="btn btn--danger-ghost btn--sm"
          onClick={() => setConfirmingDelete(true)}
          disabled={pending}
        >
          <Trash2 size={13} aria-hidden="true" />
          {copy.actionDelete}
        </button>

        {prev ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => move("prev")}
            disabled={pending}
          >
            {copy.revertTo[prev]}
          </button>
        ) : (
          <span className="rcbar__note">{copy.firstStageNote}</span>
        )}

        <span className="rc__spacer" />

        {next ? (
          <button
            type="button"
            className="btn btn--pri rcbar__cta"
            onClick={() => move("next")}
            disabled={pending}
          >
            {copy.advanceTo[next]}
            <MoveRight size={14} aria-hidden="true" />
          </button>
        ) : (
          <span className="rcbar__note">{copy.lastStageNote}</span>
        )}
      </div>

      {confirmingDelete && (
        <>
          <div className="modal-scrim" onClick={() => setConfirmingDelete(false)} />
          <div className="modal" role="dialog" aria-label={copy.deleteTitle}>
            <div className="modal__h">
              <div className="modal__t">{copy.deleteTitle}</div>
            </div>
            <div className="modal__body">
              {/* 이력서 파일까지 사라진다는 사실을 확인 창에서 분명히 말한다. */}
              {copy.deleteBody}
            </div>
            <div className="modal__foot">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
              >
                {copy.deleteCancel}
              </button>
              <button
                type="button"
                className="btn btn--danger-ghost btn--sm"
                onClick={remove}
                disabled={pending}
              >
                {copy.deleteConfirm}
              </button>
            </div>
          </div>
        </>
      )}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </>
  );
}
