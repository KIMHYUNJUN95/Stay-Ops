"use client";

// Admin 분실물 console — 능동 처리 모달 5종(반환/폐기/보관연장/상태정정/삭제). 같은 껍데기(cfhead +
// cfrec + 필드 + foot)를 쓰고 아이콘·문구·필드·확인 버튼 톤만 달라진다. Mirrors
// maintenance-confirm-modal.tsx, plus lf-design.css의 segradio/stpick/reveal 필드 컴포넌트.
import { useState } from "react";
import {
  ArchiveRestore,
  CalendarPlus,
  Handshake,
  Pencil,
  ShieldCheck,
  Trash2,
  Truck,
  Undo2,
  X,
} from "lucide-react";
import { AdminDatePicker } from "@/components/admin/shared/admin-date-picker";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { AdminLostItemVM } from "@/lib/admin-lost-found";
import type { LostItemStatus, LostReturnMethod } from "@/lib/lost-found-constants";
import { BOARD_ORDER, LOST_STATUS, locationLabel } from "./lost-found-console-data";
import { CATEGORY_ICON, STATUS_ICON, copyOf, localeTagOf, type LFCopy } from "./lost-found-console-shared";
import type { LFActionKind } from "./lost-found-detail-panel";

export type LFActionPayload = {
  memo?: string;
  method?: LostReturnMethod;
  tracking?: string;
  dueDate?: string;
  status?: LostItemStatus;
};

type ActionModalProps = {
  kind: LFActionKind;
  item: AdminLostItemVM;
  t: LFCopy;
  locale: Locale;
  sharedLabels?: Dictionary["admin"]["shared"];
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (kind: LFActionKind, id: string, payload: LFActionPayload) => void;
};

const KIND_META = {
  return: {
    Icon: Undo2,
    kicker: "mrKicker",
    title: "mrTitle",
    body: "mrBody",
    confirm: "mrConfirm",
    foot: "mrFoot",
    btn: "btn--prisolid",
    icCls: "cficon--return",
  },
  dispose: {
    Icon: Trash2,
    kicker: "mdKicker",
    title: "mdTitle",
    body: "mdBody",
    confirm: "mdConfirm",
    foot: "mdFoot",
    btn: "btn--danger",
    icCls: "cficon--dispose",
  },
  extend: {
    Icon: CalendarPlus,
    kicker: "meKicker",
    title: "meTitle",
    body: "meBody",
    confirm: "meConfirm",
    foot: "meFoot",
    btn: "btn--pri",
    icCls: "cficon--extend",
  },
  correct: {
    Icon: Pencil,
    kicker: "mcKicker",
    title: "mcTitle",
    body: "mcBody",
    confirm: "mcConfirm",
    foot: "mcFoot",
    btn: "btn--pri",
    icCls: "cficon--correct",
  },
  restore: {
    Icon: ArchiveRestore,
    kicker: "mrsKicker",
    title: "mrsTitle",
    body: "mrsBody",
    confirm: "mrsConfirm",
    foot: "mrsFoot",
    btn: "btn--pri",
    icCls: "cficon--restore",
  },
  delete: {
    Icon: Trash2,
    kicker: "mxKicker",
    title: "mxTitle",
    body: "mxBody",
    confirm: "mxConfirm",
    foot: "mxFoot",
    btn: "btn--danger",
    icCls: "cficon--del",
  },
} as const;

function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function LostFoundActionModal({
  kind,
  item,
  t,
  locale,
  sharedLabels,
  pending,
  onCancel,
  onConfirm,
}: ActionModalProps) {
  const meta = KIND_META[kind];
  const { Icon } = meta;
  const CatIcon = CATEGORY_ICON[item.category];
  const localeTag = localeTagOf(locale);

  const [memo, setMemo] = useState("");
  const [method, setMethod] = useState<LostReturnMethod>("pickup");
  const [tracking, setTracking] = useState("");
  const [dueDate, setDueDate] = useState(addDaysISO(item.dueDate, 14));
  const [status, setStatus] = useState<LostItemStatus>(item.status === "returned" || item.status === "disposed" ? "registered" : item.status);

  const tomorrowKey = addDaysISO(new Date().toISOString().slice(0, 10), 1);

  function handleConfirm() {
    if (kind === "return") {
      onConfirm(kind, item.id, { method, tracking: method === "delivery" ? tracking : "", memo });
      return;
    }
    if (kind === "extend") {
      onConfirm(kind, item.id, { dueDate, memo });
      return;
    }
    if (kind === "correct") {
      onConfirm(kind, item.id, { status, memo });
      return;
    }
    onConfirm(kind, item.id, { memo });
  }

  const memoLabel =
    kind === "dispose"
      ? t.mdMemo
      : kind === "extend"
        ? t.meMemo
        : kind === "correct"
          ? t.mcMemo
          : kind === "restore"
            ? t.mrsMemo
            : t.cfMemo;
  const memoPh =
    kind === "dispose"
      ? t.mdMemoPh
      : kind === "extend"
        ? t.meMemoPh
        : kind === "correct"
          ? t.mcMemoPh
          : kind === "restore"
            ? t.mrsMemoPh
            : t.cfMemoPh;

  return (
    <>
      <div className="modal-scrim on" onClick={onCancel} />
      <div className="modal on" style={{ width: 496 }}>
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
              <div className="cfrec__t">{item.itemName}</div>
              <div className="cfrec__s">
                {item.shortId} · {locationLabel(item, t.buildingWhole)}
              </div>
            </div>
          </div>

          {kind === "return" ? (
            <>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">{t.mrMethod}</label>
                <div className="segradio">
                  <button
                    type="button"
                    className={`segopt${method === "delivery" ? " on" : ""}`}
                    onClick={() => setMethod("delivery")}
                  >
                    <span className="segopt__ic">
                      <span className="ic">
                        <Truck aria-hidden="true" />
                      </span>
                    </span>
                    <span className="segopt__b">
                      <span className="segopt__t">{t.mrDelivery}</span>
                      <span className="segopt__s">{t.mrDeliveryS}</span>
                    </span>
                    <span className="segopt__rd" />
                  </button>
                  <button
                    type="button"
                    className={`segopt${method === "pickup" ? " on" : ""}`}
                    onClick={() => setMethod("pickup")}
                  >
                    <span className="segopt__ic">
                      <span className="ic">
                        <Handshake aria-hidden="true" />
                      </span>
                    </span>
                    <span className="segopt__b">
                      <span className="segopt__t">{t.mrPickup}</span>
                      <span className="segopt__s">{t.mrPickupS}</span>
                    </span>
                    <span className="segopt__rd" />
                  </button>
                </div>
              </div>
              {method === "delivery" ? (
                <div className="fld reveal" style={{ marginTop: 12 }}>
                  <label className="fld__l">{t.mrTracking}</label>
                  <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={t.mrTrackingPh} />
                </div>
              ) : null}
            </>
          ) : null}

          {kind === "extend" ? (
            <div className="fld" style={{ marginTop: 14 }}>
              <label className="fld__l">{t.meDue}</label>
              <AdminDatePicker
                value={dueDate}
                onChange={setDueDate}
                min={tomorrowKey}
                localeTag={localeTag}
                ariaLabel={t.meDue}
                labels={{
                  prevMonth: sharedLabels?.datePrevMonth ?? "",
                  nextMonth: sharedLabels?.dateNextMonth ?? "",
                  today: sharedLabels?.dateToday ?? "",
                }}
              />
            </div>
          ) : null}

          {kind === "correct" ? (
            <div className="fld" style={{ marginTop: 14 }}>
              <label className="fld__l">{t.mcStatus}</label>
              <div className="stpick">
                {BOARD_ORDER.map((s) => {
                  const StIcon = STATUS_ICON[s];
                  return (
                    <button
                      type="button"
                      key={s}
                      className={`stchip${status === s ? " on" : ""}`}
                      onClick={() => setStatus(s)}
                    >
                      <span className="ic">
                        <StIcon aria-hidden="true" />
                      </span>
                      {copyOf(t, LOST_STATUS[s].key)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="fld" style={{ marginTop: 14 }}>
            <label className="fld__l">{memoLabel}</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={memoPh} />
          </div>
        </div>
        <div className="modal__foot">
          <span className={`modal__foot-note${kind === "dispose" || kind === "delete" ? " is-danger" : ""}`}>
            <ShieldCheck className="ic" aria-hidden="true" />
            {t[meta.foot]}
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
              {t.cfCancel}
            </button>
            <button type="button" className={`btn ${meta.btn}`} disabled={pending} onClick={handleConfirm}>
              <Icon className="ic" aria-hidden="true" />
              {t[meta.confirm]}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
