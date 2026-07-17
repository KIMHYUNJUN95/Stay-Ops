"use client";

// Admin 주문·비품 console — 완료 뷰. 주문 처리됨(ordered) + 종결(closed, 거절)의 아카이브. 상태 드롭다운은
// 없음(두 상태만 대상이라 필터링 의미가 없음). Mirrors orders-list.tsx's toolbar shape.
import { Search, X } from "lucide-react";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { AdminOrderVM } from "@/lib/admin-orders";
import { OrdersExportBar } from "./orders-export-bar";
import { fmtDate, fmtDateTime, parseTs } from "./orders-console-data";
import {
  EmptyState,
  ErrorState,
  ReporterAvatar,
  StatusPill,
  UrgBadge,
  buildingOptionsOf,
  localeTagOf,
  locationLabel,
  reporterOptionsOf,
  type OrdersCopy,
  type OrdersFilters,
} from "./orders-console-shared";

type ClosedProps = {
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

export function OrdersClosed({
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
}: ClosedProps) {
  const localeTag = localeTagOf(locale);
  const closedPool = allOrders.filter((o) => o.status === "ordered" || o.status === "closed");
  const buildingOptions = buildingOptionsOf(closedPool);
  const reporterOptions = reporterOptionsOf(closedPool);

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
          filters={{ startDate: filters.from, endDate: filters.to, status: undefined }}
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
      if (o.status !== "ordered" && o.status !== "closed") return false;
      const day = o.reqDate;
      if (day < filters.from || day > filters.to) return false;
      if (filters.urgency !== "all" && o.urgency !== filters.urgency) return false;
      if (filters.prop !== "all" && o.buildingKey !== filters.prop) return false;
      if (filters.reporter !== "all" && o.reporterId !== filters.reporter) return false;
      if (
        q &&
        !(
          o.title.toLowerCase().includes(q) ||
          locationLabel(o, t.buildingWhole).toLowerCase().includes(q) ||
          o.reporterName.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (parseTs(b.reqAt) ?? 0) - (parseTs(a.reqAt) ?? 0));

  const hint = (
    <div className="hmeta">
      <b style={{ color: "var(--ink-soft)" }}>
        {rows.length}
        {t.calCount}
      </b>
      <span className="sep" />
      {t.closedHint}
    </div>
  );

  if (!rows.length) {
    return (
      <>
        {toolbar}
        <EmptyState
          iconName="checkcircle"
          tone="ok"
          title={t.closedEmptyT}
          sub={t.closedEmptyS}
          actionLabel={t.clearFilter}
          onAction={onClearFilters}
        />
      </>
    );
  }

  return (
    <>
      {toolbar}
      {hint}
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
              <tr key={o.id} className={selectedId === o.id ? "sel" : ""} onClick={() => onSelect(o.id)}>
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
                  {o.status === "ordered" && o.deliv ? (
                    <span className="deliv-cell">
                      {o.deliv.mode === "range"
                        ? `${fmtDate(o.deliv.start, locale)} ${t.calRangeTo} ${fmtDate(o.deliv.end, locale)}`
                        : fmtDate(o.deliv.date, locale)}
                    </span>
                  ) : (
                    <span className="deliv-cell is-tbd">—</span>
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
