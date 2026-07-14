"use client";

// Admin 수리·점검 console — content area for /admin/maintenance (AdminShell owns the sidebar/topbar).
// Three views: 현황 보드 / 목록·이력 / 완료. READ-CENTRIC — 배정·칸반 드래그·채팅이 없고, 처리(확인·
// 상태 변경·처리 메모·완료 사진)는 현장이 모바일에서 한다. 관리자는 열람 + 예외 개입만.
//
// Data is REAL (src/lib/admin-maintenance.ts) as of 2026-07-14 — 예외 개입(강제 완료 / 무효 처리 /
// 삭제)도 실제 서버 액션이다. See docs/product/08-maintenance-workflow.md.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Clock, Eye, Flag, Inbox, LayoutGrid, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { AdminMaintenanceReport } from "@/lib/admin-maintenance";
import { applyMaintenanceException, deleteMaintenanceReportById } from "@/app/admin/maintenance/actions";
import "./maintenance-console.css";
import { defaultRangeTokyo, isActive } from "./maintenance-console-data";
import { MaintenanceBoard } from "./maintenance-board";
import { MaintenanceList, type MaintFilters } from "./maintenance-list";
import { MaintenanceDetailPanel, type MaintExceptionKind } from "./maintenance-detail-panel";
import { MaintenanceConfirmModal } from "./maintenance-confirm-modal";

type MaintenanceConsoleProps = {
  locale: Locale;
  reports: AdminMaintenanceReport[];
  loadError: boolean;
};

type MaintView = "board" | "list" | "done";

export function MaintenanceConsole({ locale, reports, loadError }: MaintenanceConsoleProps) {
  const router = useRouter();
  const dictionary = getDictionary(locale);
  const t = dictionary.maintenance.console;
  const { toast, showToast, dismiss } = useAdminToast();

  const [view, setView] = useState<MaintView>("board");
  const [filters, setFilters] = useState<MaintFilters>(() => {
    const range = defaultRangeTokyo();
    return {
      status: "all",
      priority: "all",
      category: "all",
      building: "all",
      reporter: "all",
      from: range.from,
      to: range.to,
      query: "",
    };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: MaintExceptionKind; id: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const kpi = useMemo(
    () => ({
      open: reports.filter((r) => r.status === "open").length,
      progress: reports.filter((r) => r.status === "in_progress").length,
      urgent: reports.filter((r) => r.priority === "urgent" && isActive(r)).length,
      aging: reports.filter((r) => r.aging).length,
      resolved: reports.filter((r) => r.status === "closed").length,
    }),
    [reports],
  );

  const selected = selectedId ? (reports.find((r) => r.id === selectedId) ?? null) : null;
  const confirmReport = confirm ? (reports.find((r) => r.id === confirm.id) ?? null) : null;

  function handleFilterChange<K extends keyof MaintFilters>(key: K, value: MaintFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleClearFilters() {
    setFilters((prev) => ({
      ...prev,
      status: "all",
      priority: "all",
      category: "all",
      building: "all",
      reporter: "all",
      query: "",
    }));
  }

  function handleViewChange(next: MaintView) {
    if (next === view) return;
    setView(next);
    setFilters((prev) => ({ ...prev, query: "" }));
    setSelectedId(null);
  }

  function handleSync() {
    router.refresh();
    showToast(t.tSynced);
  }

  function handleConfirmException(kind: MaintExceptionKind, id: string, memo: string) {
    startTransition(async () => {
      if (kind === "del") {
        const result = await deleteMaintenanceReportById(id);
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        setSelectedId(null);
        showToast(t.tDel);
        router.refresh();
        return;
      }

      const result = await applyMaintenanceException({ kind, memo, reportId: id });
      if (!result.ok) {
        showToast(t.errS);
        return;
      }
      setConfirm(null);
      showToast(kind === "force" ? t.tForce : t.tVoid);
      router.refresh();
    });
  }

  const V = (value: number) => (loadError ? "–" : value);

  return (
    <>
      <div className="opsbar opsbar--5">
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Inbox />
            </span>
            {t.kpiOpen}
          </div>
          <div className={`opscell__v${!loadError && kpi.open > 0 ? "" : " is-muted"}`}>{V(kpi.open)}</div>
          <div className="opscell__sub">{loadError ? t.errT : t.readonly}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Wrench />
            </span>
            {t.kpiProg}
          </div>
          <div className={`opscell__v${!loadError && kpi.progress > 0 ? " is-progress" : " is-muted"}`}>
            {V(kpi.progress)}
          </div>
          <div className="opscell__sub">{loadError ? t.errT : t.live}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Flag />
            </span>
            {t.kpiUrgent}
          </div>
          <div className={`opscell__v${!loadError && kpi.urgent > 0 ? " is-danger" : " is-muted"}`}>
            {V(kpi.urgent)}
          </div>
          <div className="opscell__sub">
            {loadError ? (
              " "
            ) : kpi.urgent ? (
              <span className="opscell__flag">
                <span className="ic">
                  <TriangleAlert />
                </span>
                {t.kpiUrgent}
              </span>
            ) : (
              <span style={{ color: "var(--muted)" }}>{t.within}</span>
            )}
          </div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Clock />
            </span>
            {t.kpiOld}
          </div>
          <div className={`opscell__v${!loadError && kpi.aging > 0 ? " is-danger" : " is-muted"}`}>
            {V(kpi.aging)}
          </div>
          <div className="opscell__sub">
            {loadError ? (
              " "
            ) : kpi.aging ? (
              <span className="opscell__flag">
                <span className="ic">
                  <TriangleAlert />
                </span>
                {t.oldSub}
              </span>
            ) : (
              <span style={{ color: "var(--done)", fontWeight: 800 }}>{t.within}</span>
            )}
          </div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Check />
            </span>
            {t.kpiResolved}
          </div>
          <div className={`opscell__v${loadError ? " is-muted" : " is-done"}`}>{V(kpi.resolved)}</div>
          <div className="opscell__sub">{loadError ? t.errT : t.within}</div>
        </div>
      </div>

      <div className="cviewbar">
        <div className="lviews" style={{ margin: 0 }}>
          <button type="button" className={view === "board" ? "on" : ""} onClick={() => handleViewChange("board")}>
            <span className="ic">
              <LayoutGrid />
            </span>
            {t.vBoard}
          </button>
          <button type="button" className={view === "list" ? "on" : ""} onClick={() => handleViewChange("list")}>
            <span className="ic">
              <Clock />
            </span>
            {t.vList}
          </button>
          <button type="button" className={view === "done" ? "on" : ""} onClick={() => handleViewChange("done")}>
            <span className="ic">
              <CircleCheck />
            </span>
            {t.vDone}
          </button>
        </div>
        <span style={{ flex: 1 }} />
        {view === "board" ? (
          <>
            <span className="robadge">
              <span className="ic">
                <Eye />
              </span>
              {t.readonly}
            </span>
            <button type="button" className="syncchip" onClick={handleSync}>
              <span className="syncchip__dot" />
              {t.syncLabel} · {t.syncAgo}
              <span className="ic">
                <RefreshCw />
              </span>
            </button>
          </>
        ) : null}
      </div>

      <div className="cbody">
        {view === "board" ? (
          loadError ? (
            <div className="card">
              <div className="state">
                <div className="state__ic err">
                  <TriangleAlert aria-hidden="true" />
                </div>
                <div className="state__t">{t.errT}</div>
                <div className="state__s">{t.errS}</div>
                <button type="button" className="btn btn--pri btn--sm" style={{ marginTop: 16 }} onClick={handleSync}>
                  {t.retry}
                </button>
              </div>
            </div>
          ) : (
            <MaintenanceBoard
              reports={reports}
              t={t}
              locale={locale}
              query={filters.query}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClearQuery={() => handleFilterChange("query", "")}
            />
          )
        ) : (
          <MaintenanceList
            scope={view}
            reports={reports}
            allReports={reports}
            t={t}
            sharedLabels={dictionary.admin.shared}
            locale={locale}
            filters={filters}
            onFilterChange={handleFilterChange}
            onRangeChange={(from, to) => setFilters((prev) => ({ ...prev, from, to }))}
            onClearFilters={handleClearFilters}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loadError={loadError}
            onRetry={handleSync}
          />
        )}
      </div>

      <MaintenanceDetailPanel
        report={selected}
        t={t}
        locale={locale}
        onClose={() => setSelectedId(null)}
        onException={(kind, id) => setConfirm({ kind, id })}
        onOpenLink={() => showToast(t.tLink)}
        disabled={confirm !== null}
      />

      {confirm && confirmReport ? (
        <MaintenanceConfirmModal
          kind={confirm.kind}
          report={confirmReport}
          t={t}
          pending={isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={handleConfirmException}
        />
      ) : null}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </>
  );
}
