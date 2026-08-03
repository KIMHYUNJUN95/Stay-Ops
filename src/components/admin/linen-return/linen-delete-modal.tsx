"use client";

// Admin 린넨 반품 콘솔 — 삭제 확인 모달. 삭제는 MVP hard delete 이고 되돌릴 수 없으므로
// 공용 파괴적 작업 패턴(.cfhead/.cficon--dispose/.cfrec/.stnote--expired/.btn--danger)을 그대로 쓴다.
// See CLAUDE.md §9 (되돌릴 수 없는 작업은 확인 UX 유지).

import { Layers, ShieldCheck, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import type { AdminLinenRecordVM } from "@/lib/admin-linen-returns";
import { fmtDateTime, summaryFullOf, tpl } from "./linen-console-data";
import type { LinenCopy } from "./linen-record-list";

type Props = {
  record: AdminLinenRecordVM;
  t: LinenCopy["console"];
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LinenDeleteModal({ record, t, pending, onCancel, onConfirm }: Props) {
  return (
    <>
      <div className="modal-scrim on" onClick={pending ? undefined : onCancel} />
      <div className="modal on" role="dialog" aria-modal="true" style={{ width: 496 }}>
        <div className="modal__h">
          <div>
            <div className="modal__kicker">{t.dKicker}</div>
          </div>
          <button
            aria-label={t.close}
            className="panel__x"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="modal__body">
          <div className="cfhead">
            <div className="cficon cficon--dispose">
              <span className="ic">
                <Trash2 aria-hidden="true" />
              </span>
            </div>
            <div>
              <div className="cfbody-t">{t.dTitle}</div>
              <div className="cfbody-s">
                {tpl(t.dSub, { kinds: record.lines.length, qty: record.totalQuantity })}
              </div>
            </div>
          </div>

          <div className="cfrec">
            <span className="cfrec__ic">
              <span className="ic">
                <Undo2 aria-hidden="true" />
              </span>
            </span>
            <div className="cfrec__b">
              <div className="cfrec__t">{summaryFullOf(record)}</div>
              <div className="cfrec__s">
                {record.shortId} · {record.buildingLabel} · {fmtDateTime(record.registeredAt)} ·{" "}
                {record.registrantName || "—"}
              </div>
            </div>
          </div>

          {/* 이 기록은 "그날 · 그 건물 · 그 등록자" 제출이 합쳐진 헤더다(문서 §2 자동 합산).
              한 행 삭제 = 그날 제출 전체 삭제이므로 범위를 먼저 알린다. */}
          <div className="stnote" style={{ marginTop: 12 }}>
            <span className="stnote__ic">
              <span className="ic">
                <Layers aria-hidden="true" />
              </span>
            </span>
            <div>
              <div className="stnote__s">{t.dScopeNote}</div>
            </div>
          </div>

          <div className="stnote stnote--expired" style={{ marginTop: 12 }}>
            <span className="stnote__ic">
              <span className="ic">
                <TriangleAlert aria-hidden="true" />
              </span>
            </span>
            <div>
              <div className="stnote__t">{t.dWarnT}</div>
              <div className="stnote__s">{t.dWarnS}</div>
            </div>
          </div>
        </div>

        <div className="modal__foot">
          <span className="modal__foot-note is-danger">
            <span className="ic">
              <ShieldCheck aria-hidden="true" />
            </span>
            {t.dFootNote}
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button className="btn btn--ghost" disabled={pending} onClick={onCancel} type="button">
              {t.cancel}
            </button>
            <button className="btn btn--danger" disabled={pending} onClick={onConfirm} type="button">
              <span className="ic">
                <Trash2 aria-hidden="true" />
              </span>
              {t.delete}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
