"use client";

// Admin cleaning console — content area for /admin/cleaning (AdminShell owns the sidebar/topbar).
// Two segmented views: 오늘 현황 (live room-status board) and 기록 (filterable history table), plus
// a shared right-side detail panel and the force-complete modal. Data is real (cleaning_sessions +
// reservations, via src/lib/admin-cleaning.ts) as of 2026-07-14 — see docs/product/07-cleaning-workflow.md
// → "2026-07-14 어드민 청소 대시보드 — 백엔드 연동". Mirrors clean-views.js shell()/opsbar()/viewtabs()
// from the original design handoff.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, BedDouble, Check, Clock, History, RefreshCw, SprayCan } from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import type { AdminCleaningHistoryItem, AdminCleaningTask, AdminSettingTarget } from "@/lib/admin-cleaning";
import type { CleaningStaffOption } from "@/lib/cleaning";
import { fetchAdminCleaningHistory, forceCompleteCleaningSession } from "@/app/admin/cleaning/actions";
import "./cleaning-console.css";
import { nowLabelTokyo, type BuildingKey } from "./cleaning-console-data";
import { buildStaffDirectory } from "./cleaning-console-shared";
import { TodayBoard } from "./cleaning-today-board";
import { HistoryBoard } from "./cleaning-history-board";
import { CleaningDetailPanel } from "./cleaning-detail-panel";
import { CleaningForceCompleteModal, type ForceCompleteResult } from "./cleaning-force-complete-modal";

type CleaningConsoleProps = {
  locale: Locale;
  tasks: AdminCleaningTask[];
  setupTargets: AdminSettingTarget[];
  staff: CleaningStaffOption[];
  loadError: boolean;
  initialHistory: AdminCleaningHistoryItem[];
  initialHistoryFrom: string;
  initialHistoryTo: string;
};

function syncAgoText(lastSyncAt: number, t: Dictionary["cleaning"]["console"], locale: Locale): string {
  const mins = Math.round((Date.now() - lastSyncAt) / 60000);
  if (mins < 1) return t.syncAgo;
  if (locale === "ja") return `${mins}分前`;
  if (locale === "en") return `${mins} min ago`;
  return `${mins}분 전`;
}

// Kept as a module-level helper (not inline in the component) so the impure `Date.now()` call sits
// outside the render-scope purity check; only invoked from event handlers below.
function nowTimestamp(): number {
  return Date.now();
}

export function CleaningConsole({
  locale,
  tasks,
  setupTargets,
  staff,
  loadError,
  initialHistory,
  initialHistoryFrom,
  initialHistoryTo,
}: CleaningConsoleProps) {
  const router = useRouter();
  const dictionary = getDictionary(locale);
  const t = dictionary.cleaning.console;
  const buildingLabels = dictionary.cleaning.buildingLabels;
  const { toast, showToast, dismiss } = useAdminToast();

  const staffDirectory = useMemo(() => buildStaffDirectory(staff), [staff]);

  const [view, setView] = useState<"today" | "history">("today");
  const [group, setGroup] = useState<"building" | "status">("building");
  const [propFilter, setPropFilter] = useState<BuildingKey | "all">("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSetupKey, setSelectedSetupKey] = useState<string | null>(null);
  const [modalTask, setModalTask] = useState<AdminCleaningTask | null>(null);

  const [history, setHistory] = useState<AdminCleaningHistoryItem[]>(initialHistory);
  const [historyFrom, setHistoryFrom] = useState(initialHistoryFrom);
  const [historyTo, setHistoryTo] = useState(initialHistoryTo);
  const [historyStatus, setHistoryStatus] = useState<"all" | "normal" | "proxy">("all");
  const [isHistoryPending, startHistoryFetch] = useTransition();
  const [isForcePending, startForceComplete] = useTransition();

  const [lastSyncAt, setLastSyncAt] = useState(() => Date.now());
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (view !== "today") return;
    const id = setInterval(() => {
      router.refresh();
      setLastSyncAt(nowTimestamp());
    }, 60000);
    return () => clearInterval(id);
  }, [view, router]);

  const pendingCount = tasks.filter((task) => task.status === "pending").length;
  const progressCount = tasks.filter((task) => task.status === "progress").length;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const rate = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const setupCount = setupTargets.length;

  const selectedTask = view === "today" && selectedId ? (tasks.find((task) => task.id === selectedId) ?? null) : null;
  const selectedHistory = view === "history" && selectedId ? (history.find((h) => h.id === selectedId) ?? null) : null;
  const selectedSetupTarget =
    view === "today" && selectedSetupKey ? (setupTargets.find((target) => target.roomKey === selectedSetupKey) ?? null) : null;

  function handleSelect(id: string) {
    setSelectedSetupKey(null);
    setSelectedId(id);
  }

  function handleSelectSetupTarget(roomKey: string) {
    setSelectedId(null);
    setSelectedSetupKey(roomKey);
  }

  function handleCloseDetail() {
    setSelectedId(null);
    setSelectedSetupKey(null);
  }

  function handleClearFilters() {
    setPropFilter("all");
    setStaffFilter("all");
    setHistoryStatus("all");
    setQuery("");
  }

  function handleViewChange(next: "today" | "history") {
    if (next === view) return;
    setView(next);
    setQuery("");
    setSelectedId(null);
    setSelectedSetupKey(null);
  }

  // Navigates to the linked lost-item/maintenance-report record. History rows never carry `reports`
  // (only today's session-backed tasks do — see admin-cleaning.ts), so this only fires for the today
  // board. Multiple linked records for one session are rare; falls back to the list screen for them.
  function handleOpenReport(kind: "lost" | "issue") {
    const ids = kind === "lost" ? selectedTask?.reports?.lostIds : selectedTask?.reports?.issueIds;
    if (!ids || ids.length === 0) return;
    const base = kind === "lost" ? "/admin/lost-found" : "/admin/maintenance";
    router.push(ids.length === 1 ? `${base}/${ids[0]}` : base);
  }

  function handleHistoryRangeChange(from: string, to: string) {
    setHistoryFrom(from);
    setHistoryTo(to);
    startHistoryFetch(async () => {
      const res = await fetchAdminCleaningHistory(from, to);
      if (res.ok) {
        setHistory(res.items);
      } else {
        showToast(t.errS);
      }
    });
  }

  function handleForceCompleteConfirm(result: ForceCompleteResult) {
    const roomLabel = modalTask?.room ?? "";
    startForceComplete(async () => {
      const res = await forceCompleteCleaningSession(result);
      if (res.ok) {
        showToast(`${t.tDone} · ${roomLabel}`);
        setModalTask(null);
        router.refresh();
      } else {
        showToast(t.tDoneFailed);
      }
    });
  }

  function handleSync() {
    router.refresh();
    setLastSyncAt(nowTimestamp());
    showToast(t.tSynced);
  }

  return (
    <>
      <div className="opsbar opsbar--6">
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <SprayCan />
            </span>
            {t.kpiTarget}
          </div>
          <div className="opscell__v">{loadError ? "-" : tasks.length}</div>
          <div className="opscell__sub">{loadError ? t.errT : t.today}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Clock />
            </span>
            {t.kpiPending}
          </div>
          <div className={`opscell__v${!loadError && pendingCount > 0 ? " is-danger" : " is-muted"}`}>
            {loadError ? "-" : pendingCount}
          </div>
          <div className="opscell__sub">
            {loadError ? (
              t.errT
            ) : pendingCount ? (
              t.today
            ) : (
              <span style={{ color: "var(--done)", fontWeight: 800 }}>{t.stDone}</span>
            )}
          </div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <SprayCan />
            </span>
            {t.kpiProgress}
          </div>
          <div className={`opscell__v${!loadError && progressCount > 0 ? " is-progress" : " is-muted"}`}>
            {loadError ? "-" : progressCount}
          </div>
          <div className="opscell__sub">{loadError ? t.errT : progressCount > 0 ? t.live : t.today}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Check />
            </span>
            {t.kpiDone}
          </div>
          <div className="opscell__v is-done">{loadError ? "-" : doneCount}</div>
          <div className="opscell__sub">{loadError ? t.errT : `/ ${tasks.length}`}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <BarChart3 />
            </span>
            {t.kpiRate}
          </div>
          <div className="opscell__v">{loadError ? "-" : `${rate}%`}</div>
          <div className="opscell__bar" style={{ marginTop: 4 }}>
            <i style={{ width: `${loadError ? 0 : rate}%` }} />
          </div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <BedDouble />
            </span>
            {t.kpiSetup}
          </div>
          <div className="opscell__v">{loadError ? "-" : setupCount}</div>
          <div className="opscell__sub">{loadError ? t.errT : setupCount > 0 ? t.arriving : t.today}</div>
        </div>
      </div>

      <div className="cviewbar">
        <div className="lviews" style={{ margin: 0 }}>
          <button type="button" className={view === "today" ? "on" : ""} onClick={() => handleViewChange("today")}>
            <span className="ic">
              <SprayCan />
            </span>
            {t.vToday}
          </button>
          <button type="button" className={view === "history" ? "on" : ""} onClick={() => handleViewChange("history")}>
            <span className="ic">
              <History />
            </span>
            {t.vHistory}
          </button>
        </div>
        <span style={{ flex: 1 }} />
        {view === "today" ? (
          <>
            <div className="groupseg">
              <button type="button" className={group === "building" ? "on" : ""} onClick={() => setGroup("building")}>
                {t.byBuilding}
              </button>
              <button type="button" className={group === "status" ? "on" : ""} onClick={() => setGroup("status")}>
                {t.byStatus}
              </button>
            </div>
            <button type="button" className="syncchip" onClick={handleSync}>
              <span className="syncchip__dot" />
              {t.syncLabel} · {syncAgoText(lastSyncAt, t, locale)}
              <span className="ic">
                <RefreshCw />
              </span>
            </button>
          </>
        ) : null}
      </div>

      <div className="cbody">
        {view === "today" ? (
          <TodayBoard
            tasks={tasks}
            setupTargets={setupTargets}
            staffDirectory={staffDirectory}
            t={t}
            buildingLabels={buildingLabels}
            group={group}
            propFilter={propFilter}
            staffFilter={staffFilter}
            query={query}
            selectedId={selectedId}
            onSelect={handleSelect}
            selectedSetupKey={selectedSetupKey}
            onSelectSetupTarget={handleSelectSetupTarget}
            onClearFilters={handleClearFilters}
          />
        ) : (
          <HistoryBoard
            history={history}
            t={t}
            sharedLabels={dictionary.admin.shared}
            buildingLabels={buildingLabels}
            staffDirectory={staffDirectory}
            locale={locale}
            propFilter={propFilter}
            onPropFilterChange={setPropFilter}
            staffFilter={staffFilter}
            onStaffFilterChange={setStaffFilter}
            statusFilter={historyStatus}
            onStatusFilterChange={setHistoryStatus}
            query={query}
            onQueryChange={setQuery}
            from={historyFrom}
            to={historyTo}
            onRangeChange={handleHistoryRangeChange}
            rangeLoading={isHistoryPending}
            selectedId={selectedId}
            onSelect={handleSelect}
            onToast={showToast}
            onClearFilters={handleClearFilters}
          />
        )}
      </div>

      <CleaningDetailPanel
        task={selectedTask}
        history={selectedHistory}
        setupTarget={selectedSetupTarget}
        t={t}
        buildingLabels={buildingLabels}
        staffDirectory={staffDirectory}
        locale={locale}
        onClose={handleCloseDetail}
        onOpenForceComplete={setModalTask}
        onOpenReport={handleOpenReport}
        disabled={modalTask !== null}
      />

      {modalTask ? (
        <CleaningForceCompleteModal
          task={modalTask}
          nowLabel={nowLabelTokyo()}
          t={t}
          buildingLabels={buildingLabels}
          staffDirectory={staffDirectory}
          pending={isForcePending}
          onCancel={() => setModalTask(null)}
          onConfirm={handleForceCompleteConfirm}
        />
      ) : null}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </>
  );
}
