"use client";

// Admin 공지 관리 콘솔 — 운영 액션 확인 모달 (게시 / 재게시 / 보관 / 초안 복귀 / 삭제).
// Ported from the Claude Design handoff (announce-views.js → confirmModal). Reuses the
// shared .modal / .cfhead / .cficon / .cfrec confirm shell. See docs/product/11-announcement-workflow.md.
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import {
  Archive,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AdminAnnouncementVM } from "@/lib/admin-announcements";
import {
  AnnCopy,
  Ic,
  RoleLabel,
  StatusPill,
  targetLabel,
  tpl,
} from "./announcements-console-shared";
import type { AnnActionKind } from "./announcement-detail-panel";

type ConfirmProps = {
  kind: AnnActionKind;
  item: AdminAnnouncementVM;
  t: AnnCopy;
  roleLabel: RoleLabel;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (kind: AnnActionKind, id: string) => void;
};

type Meta = {
  kicker: string;
  title: string;
  sub: string;
  icon: ReactNode;
  icBg: string;
  btn: string;
  btnCls: string;
  btnIcon: ReactNode;
  danger?: boolean;
};

export function AnnouncementConfirmModal({
  kind,
  item,
  t,
  roleLabel,
  pending,
  onCancel,
  onConfirm,
}: ConfirmProps) {
  const modalRef = useAdminPanelA11y<HTMLDivElement>(onCancel, { disabled: pending });

  const metaByKind: Record<AnnActionKind, Meta> = {
    publish: {
      kicker: t.cPublishKicker,
      title: t.cPublishT,
      sub: tpl(t.cPublishS, item.targetTotal),
      icon: <Send aria-hidden="true" />,
      icBg: "cficon--publish",
      btn: t.cPublishBtn,
      btnCls: "btn--donesolid",
      btnIcon: <Send aria-hidden="true" />,
    },
    republish: {
      kicker: t.cRepublishKicker,
      title: t.cRepublishT,
      sub: tpl(t.cRepublishS, item.targetTotal),
      icon: <Send aria-hidden="true" />,
      icBg: "cficon--publish",
      btn: t.cRepublishBtn,
      btnCls: "btn--donesolid",
      btnIcon: <Send aria-hidden="true" />,
    },
    archive: {
      kicker: t.cArchiveKicker,
      title: t.cArchiveT,
      sub: t.cArchiveS,
      icon: <Archive aria-hidden="true" />,
      icBg: "cficon--archive",
      btn: t.cArchiveBtn,
      btnCls: "btn--violsolid",
      btnIcon: <Archive aria-hidden="true" />,
    },
    revert: {
      kicker: t.cRevertKicker,
      title: t.cRevertT,
      sub: t.cRevertS,
      icon: <Sparkles aria-hidden="true" />,
      icBg: "cficon--revert",
      btn: t.cRevertBtn,
      btnCls: "btn--pri",
      btnIcon: <Sparkles aria-hidden="true" />,
    },
    del: {
      kicker: t.cDelKicker,
      title: t.cDelT,
      sub: t.cDelS,
      icon: <Trash2 aria-hidden="true" />,
      icBg: "cficon--del",
      btn: t.cDelBtn,
      btnCls: "btn--danger",
      btnIcon: <Trash2 aria-hidden="true" />,
      danger: true,
    },
  };
  const meta = metaByKind[kind];

  return (
    <>
      <div className="modal-scrim on" onClick={pending ? undefined : onCancel} />
      <div
        ref={modalRef}
        className="modal on"
        style={{ width: 472 }}
        role="dialog"
        aria-modal="true"
        aria-label={meta.kicker}
        tabIndex={-1}
      >
        <div className="modal__h">
          <div>
            <div className="modal__kicker">{meta.kicker}</div>
          </div>
          <button
            type="button"
            className="panel__x"
            onClick={onCancel}
            aria-label={t.fCancel}
            disabled={pending}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="modal__body">
          <div className="cfhead">
            <div className={`cficon ${meta.icBg}`}>
              <Ic>{meta.icon}</Ic>
            </div>
            <div>
              <div className="cfbody-t">{meta.title}</div>
              <div className="cfbody-s">{meta.sub}</div>
            </div>
          </div>
          <div className="cfrec">
            <span className="cfrec__ic">
              <Ic>
                <ShieldCheck aria-hidden="true" />
              </Ic>
            </span>
            <div className="cfrec__b">
              <div className="cfrec__t">{item.title}</div>
              <div className="cfrec__s">
                {targetLabel(item, t, roleLabel)}
                {item.isImportant ? ` · ${t.flImportant}` : ""}
                {item.authorName ? ` · ${item.authorName}` : ""}
              </div>
            </div>
            <StatusPill status={item.status} t={t} />
          </div>
        </div>
        <div className="modal__foot">
          <span className={`modal__foot-note${meta.danger ? " is-danger" : ""}`}>
            <Ic>
              <ShieldCheck aria-hidden="true" />
            </Ic>
            {t.cFootNote}
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onCancel}
              disabled={pending}
            >
              {t.fCancel}
            </button>
            <button
              type="button"
              className={`btn ${meta.btnCls}`}
              onClick={() => onConfirm(kind, item.id)}
              disabled={pending}
            >
              <Ic>{meta.btnIcon}</Ic>
              {meta.btn}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
