"use client";

// Admin 분실물 console — 목록·이력 뷰. 진행(active: 접수/보관중/폐기예정) 건만, 발견일시 범위로 필터.
// Mirrors maintenance-list.tsx's "list" scope.
import { History, Search, TriangleAlert, X } from "lucide-react";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { AdminLostItemVM } from "@/lib/admin-lost-found";
import type { LostItemStatus } from "@/lib/lost-found-constants";
import {
  LOST_STATUS,
  BOARD_ORDER,
  buildingOptionsOf,
  fmtDate,
  fmtDateTime,
  locationLabel,
  reporterOptionsOf,
  type LFFilters,
} from "./lost-found-console-data";
import {
  CategoryChip,
  DdayBadge,
  ReporterAvatar,
  StatusPill,
  copyOf,
  localeTagOf,
  type LFCopy,
} from "./lost-found-console-shared";

type ListProps = {
  items: AdminLostItemVM[];
  allItems: AdminLostItemVM[];
  t: LFCopy;
  sharedLabels: Dictionary["admin"]["shared"];
  locale: Locale;
  filters: LFFilters;
  onFilterChange: <K extends keyof LFFilters>(key: K, value: LFFilters[K]) => void;
  onRangeChange: (from: string, to: string) => void;
  onClearFilters: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loadError?: boolean;
  onRetry: () => void;
};

function unitOf(locale: Locale): string {
  return locale === "ja" ? "件" : locale === "en" ? " records" : "건";
}

export function LostFoundList({
  items,
  allItems,
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
  const activeItems = allItems.filter((i) => i.status !== "disposed" && i.status !== "returned");
  const buildingOptions = buildingOptionsOf(activeItems);
  const reporterOptions = reporterOptionsOf(activeItems);

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
        onChange={(v) => onFilterChange("status", v as LostItemStatus | "all")}
        ariaLabel={t.colStatus}
        options={[
          { value: "all", label: t.allStatus },
          ...BOARD_ORDER.map((s) => ({ value: s, label: copyOf(t, LOST_STATUS[s].key) })),
        ]}
      />
      <AdmDropdown
        size="sm"
        value={filters.building}
        onChange={(v) => onFilterChange("building", v)}
        ariaLabel={t.colBuilding}
        options={[{ value: "all", label: t.allProp }, ...buildingOptions.map((b) => ({ value: b, label: b }))]}
      />
      <AdmDropdown
        size="sm"
        value={filters.reporter}
        onChange={(v) => onFilterChange("reporter", v)}
        ariaLabel={t.colReporter}
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
      <span className="ctoolbar__spacer" />
    </div>
  );

  if (loadError) {
    return (
      <>
        {toolbar}
        <div className="card">
          <div className="state">
            <div className="state__ic err">
              <TriangleAlert aria-hidden="true" />
            </div>
            <div className="state__t">{t.errT}</div>
            <div className="state__s">{t.errS}</div>
            <button type="button" className="btn btn--pri btn--sm" style={{ marginTop: 16 }} onClick={onRetry}>
              {t.retry}
            </button>
          </div>
        </div>
      </>
    );
  }

  const q = filters.query.trim().toLowerCase();
  const rows = items
    .filter((i) => {
      if (i.status === "disposed" || i.status === "returned") return false;
      const day = i.foundAt.split(" ")[0];
      if (day < filters.from || day > filters.to) return false;
      if (filters.status !== "all" && i.status !== filters.status) return false;
      if (filters.building !== "all" && i.buildingLabel !== filters.building) return false;
      if (filters.reporter !== "all" && i.reporterId !== filters.reporter) return false;
      if (
        q &&
        !(
          i.itemName.toLowerCase().includes(q) ||
          locationLabel(i, t.buildingWhole).toLowerCase().includes(q) ||
          i.reporterName.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!rows.length) {
    return (
      <>
        {toolbar}
        <div className="card">
          <div className="state">
            <div className="state__ic empty">
              <History aria-hidden="true" />
            </div>
            <div className="state__t">{t.emptyListT}</div>
            <div className="state__s">{t.emptyListS}</div>
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={onClearFilters}>
              {t.clearFilter}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}
      <div className="hmeta">
        <b style={{ color: "var(--ink-soft)" }}>
          {rows.length}
          {unitOf(locale)}
        </b>
        <span className="sep" />
        {`${fmtDate(filters.from, locale)} – ${fmtDate(filters.to, locale)}`}
      </div>
      <div className="card" style={{ overflow: "auto" }}>
        <table className="qtbl mtbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{t.colId}</th>
              <th>{t.colItem}</th>
              <th>{t.colBuilding}</th>
              <th>{t.colRoom}</th>
              <th>{t.colStatus}</th>
              <th>{t.colReporter}</th>
              <th>{t.colFound}</th>
              <th>{t.colDue}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
                <tr key={i.id} className={selectedId === i.id ? "sel" : ""} onClick={() => onSelect(i.id)}>
                  <td style={{ paddingLeft: 16 }}>
                    <span className="tt-id">{i.shortId}</span>
                  </td>
                  <td>
                    <span className="tt-title">{i.itemName}</span>
                    <div className="tt-loc">
                      <CategoryChip category={i.category} t={t} />
                    </div>
                  </td>
                  <td className="dim-cell">{i.buildingLabel}</td>
                  <td className={i.room ? "mono" : "dim-cell"}>{i.room ?? t.buildingWhole}</td>
                  <td>
                    <StatusPill status={i.status} t={t} />
                  </td>
                  <td>
                    <span className="who">
                      <ReporterAvatar id={i.reporterId} name={i.reporterName} className="who__av" />
                      <span className="who__nm">{i.reporterName}</span>
                    </span>
                  </td>
                  <td className="dim-cell mono">{fmtDateTime(i.foundAt, locale)}</td>
                  <td>
                    <span className={`due-cell${i.isExpired ? " is-expired" : i.isDueSoon ? " is-soon" : ""}`}>
                      {fmtDate(i.dueDate, locale)}
                    </span>{" "}
                    <DdayBadge item={i} t={t} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
