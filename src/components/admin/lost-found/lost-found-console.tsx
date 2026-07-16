"use client";

// Admin 분실물 console — content area for /admin/lost-found (AdminShell owns the sidebar/topbar).
// Four views: 현황 보드 / 목록·이력 / 완료 / 폐기 내역. Unlike 수리·점검 (read-centric), this console is
// where admins actively process items — 반환 / 폐기 / 보관 연장 — plus 예외 개입(상태 정정 / 삭제).
// Mirrors maintenance-console.tsx wiring 1:1. See docs/product/09-lost-found-workflow.md.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  Clock,
  Eye,
  Hourglass,
  LayoutGrid,
  Package,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { AdminLostItemVM } from "@/lib/admin-lost-found";
import type { LostReturnMethod } from "@/lib/lost-found-constants";
import {
  correctLostItemStatus,
  deleteLostItemById,
  disposeLostItem,
  extendLostItemStorage,
  restoreLostItem,
  returnLostItem,
} from "@/app/admin/lost-found/actions";
import "@/components/admin/maintenance/maintenance-console.css";
import "./lost-found-console.css";
import { defaultRangeTokyo, type LFFilters } from "./lost-found-console-data";
import { LostFoundBoard } from "./lost-found-board";
import { LostFoundList } from "./lost-found-list";
import { LostFoundDone } from "./lost-found-done";
import { LostFoundDisposal } from "./lost-found-disposal";
import { LostFoundDetailPanel, type LFActionKind } from "./lost-found-detail-panel";
import {
  LostFoundActionModal,
  type LFActionPayload,
} from "./lost-found-action-modal";

type LostFoundConsoleProps = {
  locale: Locale;
  items: AdminLostItemVM[];
  loadError: boolean;
};

type LFView = "board" | "list" | "done" | "disposal";

function isThisMonthTokyo(dateOrDateTime: string | null, monthKey: string): boolean {
  if (!dateOrDateTime) return false;
  return dateOrDateTime.slice(0, 7) === monthKey;
}

export function LostFoundConsole({ locale, items, loadError }: LostFoundConsoleProps) {
  const router = useRouter();
  const dictionary = getDictionary(locale);
  const t = dictionary.lostFound.console;
  const { toast, showToast, dismiss } = useAdminToast();

  const [view, setView] = useState<LFView>("board");
  const [filters, setFilters] = useState<LFFilters>(() => {
    const range = defaultRangeTokyo();
    return { status: "all", building: "all", reporter: "all", from: range.from, to: range.to, query: "" };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: LFActionKind; id: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const thisMonth = useMemo(() => defaultRangeTokyo().from.slice(0, 7), []);

  const kpi = useMemo(
    () => ({
      stored: items.filter((i) => i.status === "stored").length,
      soon: items.filter((i) => i.isDueSoon).length,
      expired: items.filter((i) => i.isExpired).length,
      returnedMonth: items.filter((i) => i.status === "returned" && isThisMonthTokyo(i.handledAt, thisMonth))
        .length,
      disposedMonth: items.filter(
        (i) => i.status === "disposed" && isThisMonthTokyo(i.disposedDate, thisMonth),
      ).length,
    }),
    [items, thisMonth],
  );

  const selected = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null;
  const confirmItem = confirm ? (items.find((i) => i.id === confirm.id) ?? null) : null;

  function handleFilterChange<K extends keyof LFFilters>(key: K, value: LFFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleClearFilters() {
    setFilters((prev) => ({ ...prev, status: "all", building: "all", reporter: "all", query: "" }));
  }

  function handleViewChange(next: LFView) {
    if (next === view) return;
    setView(next);
    setFilters((prev) => ({ ...prev, query: "" }));
    setSelectedId(null);
  }

  function handleSync() {
    router.refresh();
    showToast(t.tSynced);
  }

  function handleConfirmAction(kind: LFActionKind, id: string, payload: LFActionPayload) {
    startTransition(async () => {
      if (kind === "delete") {
        const result = await deleteLostItemById(id);
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

      if (kind === "return") {
        const result = await returnLostItem({
          itemId: id,
          method: (payload.method ?? "pickup") as LostReturnMethod,
          tracking: payload.tracking ?? "",
          memo: payload.memo ?? "",
        });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        setSelectedId(null);
        showToast(t.tReturn);
        router.refresh();
        return;
      }

      if (kind === "dispose") {
        const result = await disposeLostItem({ itemId: id, memo: payload.memo ?? "" });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        setSelectedId(null);
        showToast(t.tDispose);
        router.refresh();
        return;
      }

      if (kind === "extend") {
        const result = await extendLostItemStorage({
          itemId: id,
          dueDate: payload.dueDate ?? "",
          reason: payload.memo ?? "",
        });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        showToast(t.tExtend);
        router.refresh();
        return;
      }

      if (kind === "restore") {
        const result = await restoreLostItem({ itemId: id, reason: payload.memo ?? "" });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        setSelectedId(null);
        showToast(t.tRestore);
        router.refresh();
        return;
      }

      // correct
      const result = await correctLostItemStatus({
        itemId: id,
        status: (payload.status ?? "registered") as "registered" | "stored" | "disposal_scheduled",
        memo: payload.memo ?? "",
      });
      if (!result.ok) {
        showToast(t.errS);
        return;
      }
      setConfirm(null);
      showToast(t.tCorrect);
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
              <Package />
            </span>
            {t.kpiStored}
          </div>
          <div className={`opscell__v${!loadError && kpi.stored > 0 ? "" : " is-muted"}`}>{V(kpi.stored)}</div>
          <div className="opscell__sub">{loadError ? t.errT : t.kpiStoredSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Hourglass />
            </span>
            {t.kpiSoon}
          </div>
          <div className={`opscell__v${!loadError && kpi.soon > 0 ? " is-progress" : " is-muted"}`}>
            {V(kpi.soon)}
          </div>
          <div className="opscell__sub">{loadError ? t.errT : t.kpiSoonSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <TriangleAlert />
            </span>
            {t.kpiExpired}
          </div>
          <div className={`opscell__v${!loadError && kpi.expired > 0 ? " is-danger" : " is-muted"}`}>
            {V(kpi.expired)}
          </div>
          <div className="opscell__sub">
            {loadError ? (
              " "
            ) : kpi.expired ? (
              <span className="opscell__flag">
                <span className="ic">
                  <TriangleAlert />
                </span>
                {t.kpiExpired}
              </span>
            ) : (
              <span style={{ color: "var(--muted)" }}>{t.within}</span>
            )}
          </div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Undo2 />
            </span>
            {t.kpiReturned}
          </div>
          <div className={`opscell__v${loadError ? " is-muted" : " is-done"}`}>{V(kpi.returnedMonth)}</div>
          <div className="opscell__sub">{loadError ? t.errT : t.thisMonth}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Trash2 />
            </span>
            {t.kpiDisposed}
          </div>
          <div className={`opscell__v${loadError ? " is-muted" : ""}`}>{V(kpi.disposedMonth)}</div>
          <div className="opscell__sub">{loadError ? t.errT : t.thisMonth}</div>
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
          <button
            type="button"
            className={view === "disposal" ? "on" : ""}
            onClick={() => handleViewChange("disposal")}
          >
            <span className="ic">
              <Trash2 />
            </span>
            {t.vDisposal}
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
            <LostFoundBoard
              items={items}
              t={t}
              locale={locale}
              query={filters.query}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClearQuery={() => handleFilterChange("query", "")}
            />
          )
        ) : view === "list" ? (
          <LostFoundList
            items={items}
            allItems={items}
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
        ) : view === "done" ? (
          <LostFoundDone
            items={items}
            allItems={items}
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
        ) : (
          <LostFoundDisposal
            items={items}
            allItems={items}
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

      <LostFoundDetailPanel
        item={selected}
        t={t}
        locale={locale}
        onClose={() => setSelectedId(null)}
        onAction={(kind, id) => setConfirm({ kind, id })}
        disabled={confirm !== null}
      />

      {confirm && confirmItem ? (
        <LostFoundActionModal
          kind={confirm.kind}
          item={confirmItem}
          t={t}
          locale={locale}
          sharedLabels={dictionary.admin.shared}
          pending={isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={handleConfirmAction}
        />
      ) : null}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </>
  );
}
