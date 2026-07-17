"use client";

// Admin 주문·비품 console — 현황 보드. 3개 상태 컬럼(승인 대기 / 주문 대기 / 주문 처리됨); 종결(closed)은
// 별도 "완료" 뷰에서만 본다. Mirrors maintenance-board.tsx / lost-found-board.tsx.
import type { Locale } from "@/lib/i18n";
import type { AdminOrderVM } from "@/lib/admin-orders";
import { BOARD_ORDER, STATUS, fmtDate, sortForBoard } from "./orders-console-data";
import {
  DelivDdayBadge,
  EmptyState,
  ItemSummary,
  OrderIcon,
  ReporterAvatar,
  StatusPill,
  UrgBadge,
  copyOf,
  isActive,
  locationLabel,
  type OrdersCopy,
  type OrdersFilters,
} from "./orders-console-shared";

type BoardProps = {
  orders: AdminOrderVM[];
  filters: OrdersFilters;
  t: OrdersCopy;
  locale: Locale;
  todayKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearFilters: () => void;
};

function OrderCard({
  order,
  t,
  locale,
  todayKey,
  selected,
  onSelect,
}: {
  order: AdminOrderVM;
  t: OrdersCopy;
  locale: Locale;
  todayKey: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const cls = ["mcard", `is-${STATUS[order.status].cls}`, order.urgency === "high" ? "is-urgent" : "", selected ? "sel" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      onClick={() => onSelect(order.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(order.id);
        }
      }}
    >
      <div className="mcard__top">
        <StatusPill status={order.status} t={t} />
        <span className="mcard__sp" />
        {order.urgency === "high" ? <UrgBadge t={t} /> : null}
      </div>
      <div className="mcard__title">{order.title}</div>
      <div className="mcard__mid">
        <span className="mcard__loc">
          <OrderIcon name="pin" />
          {order.room ? (
            <>
              <span className="mono">{order.room}</span> · {order.buildingLabel}
            </>
          ) : (
            `${order.buildingLabel} · ${t.buildingWhole}`
          )}
        </span>
      </div>
      <div className="mcard__items">
        <OrderIcon name="package" />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <ItemSummary items={order.items} t={t} />
        </span>
        {order.hasLink ? (
          <span className="lk">
            <OrderIcon name="cart" />
          </span>
        ) : null}
        <span className="qty">
          {t.qtyTotal} {order.totalQty}
          {t.qtyUnit}
        </span>
      </div>
      <div className="mcard__foot">
        <span className="mcard__rep">
          <ReporterAvatar id={order.reporterId} name={order.reporterName} className="mcard__av" />
          <span>{order.reporterName}</span>
        </span>
        {order.status === "ordered" ? (
          <DelivDdayBadge deliv={order.deliv} todayKey={todayKey} lang={locale} t={t} />
        ) : (
          <span className="mcard__el">
            <OrderIcon name="clock" />
            {t.reqAt} {fmtDate(order.reqDate, locale)}
          </span>
        )}
      </div>
    </div>
  );
}

export function OrdersBoard({ orders, filters, t, locale, todayKey, selectedId, onSelect, onClearFilters }: BoardProps) {
  const q = filters.query.trim().toLowerCase();

  function matches(o: AdminOrderVM): boolean {
    if (!isActive(o)) return false;
    if (filters.status !== "all" && o.status !== filters.status) return false;
    if (filters.prop !== "all" && o.buildingKey !== filters.prop) return false;
    if (filters.reporter !== "all" && o.reporterId !== filters.reporter) return false;
    if (filters.urgency !== "all" && o.urgency !== filters.urgency) return false;
    if (!q) return true;
    return (
      o.title.toLowerCase().includes(q) ||
      locationLabel(o, t.buildingWhole).toLowerCase().includes(q) ||
      o.reporterName.toLowerCase().includes(q) ||
      o.items.some((it) => it.name.toLowerCase().includes(q))
    );
  }

  const all = orders.filter(matches);
  const hasActiveFilter =
    Boolean(q) || filters.prop !== "all" || filters.reporter !== "all" || filters.urgency !== "all" || filters.status !== "all";

  if (!all.length) {
    return (
      <EmptyState
        iconName="search"
        title={t.emptyBoardT}
        sub={t.emptyBoardS}
        actionLabel={hasActiveFilter ? t.clearFilter : undefined}
        onAction={hasActiveFilter ? onClearFilters : undefined}
      />
    );
  }

  return (
    <div className="mboard-wrap">
      <div className="mbkgrid">
        {BOARD_ORDER.map((status) => {
          const meta = STATUS[status];
          const items = sortForBoard(all.filter((o) => o.status === status));
          return (
            <section className={`mbkcol mbkcol--${meta.cls}`} key={status}>
              <div className="mbkcol__h">
                <span className="mbkcol__ic">
                  <OrderIcon name={meta.icon} />
                </span>
                <span className="mbkcol__t">{copyOf(t, meta.key)}</span>
                <span className="mbkcol__c">{items.length}</span>
              </div>
              <div className="mbkcol__body">
                {items.length ? (
                  items.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      t={t}
                      locale={locale}
                      todayKey={todayKey}
                      selected={selectedId === o.id}
                      onSelect={onSelect}
                    />
                  ))
                ) : (
                  <div className="mnone">
                    <OrderIcon name="check" />
                    {t.clear}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
