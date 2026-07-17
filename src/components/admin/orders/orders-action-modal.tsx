"use client";

// Admin 주문·비품 console — 능동 처리·예외 개입 확인 모달 8종(승인/거절/주문 처리/배송일 수정/재오픈/
// 상태 정정/요청 수정/삭제). 같은 껍데기(cfhead + cfrec + 필드 + foot)를 쓰고 아이콘·문구·필드만 달라진다.
// 배송일 피커(process/editdeliv)는 CLAUDE.md 4a의 예외 — 어드민 공용 .calpop 크롬을 그대로 재사용하되,
// 단일/기간 토글이 필요해 AdminDateRangePicker/AdminDatePicker 대신 자체 구현한다(설계 modalCal 1:1 이식).
// Mirrors lost-found-action-modal.tsx.
import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { AdminOrderVM } from "@/lib/admin-orders";
import { LIST_STATUS, STATUS, fmtDate, fmtMonth, iso, WD, type OrderStatus } from "./orders-console-data";
import {
  OrderIcon,
  StatusPill,
  UrgBadge,
  copyOf,
  locationLabel,
  type OrdersCopy,
} from "./orders-console-shared";
import type { OrdActionKind } from "./orders-detail-panel";

export type OrdActionPayload = {
  memo?: string;
  mode?: "point" | "range";
  date?: string;
  start?: string;
  end?: string;
  newStatus?: OrderStatus;
  title?: string;
  urgency?: "high" | "normal";
  reason?: string;
  items?: { name: string; qty: string; link: string; memo: string }[];
};

type ActionModalProps = {
  kind: OrdActionKind;
  order: AdminOrderVM;
  t: OrdersCopy;
  locale: Locale;
  todayKey: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (kind: OrdActionKind, id: string, payload: OrdActionPayload) => void;
  onValidationError: (message: string) => void;
};

const KIND_META = {
  approve: { Icon: Check, kicker: "maKicker", title: "maTitle", body: "maBody", confirm: "maConfirm", foot: "maFoot", btn: "btn--prisolid", icCls: "cficon--approve", footCls: "" },
  reject: { Icon: X, kicker: "mrKicker", title: "mrTitle", body: "mrBody", confirm: "mrConfirm", foot: "mrFoot", btn: "btn--danger", icCls: "cficon--reject", footCls: "is-danger" },
  process: { Icon: ShoppingCart, kicker: "mpKicker", title: "mpTitle", body: "mpBody", confirm: "mpConfirm", foot: "mpFoot", btn: "btn--donesolid", icCls: "cficon--process", footCls: "" },
  editdeliv: { Icon: CalendarDays, kicker: "meKicker", title: "meTitle", body: "meBody", confirm: "meConfirm", foot: "meFoot", btn: "btn--pri", icCls: "cficon--deliv", footCls: "" },
  reopen: { Icon: Undo2, kicker: "moKicker", title: "moTitle", body: "moBody", confirm: "moConfirm", foot: "moFoot", btn: "btn--pri", icCls: "cficon--reopen", footCls: "" },
  correct: { Icon: Pencil, kicker: "mcKicker", title: "mcTitle", body: "mcBody", confirm: "mcConfirm", foot: "mcFoot", btn: "btn--pri", icCls: "cficon--reopen", footCls: "" },
  edit: { Icon: Check, kicker: "mdeKicker", title: "mdeTitle", body: "mdeBody", confirm: "mdeConfirm", foot: "mdeFoot", btn: "btn--pri", icCls: "cficon--reopen", footCls: "" },
  delete: { Icon: Trash2, kicker: "mxKicker", title: "mxTitle", body: "mxBody", confirm: "mxConfirm", foot: "mxFoot", btn: "btn--danger", icCls: "cficon--del", footCls: "is-danger" },
} as const;

type CalMonth = { y: number; m: number };

function shiftCalMonth(month: CalMonth, delta: number): CalMonth {
  const total = month.y * 12 + month.m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

// 배송일 피커 — 단일/기간 토글 + 인라인 .calpop. process(주문 처리)·editdeliv(배송일 수정)가 공유한다.
function DeliveryPickerField({
  t,
  locale,
  todayKey,
  mode,
  date,
  start,
  end,
  onModeChange,
  onDateChange,
  onRangePick,
}: {
  t: OrdersCopy;
  locale: Locale;
  todayKey: string;
  mode: "point" | "range";
  date: string | null;
  start: string | null;
  end: string | null;
  onModeChange: (mode: "point" | "range") => void;
  onDateChange: (value: string) => void;
  onRangePick: (value: string) => void;
}) {
  const initSrc = mode === "range" ? (start ?? todayKey) : (date ?? todayKey);
  const [calOpen, setCalOpen] = useState(false);
  const [cal, setCal] = useState<CalMonth>(() => ({ y: +initSrc.slice(0, 4), m: +initSrc.slice(5, 7) - 1 }));

  const showGrid = mode === "range" || calOpen;
  const days = daysInMonth(cal.y, cal.m);
  const firstDow = new Date(cal.y, cal.m, 1).getDay();

  function pick(val: string) {
    if (mode === "point") {
      onDateChange(val);
      setCalOpen(false);
      return;
    }
    onRangePick(val);
  }

  return (
    <>
      <div className="fld">
        <label className="fld__l">{t.mpMode}</label>
        <div className="segradio">
          <button type="button" className={`segopt${mode === "point" ? " on" : ""}`} onClick={() => onModeChange("point")}>
            <span className="segopt__ic">
              <OrderIcon name="caldays" />
            </span>
            <span className="segopt__t">{t.mpModePoint}</span>
            <span className="segopt__rd" />
          </button>
          <button type="button" className={`segopt${mode === "range" ? " on" : ""}`} onClick={() => onModeChange("range")}>
            <span className="segopt__ic">
              <CalendarDays className="ic" aria-hidden="true" />
            </span>
            <span className="segopt__t">{t.mpModeRange}</span>
            <span className="segopt__rd" />
          </button>
        </div>
      </div>
      <div className="fld">
        <label className="fld__l">{mode === "range" ? t.pDelivRange : t.mpDate}</label>
        {mode === "range" ? (
          <div className="rangepick">
            <div className="datepick" style={{ pointerEvents: "none" }}>
              <CalendarDays className="ic" aria-hidden="true" />
              <span className={`v${start ? "" : " ph"}`}>{start ? fmtDate(start, locale) : t.mpStart}</span>
            </div>
            <div className="datepick" style={{ pointerEvents: "none" }}>
              <CalendarDays className="ic" aria-hidden="true" />
              <span className={`v${end ? "" : " ph"}`}>{end ? fmtDate(end, locale) : t.mpEnd}</span>
            </div>
          </div>
        ) : (
          <button type="button" className="datepick" style={{ width: "100%" }} onClick={() => setCalOpen((o) => !o)}>
            <CalendarDays className="ic" aria-hidden="true" />
            <span className={`v${date ? "" : " ph"}`}>{date ? fmtDate(date, locale) : t.mpDate}</span>
            <ChevronDown className="ic dd__chev" style={{ marginLeft: "auto" }} aria-hidden="true" />
          </button>
        )}
        {showGrid ? (
          <div
            className="calpop"
            style={{ position: "static", width: "auto", boxShadow: "none", border: "1px solid var(--line)", marginTop: 8 }}
          >
            <div className="calpop__head">
              <button type="button" className="calpop__nav" onClick={() => setCal((c) => shiftCalMonth(c, -1))}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <span className="calpop__title">{fmtMonth(cal.y, cal.m, locale)}</span>
              <button type="button" className="calpop__nav" onClick={() => setCal((c) => shiftCalMonth(c, 1))}>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <div className="calpop__wd">
              {WD[locale].map((w, i) => (
                <span key={w} className={i === 0 ? "sun" : ""}>
                  {w}
                </span>
              ))}
            </div>
            <div className="calpop__grid">
              {Array.from({ length: firstDow }, (_, i) => (
                <span key={`pad-${i}`} className="cald cald--pad" />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const d = i + 1;
                const val = iso(cal.y, cal.m, d);
                let cls: string;
                if (mode === "range") {
                  const isFrom = val === start;
                  const isTo = val === end;
                  const inRange = Boolean(start && end && val > start && val < end);
                  cls = ["cald", isFrom ? "is-from" : "", isTo ? "is-to" : "", isFrom && !end ? "is-single" : "", inRange ? "is-range" : "", val === todayKey ? "is-today" : ""]
                    .filter(Boolean)
                    .join(" ");
                } else {
                  cls = ["cald", val === date ? "is-from is-single" : "", val === todayKey ? "is-today" : ""].filter(Boolean).join(" ");
                }
                return (
                  <button type="button" key={val} className={cls} onClick={() => pick(val)}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function OrdersActionModal({
  kind,
  order,
  t,
  locale,
  todayKey,
  pending,
  onCancel,
  onConfirm,
  onValidationError,
}: ActionModalProps) {
  const meta = KIND_META[kind];
  const { Icon } = meta;

  const [memo, setMemo] = useState("");
  const [mode, setMode] = useState<"point" | "range">(
    kind === "editdeliv" && order.deliv?.mode === "range" ? "range" : "point",
  );
  const [date, setDate] = useState<string | null>(() => {
    if (kind === "process") return todayKey;
    if (kind === "editdeliv") return order.deliv?.mode === "point" ? order.deliv.date : (order.deliv ? null : todayKey);
    return null;
  });
  const [start, setStart] = useState<string | null>(
    kind === "editdeliv" && order.deliv?.mode === "range" ? order.deliv.start : null,
  );
  const [end, setEnd] = useState<string | null>(
    kind === "editdeliv" && order.deliv?.mode === "range" ? order.deliv.end : null,
  );
  const [newStatus, setNewStatus] = useState<OrderStatus>(order.status);
  const [title, setTitle] = useState(order.title);
  const [urgency, setUrgency] = useState<"high" | "normal">(order.urgency);
  const [reason, setReason] = useState(order.reason);
  const [items, setItems] = useState(() => order.items.map((it) => ({ name: it.name, qty: it.qty, link: it.link, memo: it.memo })));

  function handleRangePick(val: string) {
    if (!start || (start && end)) {
      setStart(val);
      setEnd(null);
    } else if (val < start) {
      setEnd(start);
      setStart(val);
    } else {
      setEnd(val);
    }
  }

  function updateItem(index: number, key: "name" | "qty" | "link" | "memo", value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [key]: value } : it)));
  }

  function handleConfirm() {
    if (kind === "approve" || kind === "reject" || kind === "reopen") {
      onConfirm(kind, order.id, { memo });
      return;
    }
    if (kind === "delete") {
      onConfirm(kind, order.id, {});
      return;
    }
    if (kind === "correct") {
      onConfirm(kind, order.id, { newStatus, memo });
      return;
    }
    if (kind === "edit") {
      const cleaned = items.filter((it) => it.name.trim().length > 0);
      if (cleaned.length === 0) {
        onValidationError(t.edNeedItem);
        return;
      }
      onConfirm(kind, order.id, { title, urgency, reason, items: cleaned });
      return;
    }
    // process / editdeliv
    if (mode === "range") {
      if (!start || !end) {
        onValidationError(t.mpNeedDate);
        return;
      }
    } else if (!date) {
      onValidationError(t.mpNeedDate);
      return;
    }
    onConfirm(kind, order.id, {
      mode,
      date: date ?? undefined,
      start: start ?? undefined,
      end: end ?? undefined,
      memo: kind === "process" ? memo : undefined,
    });
  }

  const wide = kind === "process" || kind === "editdeliv" || kind === "edit";

  return (
    <>
      <div className="modal-scrim on" onClick={onCancel} />
      <div className="modal on" style={{ width: wide ? 560 : 496 }}>
        <div className="modal__h">
          <div>
            <div className="modal__kicker">{t[meta.kicker as keyof OrdersCopy] as string}</div>
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
              <div className="cfbody-t">{t[meta.title as keyof OrdersCopy] as string}</div>
              <div className="cfbody-s">{t[meta.body as keyof OrdersCopy] as string}</div>
            </div>
          </div>

          <div className="cfrec">
            <span className="cfrec__ic">
              <OrderIcon name="package" />
            </span>
            <div className="cfrec__b">
              <div className="cfrec__t">
                {order.title}
                {order.urgency === "high" ? (
                  <>
                    {" "}
                    <UrgBadge t={t} />
                  </>
                ) : null}
              </div>
              <div className="cfrec__s">
                {order.shortId} · {locationLabel(order, t.buildingWhole)} · {t.qtyTotal} {order.totalQty}
                {t.qtyUnit}
              </div>
            </div>
            <StatusPill status={order.status} t={t} />
          </div>

          {kind === "approve" ? (
            <div className="fld" style={{ marginTop: 14 }}>
              <label className="fld__l">{t.maMemo}</label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.maMemoPh} />
            </div>
          ) : null}

          {kind === "reject" ? (
            <div className="fld" style={{ marginTop: 14 }}>
              <label className="fld__l">{t.mrReason}</label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.mrReasonPh} />
            </div>
          ) : null}

          {kind === "process" ? (
            <>
              <div style={{ marginTop: 14 }}>
                <DeliveryPickerField
                  t={t}
                  locale={locale}
                  todayKey={todayKey}
                  mode={mode}
                  date={date}
                  start={start}
                  end={end}
                  onModeChange={setMode}
                  onDateChange={setDate}
                  onRangePick={handleRangePick}
                />
              </div>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">{t.mpMemo}</label>
                <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.mpMemoPh} />
              </div>
            </>
          ) : null}

          {kind === "editdeliv" ? (
            <div style={{ marginTop: 14 }}>
              <DeliveryPickerField
                t={t}
                locale={locale}
                todayKey={todayKey}
                mode={mode}
                date={date}
                start={start}
                end={end}
                onModeChange={setMode}
                onDateChange={setDate}
                onRangePick={handleRangePick}
              />
            </div>
          ) : null}

          {kind === "reopen" ? (
            <div className="fld" style={{ marginTop: 14 }}>
              <label className="fld__l">{t.moReason}</label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.moReasonPh} />
            </div>
          ) : null}

          {kind === "correct" ? (
            <>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">{t.mcStatus}</label>
                <div className="stpick">
                  {LIST_STATUS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className={`stchip${newStatus === s ? " on" : ""}`}
                      onClick={() => setNewStatus(s)}
                    >
                      <OrderIcon name={STATUS[s].icon} />
                      {copyOf(t, STATUS[s].key)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">{t.mcMemo}</label>
                <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.mcMemoPh} />
              </div>
            </>
          ) : null}

          {kind === "edit" ? (
            <>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">{t.edTitle}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">{t.edUrgency}</label>
                <div className="stpick">
                  <button type="button" className={`stchip${urgency === "normal" ? " on" : ""}`} onClick={() => setUrgency("normal")}>
                    {t.normal}
                  </button>
                  <button type="button" className={`stchip${urgency === "high" ? " on" : ""}`} onClick={() => setUrgency("high")}>
                    <OrderIcon name="bolt" />
                    {t.urgent}
                  </button>
                </div>
              </div>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">
                  {t.edItems} · {items.length}
                </label>
                <div className="eitems">
                  {items.map((it, i) => (
                    <div className="eitem" key={i}>
                      <div className="eitem__top">
                        <input
                          className="enm"
                          value={it.name}
                          onChange={(e) => updateItem(i, "name", e.target.value)}
                          placeholder={t.edNamePh}
                        />
                        <input
                          className="eqty"
                          value={it.qty}
                          onChange={(e) => updateItem(i, "qty", e.target.value)}
                          placeholder={t.edQtyPh}
                          inputMode="numeric"
                        />
                        <button
                          type="button"
                          className="erm"
                          title={t.del}
                          onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="ic" aria-hidden="true" />
                        </button>
                      </div>
                      <input value={it.link} onChange={(e) => updateItem(i, "link", e.target.value)} placeholder={t.edLinkPh} />
                      <input value={it.memo} onChange={(e) => updateItem(i, "memo", e.target.value)} placeholder={t.edMemoPh} />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="eadd"
                  onClick={() => setItems((prev) => [...prev, { name: "", qty: "1", link: "", memo: "" }])}
                >
                  <OrderIcon name="cart" />
                  {t.edAddItem}
                </button>
              </div>
              <div className="fld" style={{ marginTop: 14 }}>
                <label className="fld__l">{t.edReason}</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.edReasonPh} />
              </div>
            </>
          ) : null}

          {kind === "delete" ? (
            <div className="fld" style={{ marginTop: 14 }}>
              <label className="fld__l">{t.pReason}</label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t.mrReasonPh} />
            </div>
          ) : null}
        </div>
        <div className="modal__foot">
          <span className={`modal__foot-note ${meta.footCls}`}>
            <ShieldCheck className="ic" aria-hidden="true" />
            {t[meta.foot as keyof OrdersCopy] as string}
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
              {t.cfCancel}
            </button>
            <button type="button" className={`btn ${meta.btn}`} disabled={pending} onClick={handleConfirm}>
              <Icon className="ic" aria-hidden="true" />
              {t[meta.confirm as keyof OrdersCopy] as string}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
