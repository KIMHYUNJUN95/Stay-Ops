"use client";

// Admin cleaning console — "기록" (history) board: date-range + building/staff/status filter
// toolbar over a flat table of past cleaning records, mirroring clean-views.js historyToolbar()/
// historyBoard(). The date range uses the shared single-field AdminDateRangePicker (matches the
// design handoff's combined "시작일 – 종료일" trigger 1:1, not two separate date fields). Data is
// real (src/lib/admin-cleaning.ts) as of 2026-07-14 — the parent owns fetching a fresh range via
// fetchAdminCleaningHistory; this component only filters/renders whatever range it's given.
import { Search, X } from "lucide-react";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { AdminExportButtons, type AdminExportLabels } from "@/components/admin/shared/admin-export-buttons";
import type { Locale } from "@/lib/i18n";
import {
  exportCleaningHistoryReport,
  exportCleaningHistoryWorkbook,
  type CleaningHistoryExportRow,
} from "@/app/admin/cleaning/actions";
import type { AdminCleaningHistoryItem } from "@/lib/admin-cleaning";
import { BUILDING_ORDER, fmtDate, fmtDur, type BuildingKey } from "./cleaning-console-data";
import {
  StaffAvatar,
  buildingLabelOf,
  localeTagOf,
  staffLabelOf,
  typeLabel,
  type ConsoleCopy,
  type StaffDirectory,
} from "./cleaning-console-shared";

type HistoryBoardProps = {
  history: AdminCleaningHistoryItem[];
  t: ConsoleCopy;
  sharedLabels: AdminExportLabels;
  buildingLabels: Record<string, string>;
  staffDirectory: StaffDirectory;
  locale: Locale;
  propFilter: BuildingKey | "all";
  onPropFilterChange: (v: BuildingKey | "all") => void;
  staffFilter: string;
  onStaffFilterChange: (v: string) => void;
  statusFilter: "all" | "normal" | "proxy";
  onStatusFilterChange: (v: "all" | "normal" | "proxy") => void;
  query: string;
  onQueryChange: (v: string) => void;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  rangeLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToast: (message: string) => void;
  onClearFilters: () => void;
};

export function HistoryBoard({
  history,
  t,
  sharedLabels,
  buildingLabels,
  staffDirectory,
  locale,
  propFilter,
  onPropFilterChange,
  staffFilter,
  onStaffFilterChange,
  statusFilter,
  onStatusFilterChange,
  query,
  onQueryChange,
  from,
  to,
  onRangeChange,
  rangeLoading,
  selectedId,
  onSelect,
  onToast,
  onClearFilters,
}: HistoryBoardProps) {
  const localeTag = localeTagOf(locale);
  const q = query.trim().toLowerCase();
  const rows = history.filter((h) => {
    if (h.date < from || h.date > to) return false;
    if (propFilter !== "all" && h.building !== propFilter) return false;
    if (staffFilter !== "all" && h.staffId !== staffFilter) return false;
    if (statusFilter === "proxy" && !h.proxy) return false;
    if (statusFilter === "normal" && h.proxy) return false;
    if (q) {
      const buildingText = buildingLabelOf(h, buildingLabels).toLowerCase();
      if (!h.room.toLowerCase().includes(q) && !h.staffName.toLowerCase().includes(q) && !buildingText.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const exportRows: CleaningHistoryExportRow[] = rows.map((h) => ({
    date: h.date,
    building: h.building,
    buildingRaw: h.buildingRaw,
    room: h.room,
    type: h.type,
    staffName: h.staffName,
    start: h.start,
    dur: h.dur,
    proxy: h.proxy,
    note: h.note,
  }));

  const rangePickerLabels = {
    prevMonth: sharedLabels.datePrevMonth,
    nextMonth: sharedLabels.dateNextMonth,
    thisMonth: sharedLabels.dateThisMonth,
    reset: sharedLabels.dateReset,
    apply: sharedLabels.dateApply,
  };

  const staffOptions = [...staffDirectory.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const toolbar = (
    <div className="ctoolbar">
      <AdminDateRangePicker
        from={from}
        to={to}
        onChange={onRangeChange}
        localeTag={localeTag}
        ariaLabel={sharedLabels.pickRange}
        labels={rangePickerLabels}
      />
      <AdmDropdown
        size="sm"
        value={propFilter}
        onChange={(v) => onPropFilterChange(v as BuildingKey | "all")}
        ariaLabel={t.building}
        options={[
          { value: "all", label: t.allProp },
          ...BUILDING_ORDER.map((b) => ({ value: b, label: buildingLabels[b] ?? b })),
        ]}
      />
      <AdmDropdown
        size="sm"
        value={staffFilter}
        onChange={onStaffFilterChange}
        ariaLabel={t.staff}
        options={[{ value: "all", label: t.allStaff }, ...staffOptions.map((s) => ({ value: s.id, label: s.name }))]}
      />
      <AdmDropdown
        size="sm"
        value={statusFilter}
        onChange={(v) => onStatusFilterChange(v as "all" | "normal" | "proxy")}
        ariaLabel={t.status}
        options={[
          { value: "all", label: t.allStatus },
          { value: "normal", label: t.stNormal },
          { value: "proxy", label: t.stProxy },
        ]}
      />
      <div className="qsearch qsearch--inline">
        <span className="ic">
          <Search />
        </span>
        <input placeholder={t.searchStaff} value={query} onChange={(e) => onQueryChange(e.target.value)} />
        {query ? (
          <button type="button" className="qsearch__clear" onClick={() => onQueryChange("")}>
            <span className="ic">
              <X />
            </span>
          </button>
        ) : null}
      </div>
      <span className="ctoolbar__spacer" />
      <AdminExportButtons
        onExportXls={() => exportCleaningHistoryWorkbook(exportRows, from, to)}
        onExportPdf={() => exportCleaningHistoryReport(exportRows, from, to)}
        disabled={!rows.length}
        onToast={onToast}
        labels={sharedLabels}
      />
    </div>
  );

  if (rangeLoading) {
    return (
      <>
        {toolbar}
        <div className="card">
          <div className="state">
            <div className="state__ic empty">
              <Search aria-hidden="true" />
            </div>
            <div className="state__t">{t.histLoading}</div>
          </div>
        </div>
      </>
    );
  }

  if (!rows.length) {
    return (
      <>
        {toolbar}
        <div className="card">
          <div className="state">
            <div className="state__ic empty">
              <Search aria-hidden="true" />
            </div>
            <div className="state__t">{t.histEmptyT}</div>
            <div className="state__s">{t.histEmptyS}</div>
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
          {t.unitRecords}
        </b>
        <span className="sep" />
        {fmtDate(from, localeTag)} – {fmtDate(to, localeTag)}
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="qtbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{t.colRoom}</th>
              <th>{t.colType}</th>
              <th>{t.colStaff}</th>
              <th>{t.colStatus}</th>
              <th>{t.colStart}</th>
              <th>{t.colDur}</th>
              <th>{t.colDate}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              return (
                <tr key={h.id} className={selectedId === h.id ? "sel" : ""} onClick={() => onSelect(h.id)}>
                  <td style={{ paddingLeft: 16 }}>
                    <span className="rrow__rm mono">{h.room}</span>
                    <div className="who__sub" style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>
                      {buildingLabelOf(h, buildingLabels)}
                    </div>
                  </td>
                  <td>
                    <span className="htype">{typeLabel(h.type, t)}</span>
                  </td>
                  <td>
                    <span className="who">
                      <StaffAvatar staffId={h.staffId} directory={staffDirectory} className="who__av" />
                      <span className="who__nm">{staffLabelOf(h.staffId, staffDirectory)}</span>
                      {h.proxy ? (
                        <span className="proxytag" style={{ marginLeft: 2 }}>
                          {t.proxy}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <span className="cstat cstat--done">
                      <span className="d" />
                      {t.stDone}
                    </span>
                  </td>
                  <td className="mono">{h.start}</td>
                  <td>
                    <span className="hdur">{fmtDur(h.dur)}</span>
                  </td>
                  <td className="dim-cell mono">{fmtDate(h.date, localeTag)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
