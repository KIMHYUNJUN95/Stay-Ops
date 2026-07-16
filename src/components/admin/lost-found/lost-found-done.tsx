"use client";

// Admin 분실물 console — 완료 뷰(vDone). 종결(반환완료+폐기완료) 아카이브. 반환 방식·송장·종결시각을
// 더 보여준다. Mirrors maintenance-list.tsx's "done" scope, but merges two terminal statuses.
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { CheckCircle2, Handshake, Search, Trash2, TriangleAlert, Truck, Undo2, X } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { AdminLostItemVM } from "@/lib/admin-lost-found";
import {
  buildingOptionsOf,
  fmtDateTime,
  locationLabel,
  parseTs,
  reporterOptionsOf,
  type LFFilters,
} from "./lost-found-console-data";
import { CategoryChip, ReporterAvatar, StatusPill, localeTagOf, type LFCopy } from "./lost-found-console-shared";

type DoneProps = {
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

export function LostFoundDone({
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
}: DoneProps) {
  const localeTag = localeTagOf(locale);
  const doneItems = allItems.filter((i) => i.status === "returned" || i.status === "disposed");
  const buildingOptions = buildingOptionsOf(doneItems);
  const reporterOptions = reporterOptionsOf(doneItems);

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
    .filter((i) => i.status === "returned" || i.status === "disposed")
    .filter((i) => {
      const day = (i.handledAt ?? i.foundAt).split(" ")[0];
      if (day < filters.from || day > filters.to) return false;
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
    .sort((a, b) => (parseTs(b.handledAt ?? b.foundAt) ?? 0) - (parseTs(a.handledAt ?? a.foundAt) ?? 0));

  if (!rows.length) {
    return (
      <>
        {toolbar}
        <div className="card">
          <div className="state">
            <div className="state__ic ok">
              <CheckCircle2 aria-hidden="true" />
            </div>
            <div className="state__t">{t.doneEmptyT}</div>
            <div className="state__s">{t.doneEmptyS}</div>
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
        {t.doneHint}
      </div>
      <div className="card" style={{ overflow: "auto" }}>
        <table className="qtbl mtbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{t.colItem}</th>
              <th>{t.colStatus}</th>
              <th>{t.colBy}</th>
              <th>{t.colMethod}</th>
              <th>{t.colTracking}</th>
              <th>{t.colClosed}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className={selectedId === i.id ? "sel" : ""} onClick={() => onSelect(i.id)}>
                <td style={{ paddingLeft: 16 }}>
                  <span className="tt-title">{i.itemName}</span>
                  <div className="tt-loc">
                    {locationLabel(i, t.buildingWhole)} · <CategoryChip category={i.category} t={t} align="end" />
                  </div>
                </td>
                <td>
                  <StatusPill status={i.status} t={t} />
                </td>
                <td>
                  <span className="who">
                    <ReporterAvatar id={i.reporterId} name={i.handledByName ?? i.reporterName} className="who__av" />
                    <span className="who__nm">{i.handledByName ?? i.reporterName}</span>
                  </span>
                </td>
                <td>
                  {i.status === "returned" && i.returnMethod ? (
                    <span className="meth">
                      <span className="ic">
                        {i.returnMethod === "delivery" ? (
                          <Truck aria-hidden="true" />
                        ) : (
                          <Handshake aria-hidden="true" />
                        )}
                      </span>
                      {i.returnMethod === "delivery" ? t.methodDelivery : t.methodPickup}
                    </span>
                  ) : (
                    <span className="dim-cell">—</span>
                  )}
                </td>
                <td>
                  {i.returnTrackingNo ? (
                    <span className="trk">{i.returnTrackingNo}</span>
                  ) : (
                    <span className="trk is-none">—</span>
                  )}
                </td>
                <td>
                  <span className="el-cell" style={{ color: "var(--done)" }}>
                    <span className="ic">
                      {i.status === "returned" ? <Undo2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                    </span>
                    {fmtDateTime(i.handledAt, locale)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
