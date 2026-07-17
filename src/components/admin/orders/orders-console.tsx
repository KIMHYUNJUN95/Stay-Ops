"use client";

// Admin 주문·비품 console — content area for /admin/orders (AdminShell owns the sidebar/topbar).
// Four views: 현황 보드 / 목록·이력 / 배송 예정 / 완료. 처리형 콘솔: 승인 → 주문 처리 → 배송일 기입 →
// 캘린더 반영을 사무실에서 직접 진행하고, 예외 개입(요청 수정/상태 정정/재오픈/삭제)도 여기서 한다.
// Mirrors lost-found-console.tsx / maintenance-console.tsx wiring 1:1.
// See docs/product/10-order-request-workflow.md.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleCheck,
  Clock,
  Inbox,
  LayoutGrid,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  Truck,
  Zap,
} from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { AdminOrderVM } from "@/lib/admin-orders";
import {
  rejectOrder,
  reopenOrder,
  correctOrderStatus,
  editOrder,
} from "@/app/admin/orders/actions";
import { updateOrderRequestStatus, updateOrderDeliveryDate } from "@/app/mobile/requests/orders/actions";
import { deleteOrderRequest } from "@/app/mobile/requests/delete-actions";
import "@/components/admin/maintenance/maintenance-console.css";
import "./orders-console.css";
import { delivStart, inThisMonth, iso, isActiveStatus, isDelivThisWeek } from "./orders-console-data";
import { ErrorState, type OrdersFilters } from "./orders-console-shared";
import { OrdersBoard } from "./orders-board";
import { OrdersList } from "./orders-list";
import { OrdersCalendar, type CalMonth } from "./orders-calendar";
import { OrdersClosed } from "./orders-closed";
import { OrdersDetailPanel, type OrdActionKind } from "./orders-detail-panel";
import { OrdersActionModal, type OrdActionPayload } from "./orders-action-modal";

type OrdersConsoleProps = {
  locale: Locale;
  orders: AdminOrderVM[];
  loadError: boolean;
  todayKey: string;
};

type OrdView = "board" | "list" | "cal" | "closed";

function defaultMonthRange(todayKey: string): { from: string; to: string } {
  const y = +todayKey.slice(0, 4);
  const m0 = +todayKey.slice(5, 7) - 1;
  const days = new Date(y, m0 + 1, 0).getDate();
  return { from: iso(y, m0, 1), to: iso(y, m0, days) };
}

export function OrdersConsole({ locale, orders, loadError, todayKey }: OrdersConsoleProps) {
  const router = useRouter();
  const dictionary = getDictionary(locale);
  const t = dictionary.admin.orders.console;
  const { toast, showToast, dismiss } = useAdminToast();

  const [view, setView] = useState<OrdView>("board");
  const [filters, setFilters] = useState<OrdersFilters>(() => {
    const range = defaultMonthRange(todayKey);
    return { status: "all", urgency: "all", prop: "all", reporter: "all", from: range.from, to: range.to, query: "" };
  });
  const [calProp, setCalProp] = useState("all");
  const [calSel, setCalSel] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<CalMonth>(() => ({
    y: +todayKey.slice(0, 4),
    m: +todayKey.slice(5, 7) - 1,
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: OrdActionKind; id: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const kpi = useMemo(
    () => ({
      requested: orders.filter((o) => o.status === "requested").length,
      approved: orders.filter((o) => o.status === "approved").length,
      urgent: orders.filter((o) => o.urgency === "high" && isActiveStatus(o.status)).length,
      delivWeek: orders.filter((o) => isDelivThisWeek(o, todayKey)).length,
      orderedMo: orders.filter((o) => o.status === "ordered" && inThisMonth(delivStart(o.deliv), todayKey)).length,
    }),
    [orders, todayKey],
  );

  const selected = selectedId ? (orders.find((o) => o.id === selectedId) ?? null) : null;
  const confirmOrder = confirm ? (orders.find((o) => o.id === confirm.id) ?? null) : null;

  function handleFilterChange<K extends keyof OrdersFilters>(key: K, value: OrdersFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleClearFilters() {
    setFilters((prev) => ({ ...prev, status: "all", urgency: "all", prop: "all", reporter: "all", query: "" }));
  }

  function handleViewChange(next: OrdView) {
    if (next === view) return;
    setView(next);
    setFilters((prev) => ({ ...prev, query: "" }));
    setSelectedId(null);
  }

  function handleSync() {
    router.refresh();
    showToast(t.tSynced);
  }

  function handleConfirmAction(kind: OrdActionKind, id: string, payload: OrdActionPayload) {
    startTransition(async () => {
      if (kind === "approve") {
        const result = await updateOrderRequestStatus({ orderId: id, targetStatus: "approved" });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        showToast(t.tApprove);
        router.refresh();
        return;
      }

      if (kind === "reject") {
        const result = await rejectOrder({ orderId: id, reason: payload.memo ?? "" });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        setSelectedId(null);
        showToast(t.tReject);
        router.refresh();
        return;
      }

      if (kind === "process") {
        const result = await updateOrderRequestStatus({
          orderId: id,
          targetStatus: "ordered",
          deliveryMode: payload.mode === "range" ? "range" : "exact",
          deliveryDate: payload.date,
          deliveryStartDate: payload.start,
          deliveryEndDate: payload.end,
        });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        showToast(t.tProcess);
        router.refresh();
        return;
      }

      if (kind === "editdeliv") {
        const result = await updateOrderDeliveryDate({
          orderId: id,
          deliveryMode: payload.mode === "range" ? "range" : "exact",
          deliveryDate: payload.date,
          deliveryStartDate: payload.start,
          deliveryEndDate: payload.end,
        });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        showToast(t.tEditDeliv);
        router.refresh();
        return;
      }

      if (kind === "reopen") {
        const result = await reopenOrder({ orderId: id });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        showToast(t.tReopen);
        router.refresh();
        return;
      }

      if (kind === "correct") {
        const result = await correctOrderStatus({
          orderId: id,
          status: payload.newStatus ?? "requested",
          memo: payload.memo ?? "",
        });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        showToast(t.tCorrect);
        router.refresh();
        return;
      }

      if (kind === "edit") {
        const result = await editOrder({
          orderId: id,
          title: payload.title ?? "",
          urgency: payload.urgency ?? "normal",
          reason: payload.reason ?? "",
          items: payload.items ?? [],
        });
        if (!result.ok) {
          showToast(t.errS);
          return;
        }
        setConfirm(null);
        showToast(t.tEdit);
        router.refresh();
        return;
      }

      // delete
      const result = await deleteOrderRequest(id);
      if (!result.ok) {
        showToast(t.errS);
        return;
      }
      setConfirm(null);
      setSelectedId(null);
      showToast(t.tDel);
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
            {t.kpiRequested}
          </div>
          <div className={`opscell__v${!loadError && kpi.requested > 0 ? " is-progress" : " is-muted"}`}>
            {V(kpi.requested)}
          </div>
          <div className="opscell__sub">
            {loadError ? (
              " "
            ) : kpi.requested ? (
              <span className="opscell__flag">
                <span className="ic">
                  <Inbox />
                </span>
                {t.kpiRequestedSub}
              </span>
            ) : (
              <span style={{ color: "var(--done)", fontWeight: 800 }}>{t.clear}</span>
            )}
          </div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <CircleCheck />
            </span>
            {t.kpiApproved}
          </div>
          <div className={`opscell__v${!loadError && kpi.approved > 0 ? "" : " is-muted"}`}>{V(kpi.approved)}</div>
          <div className="opscell__sub">{loadError ? " " : t.kpiApprovedSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Zap />
            </span>
            {t.kpiUrgent}
          </div>
          <div className={`opscell__v${!loadError && kpi.urgent > 0 ? " is-danger" : " is-muted"}`}>
            {V(kpi.urgent)}
          </div>
          <div className="opscell__sub">
            {loadError ? (
              " "
            ) : kpi.urgent ? (
              <span className="opscell__flag">
                <span className="ic">
                  <Zap />
                </span>
                {t.kpiUrgentSub}
              </span>
            ) : (
              <span style={{ color: "var(--done)", fontWeight: 800 }}>{t.none}</span>
            )}
          </div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Truck />
            </span>
            {t.kpiDelivWeek}
          </div>
          <div className={`opscell__v${!loadError && kpi.delivWeek > 0 ? " is-progress" : " is-muted"}`}>
            {V(kpi.delivWeek)}
          </div>
          <div className="opscell__sub">{loadError ? " " : t.kpiDelivWeekSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <ShoppingCart />
            </span>
            {t.kpiOrderedMo}
          </div>
          <div className={`opscell__v${loadError ? " is-muted" : " is-done"}`}>{V(kpi.orderedMo)}</div>
          <div className="opscell__sub">{loadError ? " " : t.kpiOrderedMoSub}</div>
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
          <button type="button" className={view === "cal" ? "on" : ""} onClick={() => handleViewChange("cal")}>
            <span className="ic">
              <CalendarDays />
            </span>
            {t.vCal}
          </button>
          <button type="button" className={view === "closed" ? "on" : ""} onClick={() => handleViewChange("closed")}>
            <span className="ic">
              <CircleCheck />
            </span>
            {t.vClosed}
          </button>
        </div>
        <span style={{ flex: 1 }} />
        {view === "board" ? (
          <>
            <span className="robadge">
              <span className="ic">
                <Smartphone />
              </span>
              {t.fieldReg}
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
            <ErrorState t={t} onRetry={handleSync} />
          ) : (
            <OrdersBoard
              orders={orders}
              filters={filters}
              t={t}
              locale={locale}
              todayKey={todayKey}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClearFilters={handleClearFilters}
            />
          )
        ) : view === "list" ? (
          <OrdersList
            orders={orders}
            allOrders={orders}
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
        ) : view === "cal" ? (
          <OrdersCalendar
            orders={orders}
            t={t}
            locale={locale}
            todayKey={todayKey}
            calProp={calProp}
            onCalPropChange={setCalProp}
            calMonth={calMonth}
            onCalMonthChange={setCalMonth}
            calSel={calSel}
            onCalSelChange={setCalSel}
            onSelectOrder={setSelectedId}
            loadError={loadError}
            onRetry={handleSync}
          />
        ) : (
          <OrdersClosed
            orders={orders}
            allOrders={orders}
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

      <OrdersDetailPanel
        order={selected}
        t={t}
        locale={locale}
        todayKey={todayKey}
        onClose={() => setSelectedId(null)}
        onAction={(kind, id) => setConfirm({ kind, id })}
        disabled={confirm !== null}
      />

      {confirm && confirmOrder ? (
        <OrdersActionModal
          kind={confirm.kind}
          order={confirmOrder}
          t={t}
          locale={locale}
          todayKey={todayKey}
          pending={isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={handleConfirmAction}
          onValidationError={(message) => showToast(message)}
        />
      ) : null}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </>
  );
}
