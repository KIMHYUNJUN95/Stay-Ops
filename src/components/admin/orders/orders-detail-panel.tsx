"use client";

// Admin 주문·비품 console — 우측 상세 패널. 진행(active: 승인 대기/주문 대기/주문 처리됨) 건은 능동 처리
// 액션존(승인/거절/주문 처리/배송일 수정)을, 모든 건은 예외 개입(수정/정정/재오픈/삭제)을 노출한다.
// Mirrors lost-found-detail-panel.tsx / maintenance-detail-panel.tsx.
import { Fragment } from "react";
import { Ban, Camera, Check, Pencil, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import type { Locale } from "@/lib/i18n";
import type { AdminOrderVM } from "@/lib/admin-orders";
import { fmtDate, fmtDateTime } from "./orders-console-data";
import {
  DelivDdayBadge,
  DomainLink,
  OrderIcon,
  StatusPill,
  UrgBadge,
  copyOf,
  isActive,
  type OrdersCopy,
} from "./orders-console-shared";

export type OrdActionKind = "approve" | "reject" | "process" | "editdeliv" | "reopen" | "correct" | "edit" | "delete";

type PanelProps = {
  order: AdminOrderVM | null;
  t: OrdersCopy;
  locale: Locale;
  todayKey: string;
  onClose: () => void;
  onAction: (kind: OrdActionKind, id: string) => void;
  disabled?: boolean;
};

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__k">{label}</span>
      <span className="kv__v">{children}</span>
    </div>
  );
}

function Timeline({ order, t }: { order: AdminOrderVM; t: OrdersCopy }) {
  if (order.status === "closed") {
    const steps = ["tlRequested", "tlApproved", "tlOrdered"];
    return (
      <>
        <div className="otl is-closed">
          {steps.map((key, i) => (
            <Fragment key={key}>
              {i > 0 ? <div className="otl__bar" /> : null}
              <div className="otl__step">
                <span className="otl__dot">
                  <OrderIcon name="hash" />
                </span>
                <span className="otl__lb">{copyOf(t, key)}</span>
              </div>
            </Fragment>
          ))}
        </div>
        <div className="otl__closed">
          <Ban className="ic" aria-hidden="true" />
          {t.tlClosed}
        </div>
      </>
    );
  }

  const order3 = ["requested", "approved", "ordered"] as const;
  const cur = order3.indexOf(order.status as (typeof order3)[number]);
  const icons: Record<(typeof order3)[number], string> = { requested: "inbox", approved: "check", ordered: "cart" };
  const labelKeys: Record<(typeof order3)[number], string> = {
    requested: "tlRequested",
    approved: "tlApproved",
    ordered: "tlOrdered",
  };

  return (
    <div className="otl">
      {order3.map((st, i) => {
        const done = i < cur;
        const isCur = i === cur;
        return (
          <Fragment key={st}>
            {i > 0 ? <div className={`otl__bar${i <= cur ? " done" : ""}`} /> : null}
            <div className={`otl__step${done ? " done" : ""}${isCur ? " cur" : ""}`}>
              <span className="otl__dot">
                <OrderIcon name={icons[st]} />
              </span>
              <span className="otl__lb">{copyOf(t, labelKeys[st])}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export function OrdersDetailPanel({ order, t, locale, todayKey, onClose, onAction, disabled }: PanelProps) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled });
  if (!order) return null;

  const active = isActive(order);

  return (
    <>
      <div className="panel-scrim on" onClick={onClose} />
      <aside ref={panelRef} className="panel on" role="dialog" aria-label={t.pKicker} tabIndex={-1}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">
              {t.pKicker} · {order.shortId}
            </span>
            <button type="button" className="panel__x" onClick={onClose} aria-label={t.close}>
              <X />
            </button>
          </div>
          <div className="mpanel__title" style={{ marginTop: 11 }}>
            {order.title}
          </div>
          <div className="mpanel__chips">
            <StatusPill status={order.status} t={t} />
            {order.urgency === "high" ? <UrgBadge t={t} /> : null}
            {order.status === "ordered" ? (
              <DelivDdayBadge deliv={order.deliv} todayKey={todayKey} lang={locale} t={t} />
            ) : null}
          </div>
        </div>

        <div className="panel__body">
          {/* 기본 정보 */}
          <div className="pblock">
            <div className="pblock__t">{t.pInfo}</div>
            <Kv label={t.pLoc}>
              {order.room ? `${order.buildingLabel} · ${order.room}` : `${order.buildingLabel} · ${t.buildingWhole}`}
            </Kv>
            <Kv label={t.pReporter}>{order.reporterName}</Kv>
            <Kv label={t.pReqAt}>
              <span className="mono">{fmtDateTime(order.reqAt, locale)}</span>
            </Kv>
            <Kv label={t.pUrgency}>
              {order.urgency === "high" ? <UrgBadge t={t} /> : <span style={{ color: "var(--muted)", fontWeight: 700 }}>{t.normal}</span>}
            </Kv>
            {order.reason ? (
              <div style={{ marginTop: 11 }}>
                <div className="pblock__t" style={{ marginBottom: 7 }}>
                  {t.pReason}
                </div>
                <div className="onote">{order.reason}</div>
              </div>
            ) : null}
          </div>

          {/* 요청 품목 */}
          <div className="pblock">
            <div className="pblock__t">
              {t.pItems} · {order.items.length}
            </div>
            <div className="oitems">
              {order.items.map((it, i) => (
                <div className="oitem" key={`${it.name}-${i}`}>
                  <div className="oitem__top">
                    <span className="oitem__nm">{it.name}</span>
                    <span className="oitem__qty">
                      {it.qty}
                      <span className="u">{t.qtyUnit || "ea"}</span>
                    </span>
                  </div>
                  {it.memo ? <div className="oitem__memo">{it.memo}</div> : null}
                  {it.domain || it.photos ? (
                    <div className="oitem__row">
                      <DomainLink item={it} t={t} />
                      {it.photos ? (
                        <span className="oitem__ph">
                          <Camera className="ic" aria-hidden="true" />
                          {t.pItemPhotos} {it.photos}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* 배송 정보 */}
          <div className="pblock">
            <div className="pblock__t">{t.pDeliv}</div>
            {order.deliv ? (
              <div className="dbox">
                <span className="dbox__ic">
                  <OrderIcon name="truck" />
                </span>
                <div>
                  <div className="dbox__k">{order.deliv.mode === "range" ? t.pDelivRange : t.pDelivDate}</div>
                  <div className="dbox__v">
                    {order.deliv.mode === "range"
                      ? `${fmtDate(order.deliv.start, locale)} ${t.calRangeTo} ${fmtDate(order.deliv.end, locale)}`
                      : fmtDate(order.deliv.date, locale)}
                  </div>
                </div>
                {order.status === "ordered" ? (
                  <span className="dbox__dday">
                    <DelivDdayBadge deliv={order.deliv} todayKey={todayKey} lang={locale} t={t} />
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="dbox dbox--tbd">
                <span className="dbox__ic">
                  <OrderIcon name="caldays" />
                </span>
                <div>
                  <div className="dbox__k">{t.pDelivDate}</div>
                  <div className="dbox__v">{t.delivTBD}</div>
                </div>
              </div>
            )}
          </div>

          {/* 진행 상태 */}
          <div className="pblock">
            <div className="pblock__t">{t.pTimeline}</div>
            <Timeline order={order} t={t} />
            {order.status === "closed" && order.closedMemo ? (
              <div className="onote onote--reject" style={{ marginTop: 11 }}>
                {order.closedMemo}
              </div>
            ) : null}
          </div>

          {/* 능동 처리 */}
          {active ? (
            <div className="actzone">
              <div className="actzone__t">
                <ShieldCheck className="ic" aria-hidden="true" />
                {t.activeT}
              </div>
              <div className="actzone__s">{t.activeS}</div>
              <div className="actzone__btns">
                {order.status === "requested" ? (
                  <>
                    <button type="button" className="actbtn actbtn--primary" onClick={() => onAction("approve", order.id)}>
                      <Check className="ic" aria-hidden="true" />
                      {t.actApprove}
                    </button>
                    <button type="button" className="actbtn actbtn--reject" onClick={() => onAction("reject", order.id)}>
                      <X className="ic" aria-hidden="true" />
                      {t.actReject}
                    </button>
                  </>
                ) : null}
                {order.status === "approved" ? (
                  <>
                    <button type="button" className="actbtn actbtn--primary" onClick={() => onAction("process", order.id)}>
                      <OrderIcon name="cart" />
                      {t.actProcess}
                    </button>
                    <button type="button" className="actbtn actbtn--reject" onClick={() => onAction("reject", order.id)}>
                      <X className="ic" aria-hidden="true" />
                      {t.actReject}
                    </button>
                  </>
                ) : null}
                {order.status === "ordered" ? (
                  <button type="button" className="actbtn actbtn--primary" onClick={() => onAction("editdeliv", order.id)}>
                    <OrderIcon name="caldays" />
                    {t.actEditDeliv}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 예외 개입 */}
          <div className="exczone">
            <div className="exczone__t">
              <Pencil className="ic" aria-hidden="true" />
              {t.exceptionT}
            </div>
            <div className="exczone__s">{order.status === "closed" ? t.exceptionS : t.exceptionSDel}</div>
            <div className="exczone__btns">
              <button type="button" className="excbtn excbtn--force" onClick={() => onAction("edit", order.id)}>
                <OrderIcon name="package" />
                {t.actEdit}
              </button>
              <button type="button" className="excbtn excbtn--force" onClick={() => onAction("correct", order.id)}>
                <Pencil className="ic" aria-hidden="true" />
                {t.actCorrect}
              </button>
              {order.status === "closed" ? (
                <button type="button" className="excbtn excbtn--force" onClick={() => onAction("reopen", order.id)}>
                  <Undo2 className="ic" aria-hidden="true" />
                  {t.actReopen}
                </button>
              ) : null}
              <button
                type="button"
                className="excbtn excbtn--del"
                title={t.del}
                aria-label={t.del}
                onClick={() => onAction("delete", order.id)}
              >
                <Trash2 className="ic" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="panel__foot">
          <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </aside>
    </>
  );
}
