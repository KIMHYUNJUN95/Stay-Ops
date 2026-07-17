"use client";

// Admin 주문·비품 console — 목록·이력 뷰. 전체 4상태(승인 대기/주문 대기/주문 처리됨/종결)를 요청일 범위로
// 필터링. Mirrors maintenance-list.tsx's "list" scope / lost-found-list.tsx.
import { Search, X } from "lucide-react";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { AdminOrderVM } from "@/lib/admin-orders";
import { OrdersExportBar } from "./orders-export-bar";
import { LIST_STATUS, STATUS, fmtDate, fmtDateTime, parseTs } from "./orders-console-data";
import {
  EmptyState,
  ErrorState,
  ItemSummary,
  OrderIcon,
  ReporterAvatar,
  StatusPill,
  UrgBadge,
  buildingOptionsOf,
  copyOf,
  localeTagOf,
  locationLabel,
  reporterOptionsOf,
  type OrdersCopy,
  type OrdersFilters,
} from "./orders-console-shared";
import type { OrderStatus } from "./orders-console-data";

type ListProps = {
  orders: AdminOrderVM[];
  allOrders: AdminOrderVM[];
  t: OrdersCopy;
  sharedLabels: Dictionary["admin"]["shared"];
  locale: Locale;
  filters: OrdersFilters;
  onFilterChange: <K extends keyof OrdersFilters>(key: K, value: OrdersFilters[K]) => void;
  onRangeChange: (from: string, to: string) => void;
  onClearFilters: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loadError?: boolean;
  onRetry: () => void;
};

export function OrdersList({
  orders,
  allOrders,
  t,
  sharedLabels,
  locale,
  filters,
  onFilterChange,
  onRangeChange,
  onClearFilters,
  selectedId,
  onSelect,
  loadError,
  onRetry,
}: ListProps) {
  const localeTag = localeTagOf(locale);
  const buildingOptions = buildingOptionsOf(allOrders);
  const reporterOptions = reporterOptionsOf(allOrders);

  const toolbar = (
    <div className="ctoolbar filterbar">
      <AdminDateRangePicker
        from={filters.from}
        to={filters.to}
        onChange={onRangeChange}
        localeTag={localeTag}
        ariaLabel={sharedLabels.pickRange}
        labels={{
          prevMonth: sharedLabels.datePrevMonth,
          nextMonth: sharedLabels.dateNextMonth,
          thisMonth: sharedLabels.dateThisMonth,
          reset: sharedLabels.dateReset,
          apply: sharedLabels.dateApply,
        }}
      />
      <AdmDropdown
        size="sm"
        value={filters.status}
        onChange={(v) => onFilterChange("status", v as OrderStatus | "all")}
        ariaLabel={t.colStatus}
        options={[
          { value: "all", label: t.allStatus },
          ...LIST_STATUS.map((s) => ({ value: s, label: copyOf(t, STATUS[s].key) })),
        ]}
      />
      <AdmDropdown
        size="sm"
        value={filters.urgency}
        onChange={(v) => onFilterChange("urgency", v as OrdersFilters["urgency"])}
        ariaLabel={t.allUrgency}
        options={[
          { value: "all", label: t.allUrgency },
          { value: "high", label: t.urgent },
          { value: "normal", label: t.normal },
        ]}
      />
      <AdmDropdown
        size="sm"
        value={filters.prop}
        onChange={(v) => onFilterChange("prop", v)}
        ariaLabel={t.allProp}
        options={[
          { value: "all", label: t.allProp },
          ...buildingOptions.map((b) => ({ value: b.key, label: b.label })),
        ]}
      />
      <AdmDropdown
        size="sm"
        value={filters.reporter}
        onChange={(v) => onFilterChange("reporter", v)}
        ariaLabel={t.allReporter}
        options={[
          { value: "all", label: t.allReporter },
          ...reporterOptions.map((r) => ({ value: r.id, label: r.name })),
        ]}
      />
      <div className="qsearch qsearch--inline">
        <span className="ic">
          <Search aria-hidden="true" />
        </span>
        <input placeholder={t.search} value={filters.query} onChange={(e) => onFilterChange("query", e.target.value)} />
        {filters.query ? (
          <button type="button" className="qsearch__clear" onClick={() => onFilterChange("query", "")}>
            <span className="ic">
              <X aria-hidden="true" />
            </span>
          </button>
        ) : null}
      </div>
      <div className="expbar">
        <span className="expbar__lb">{t.export}</span>
        <OrdersExportBar
          disabled={orders.length === 0}
          filters={{
            startDate: filters.from,
            endDate: filters.to,
            status: filters.status === "all" ? undefined : filters.status,
          }}
          labels={sharedLabels}
        />
      </div>
    </div>
  );

  if (loadError) {
    return (
      <>
        {toolbar}
        <ErrorState t={t} onRetry={onRetry} />
      </>
    );
  }

  const q = filters.query.trim().toLowerCase();
  const rows = orders
    .filter((o) => {
      const day = o.reqDate;
      if (day < filters.from || day > filters.to) return false;
      if (filters.status !== "all" && o.status !== filters.status) return false;
      if (filters.urgency !== "all" && o.urgency !== filters.urgency) return false;
      if (filters.prop !== "all" && o.buildingKey !== filters.prop) return false;
      if (filters.reporter !== "all" && o.reporterId !== filters.reporter) return false;
      if (
        q &&
        !(
          o.title.toLowerCase().includes(q) ||
          locationLabel(o, t.buildingWhole).toLowerCase().includes(q) ||
          o.reporterName.toLowerCase().includes(q) ||
          o.items.some((it) => it.name.toLowerCase().includes(q))
        )
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ua = a.urgency === "high";
      const ub = b.urgency === "high";
      if (ua !== ub) return ua ? -1 : 1;
      return (parseTs(b.reqAt) ?? 0) - (parseTs(a.reqAt) ?? 0);
    });

  if (!rows.length) {
    return (
      <>
        {toolbar}
        <EmptyState
          iconName="clock"
          title={t.emptyListT}
          sub={t.emptyListS}
          actionLabel={t.clearFilter}
          onAction={onClearFilters}
        />
      </>
    );
  }

  return (
    <>
      {toolbar}
      <div className="hmeta">
        <b style={{ color: "var(--ink-soft)" }}>
          {rows.length}
          {t.calCount}
        </b>
        <span className="sep" />
        {`${fmtDate(filters.from, locale)} – ${fmtDate(filters.to, locale)}`}
      </div>
      <div className="card" style={{ overflow: "auto" }}>
        <table className="qtbl mtbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{t.colLoc}</th>
              <th>{t.colTitle}</th>
              <th>{t.colStatus}</th>
              <th>{t.colReporter}</th>
              <th>{t.colReqAt}</th>
              <th>{t.colDeliv}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.id}
                className={[o.urgency === "high" ? "row-urg" : "", selectedId === o.id ? "sel" : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelect(o.id)}
              >
                <td style={{ paddingLeft: 16 }}>
                  {o.buildingLabel}
                  <div className="tt-loc mono">{o.room ?? t.buildingWhole}</div>
                </td>
                <td>
                  <span className="tt-title">
                    {o.title}
                    {o.urgency === "high" ? (
                      <>
                        {" "}
                        <UrgBadge t={t} />
                      </>
                    ) : null}
                  </span>
                  <div className="items-cell">
                    <OrderIcon name="package" /> <ItemSummary items={o.items} t={t} /> · {t.qtyTotal} {o.totalQty}
                    {t.qtyUnit}
                  </div>
                </td>
                <td>
                  <StatusPill status={o.status} t={t} />
                </td>
                <td>
                  <span className="who">
                    <ReporterAvatar id={o.reporterId} name={o.reporterName} className="who__av" />
                    <span className="who__nm">{o.reporterName}</span>
                  </span>
                </td>
                <td className="dim-cell mono">{fmtDateTime(o.reqAt, locale)}</td>
                <td>
                  {o.deliv ? (
                    <span className="deliv-cell">
                      {o.deliv.mode === "range"
                        ? `${fmtDate(o.deliv.start, locale)} ${t.calRangeTo} ${fmtDate(o.deliv.end, locale)}`
                        : fmtDate(o.deliv.date, locale)}
                    </span>
                  ) : (
                    <span className="deliv-cell is-tbd">{t.delivTBD}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
