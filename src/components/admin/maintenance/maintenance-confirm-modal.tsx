"use client";

// Admin 수리·점검 console — 예외 개입 확인 모달 (강제 완료 / 무효 처리 / 삭제).
// 세 액션이 같은 껍데기를 쓰고 아이콘·문구·확인 버튼 톤만 달라진다. Mirrors maint-views.js modal().
import { useState } from "react";
import { Ban, Lock, ShieldCheck, Trash2, X } from "lucide-react";
import type { AdminMaintenanceReport } from "@/lib/admin-maintenance";
import { locationLabel } from "./maintenance-console-data";
import { CATEGORY_ICON, PriorityBadge, type MaintCopy } from "./maintenance-console-shared";
import type { MaintExceptionKind } from "./maintenance-detail-panel";

type ConfirmModalProps = {
  kind: MaintExceptionKind;
  report: AdminMaintenanceReport;
  t: MaintCopy;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (kind: MaintExceptionKind, id: string, memo: string) => void;
};

const KIND_META = {
  force: {
    Icon: Lock,
    kicker: "cfKickerForce",
    title: "cfTitleForce",
    body: "cfBodyForce",
    confirm: "cfForce",
    foot: "cfFootForce",
    btn: "btn--pri",
    icCls: "cficon--force",
    footCls: "",
  },
  void: {
    Icon: Ban,
    kicker: "cfKickerVoid",
    title: "cfTitleVoid",
    body: "cfBodyVoid",
    confirm: "cfVoid",
    foot: "cfFootVoid",
    btn: "btn--warnsolid",
    icCls: "cficon--void",
    footCls: "",
  },
  del: {
    Icon: Trash2,
    kicker: "cfKickerDel",
    title: "cfTitleDel",
    body: "cfBodyDel",
    confirm: "cfDel",
    foot: "cfFootDel",
    btn: "btn--danger",
    icCls: "cficon--del",
    footCls: "is-danger",
  },
} as const;

export function MaintenanceConfirmModal({
  kind,
  report,
  t,
  pending,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [memo, setMemo] = useState("");
  const meta = KIND_META[kind];
  const { Icon } = meta;
  const CatIcon = CATEGORY_ICON[report.category];

  return (
    <>
      <div className="modal-scrim on" onClick={onCancel} />
      <div className="modal on" style={{ width: 480 }}>
        <div className="modal__h">
          <div>
            <div className="modal__kicker">{t[meta.kicker]}</div>
          </div>
          <button type="button" className="panel__x" onClick={onCancel} aria-label={t.cfCancel}>
            <X />
          </button>
        </div>
        <div className="modal__body">
          <div className="cfhead">
            <div className={`cficon ${meta.icCls}`}>
              <span className="ic">
                <Icon aria-hidden="true" />
              </span>
            </div>
            <div>
              <div className="cfbody-t">{t[meta.title]}</div>
              <div className="cfbody-s">{t[meta.body]}</div>
            </div>
          </div>

          <div className="cfrec">
            <span className="cfrec__ic">
              <span className="ic">
                <CatIcon aria-hidden="true" />
              </span>
            </span>
            <div className="cfrec__b">
              <div className="cfrec__t">{report.title}</div>
              <div className="cfrec__s">
                {report.shortId} · {locationLabel(report, t.buildingOnly)}
              </div>
            </div>
            <PriorityBadge priority={report.priority} t={t} />
          </div>

          <div className="fld" style={{ marginTop: 14 }}>
            <label className="fld__l">{t.cfMemo}</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.cfMemoPh} />
          </div>
        </div>
        <div className="modal__foot">
          <span className={`modal__foot-note ${meta.footCls}`}>
            <ShieldCheck className="ic" aria-hidden="true" />
            {t[meta.foot]}
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
              {t.cfCancel}
            </button>
            <button
              type="button"
              className={`btn ${meta.btn}`}
              disabled={pending}
              onClick={() => onConfirm(kind, report.id, memo)}
            >
              <Icon className="ic" aria-hidden="true" />
              {t[meta.confirm]}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
