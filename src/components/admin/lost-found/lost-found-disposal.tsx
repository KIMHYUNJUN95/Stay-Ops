"use client";

// Admin 분실물 console — 폐기 내역 뷰(vDisposal). 폐기 완료(disposed)만, 90일 자동 삭제까지의 시계를
// 보여준다. 자동/수동 폐기 구분과 삭제 임박 강조가 이 뷰의 핵심.
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { Info, Pencil, Search, Trash2, TriangleAlert, X } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { AdminLostItemVM } from "@/lib/admin-lost-found";
import {
  buildingOptionsOf,
  fmtDate,
  reporterOptionsOf,
  type LFFilters,
} from "./lost-found-console-data";
import {
  CategoryChip,
  DelDdayBadge,
  PhotoBadge,
  localeTagOf,
  type LFCopy,
} from "./lost-found-console-shared";

type DisposalProps = {
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

export function LostFoundDisposal({
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
}: DisposalProps) {
  const localeTag = localeTagOf(locale);
  const disposedItems = allItems.filter((i) => i.status === "disposed");
  const buildingOptions = buildingOptionsOf(disposedItems);
  const reporterOptions = reporterOptionsOf(disposedItems);

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

  const banner = (
    <div className="lfbanner">
      <span className="ic">
        <Info aria-hidden="true" />
      </span>
      {t.disposalBanner}
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
    .filter((i) => i.status === "disposed")
    .filter((i) => {
      const day = i.disposedDate ?? "";
      if (day < filters.from || day > filters.to) return false;
      if (filters.building !== "all" && i.buildingLabel !== filters.building) return false;
      if (filters.reporter !== "all" && i.reporterId !== filters.reporter) return false;
      if (q && !i.itemName.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => (a.deleteDaysLeft ?? 0) - (b.deleteDaysLeft ?? 0));

  if (!rows.length) {
    return (
      <>
        {toolbar}
        {banner}
        <div className="card">
          <div className="state">
            <div className="state__ic empty">
              <Trash2 aria-hidden="true" />
            </div>
            <div className="state__t">{t.disposalEmptyT}</div>
            <div className="state__s">{t.disposalEmptyS}</div>
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
      {banner}
      <div className="hmeta">
        <b style={{ color: "var(--ink-soft)" }}>
          {rows.length}
          {unitOf(locale)}
        </b>
      </div>
      <div className="card" style={{ overflow: "auto" }}>
        <table className="qtbl mtbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{t.colItem}</th>
              <th>{t.colBuilding}</th>
              <th>{t.pGuest}</th>
              <th>{t.colDisposedAt}</th>
              <th>{t.colDeleteBy}</th>
              <th>{t.colDeleteDday}</th>
              <th>{t.colDisposeMode}</th>
              <th>{t.pPhotos}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const soon = i.isDeleteSoon;
              return (
                <tr
                  key={i.id}
                  className={[soon ? "row-warn" : "", selectedId === i.id ? "sel" : ""].filter(Boolean).join(" ")}
                  onClick={() => onSelect(i.id)}
                >
                  <td style={{ paddingLeft: 16 }}>
                    <span className="tt-title">{i.itemName}</span>
                    {soon ? (
                      <span className="dday dday--delete" style={{ marginLeft: 8 }}>
                        <span className="ic">
                          <TriangleAlert aria-hidden="true" />
                        </span>
                        {t.deleteSoon}
                      </span>
                    ) : null}
                    <div className="tt-loc">
                      <CategoryChip category={i.category} t={t} />
                    </div>
                  </td>
                  <td className="dim-cell">{i.buildingLabel}</td>
                  <td className="dim-cell">{i.guest?.name ?? "—"}</td>
                  <td className="dim-cell mono">{i.disposedDate ? fmtDate(i.disposedDate, locale) : "—"}</td>
                  <td>
                    <span className={`due-cell${soon ? " is-expired" : ""}`}>
                      {i.deleteDate ? fmtDate(i.deleteDate, locale) : "—"}
                    </span>
                  </td>
                  <td>
                    <DelDdayBadge daysLeft={i.deleteDaysLeft ?? 0} soon={soon} t={t} />
                  </td>
                  <td>
                    {i.isAutoDisposed ? (
                      <span className="syschip">
                        <span className="ic">
                          <TriangleAlert aria-hidden="true" />
                        </span>
                        {t.sysAuto}
                      </span>
                    ) : (
                      <span className="meth">
                        <span className="ic">
                          <Pencil aria-hidden="true" />
                        </span>
                        {t.modeManual}
                      </span>
                    )}
                  </td>
                  <td>
                    <PhotoBadge count={i.photoCount} t={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
