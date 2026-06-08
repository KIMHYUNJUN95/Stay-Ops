"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  X,
  XCircle,
} from "lucide-react";
import { updateOrderRequestStatus } from "@/app/mobile/requests/orders/actions";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import type { Locale } from "@/lib/i18n";

type OrderAction = "approve" | "ordered" | "reject";
type OrderStatus = Database["public"]["Enums"]["order_request_status"];

type OrderActionBarLabels = {
  actionApprove: string;
  actionMarkOrdered: string;
  actionReject: string;
  successApprove: string;
  successOrdered: string;
  successReject: string;
  successBody: string;
  done: string;
  errorInvalidTransition: string;
  errorSaveFailed: string;
  deliveryDateLabel: string;
  deliveryDatePlaceholder: string;
  deliveryDateRequired: string;
  deliveryDateInvalid: string;
  deliveryRangeRequired: string;
  deliveryRangeInvalid: string;
  deliveryModeExact: string;
  deliveryModeRange: string;
  deliveryStartDateLabel: string;
  deliveryEndDateLabel: string;
  actionProcessOrderWithDateTitle: string;
  actionProcessOrderWithDateBody: string;
  hintStatusRequested: string;
  hintStatusApproved: string;
  hintStatusOrdered: string;
  hintStatusClosed: string;
};

type OrderActionBarProps = {
  labels: OrderActionBarLabels;
  locale: Locale;
  orderId: string;
  status: OrderStatus;
};

const ACTION_ICON = {
  approve: CheckCircle2,
  ordered: PackageCheck,
  reject: XCircle,
} as const;

// ─── Calendar utilities ───────────────────────────────────────────────────────

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addMonthsTo(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + n, 1);
}

function buildCalendarCells(month: Date): (string | null)[] {
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toIsoDate(new Date(month.getFullYear(), month.getMonth(), d)));
  }
  return cells;
}

function getShortWeekdays(locale: Locale): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2021, 7, 1 + i))),
  );
}

function formatDeliveryPreview(
  startIso: string,
  endIso: string,
  locale: Locale,
): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
  const toDisplay = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return fmt.format(new Date(Date.UTC(y, m - 1, d, 3, 0, 0)));
  };
  if (!endIso || startIso === endIso) return toDisplay(startIso);
  return `${toDisplay(startIso)} - ${toDisplay(endIso)}`;
}

// ─── Inline Delivery Calendar ─────────────────────────────────────────────────

type DeliveryCalendarProps = {
  endDate: string;
  locale: Locale;
  mode: "exact" | "range";
  onDayClick: (iso: string) => void;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  selectedDate: string;
  startDate: string;
  viewMonth: Date;
};

function DeliveryCalendar({
  endDate,
  locale,
  mode,
  onDayClick,
  onNextMonth,
  onPrevMonth,
  selectedDate,
  startDate,
  viewMonth,
}: DeliveryCalendarProps) {
  const weekdays = useMemo(() => getShortWeekdays(locale), [locale]);
  const cells = useMemo(() => buildCalendarCells(viewMonth), [viewMonth]);
  const todayIso = toIsoDate(new Date());

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(viewMonth),
    [locale, viewMonth],
  );

  const rangeStart = mode === "exact" ? selectedDate : startDate;
  const rangeEnd   = mode === "exact" ? selectedDate : (endDate || startDate);
  const isSinglePoint = rangeStart === rangeEnd;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/35 backdrop-blur-sm">
      {/* Month header */}
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <button
          aria-label="prev month"
          className="flex size-8 items-center justify-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground transition-all active:scale-90 hover:border-border hover:text-foreground"
          onClick={onPrevMonth}
          type="button"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="text-[13px] font-black tracking-tight text-foreground">
          {monthLabel}
        </span>
        <button
          aria-label="next month"
          className="flex size-8 items-center justify-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground transition-all active:scale-90 hover:border-border hover:text-foreground"
          onClick={onNextMonth}
          type="button"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 px-2">
        {weekdays.map((wd, i) => (
          <div
            className={cn(
              "py-1 text-center text-[9px] font-black uppercase tracking-widest",
              i === 0 ? "text-rose-500/70" : i === 6 ? "text-[#315F91]/70" : "text-muted-foreground/50",
            )}
            key={wd}
          >
            {wd.replace(/[.\s]/g, "").slice(0, 2)}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5 px-2 pb-3">
        {cells.map((iso, idx) => {
          if (!iso) return <div key={`g${idx}`} />;

          const isStart  = iso === rangeStart;
          const isEnd    = iso === rangeEnd;
          const inRange  = Boolean(rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd);
          const isEdge   = isStart || isEnd;
          const isToday  = iso === todayIso;
          const dayNum   = Number(iso.slice(8, 10));

          return (
            <div
              className="relative flex items-center justify-center"
              key={iso}
            >
              {/* Range fill strip */}
              {inRange && (
                <span
                  aria-hidden
                  className="absolute inset-y-[3px] inset-x-0 bg-[#EAF1F8]"
                />
              )}
              {/* Edge half-caps */}
              {isEdge && !isSinglePoint && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-[3px] w-[52%] bg-[#EAF1F8]",
                    isStart ? "right-0" : "left-0",
                  )}
                />
              )}

              <button
                aria-pressed={isEdge}
                className={cn(
                  "relative z-10 flex size-[38px] items-center justify-center rounded-full text-[13px] font-semibold transition-all active:scale-90",
                  isEdge
                    ? "bg-[#315F91] font-black text-white shadow-[0_4px_12px_-3px_rgba(49,95,145,0.55)]"
                    : inRange
                      ? "font-semibold text-[#1F3A5F]"
                      : "text-foreground hover:bg-muted/60",
                  isToday && !isEdge
                    ? "ring-[1.5px] ring-[#315F91]/35 ring-offset-1 ring-offset-transparent"
                    : "",
                )}
                onClick={() => onDayClick(iso)}
                type="button"
              >
                {dayNum}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrderActionBar({ labels, locale, orderId, status }: OrderActionBarProps) {
  const router = useRouter();
  const [activeAction, setActiveAction]         = useState<OrderAction | null>(null);
  const [isPending, setIsPending]               = useState(false);
  const [errorMessage, setErrorMessage]         = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode]         = useState<"exact" | "range">("exact");
  const [deliveryDate, setDeliveryDate]         = useState("");
  const [deliveryStartDate, setDeliveryStartDate] = useState("");
  const [deliveryEndDate, setDeliveryEndDate]   = useState("");
  const [calViewMonth, setCalViewMonth]         = useState<Date>(() => new Date());

  const close = useCallback(() => {
    setActiveAction(null);
    setDeliveryMode("exact");
    setDeliveryDate("");
    setDeliveryStartDate("");
    setDeliveryEndDate("");
    setErrorMessage(null);
    setCalViewMonth(new Date());
  }, []);

  useEffect(() => {
    if (!activeAction) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [activeAction, close]);

  const isOrdered = activeAction === "ordered";
  const isReject  = activeAction === "reject";
  const Icon      = activeAction ? ACTION_ICON[activeAction] : Check;

  const modalTitle = isOrdered
    ? labels.actionProcessOrderWithDateTitle
    : activeAction === "approve"
      ? labels.successApprove
      : labels.successReject;

  const modalBody = isOrdered ? labels.actionProcessOrderWithDateBody : labels.successBody;

  const hasValidDelivery =
    deliveryMode === "exact"
      ? Boolean(deliveryDate)
      : Boolean(deliveryStartDate && deliveryEndDate);

  const isConfirmDisabled = isPending || (isOrdered && !hasValidDelivery);

  function handleCalendarDayClick(iso: string) {
    if (deliveryMode === "exact") {
      setDeliveryDate(iso);
      setErrorMessage(null);
      return;
    }
    // Range: first click sets start, second sets end (auto-swap)
    if (!deliveryStartDate || (deliveryStartDate && deliveryEndDate)) {
      setDeliveryStartDate(iso);
      setDeliveryEndDate("");
      setErrorMessage(null);
      return;
    }
    if (iso < deliveryStartDate) {
      setDeliveryEndDate(deliveryStartDate);
      setDeliveryStartDate(iso);
    } else {
      setDeliveryEndDate(iso);
    }
    setErrorMessage(null);
  }

  const deliveryPreview = useMemo(() => {
    if (deliveryMode === "exact" && deliveryDate)
      return formatDeliveryPreview(deliveryDate, deliveryDate, locale);
    if (deliveryMode === "range" && deliveryStartDate)
      return formatDeliveryPreview(deliveryStartDate, deliveryEndDate, locale);
    return null;
  }, [deliveryMode, deliveryDate, deliveryStartDate, deliveryEndDate, locale]);

  async function handleConfirmAction() {
    if (!activeAction || isPending) return;
    setIsPending(true);
    setErrorMessage(null);

    const targetStatus: OrderStatus =
      activeAction === "approve" ? "approved" :
      activeAction === "ordered" ? "ordered"  : "closed";

    const result = await updateOrderRequestStatus({
      orderId,
      targetStatus,
      ...(activeAction === "ordered"
        ? deliveryMode === "exact"
          ? { deliveryMode, deliveryDate }
          : { deliveryMode, deliveryStartDate, deliveryEndDate }
        : {}),
    });
    setIsPending(false);

    if (!result.ok) {
      setErrorMessage(
        result.error === "invalid_transition"      ? labels.errorInvalidTransition :
        result.error === "missing_delivery_date"   ? labels.deliveryDateRequired :
        result.error === "invalid_delivery_date"   ? labels.deliveryDateInvalid :
        result.error === "missing_delivery_range"  ? labels.deliveryRangeRequired :
        result.error === "invalid_delivery_range"  ? labels.deliveryRangeInvalid :
        labels.errorSaveFailed,
      );
      return;
    }

    setActiveAction(null);
    router.refresh();
  }

  const canApprove = status === "requested";
  const canOrdered = status === "approved";
  const canReject  = status !== "closed";

  const statusHint =
    status === "closed"    ? labels.hintStatusClosed :
    status === "ordered"   ? labels.hintStatusOrdered :
    status === "approved"  ? labels.hintStatusApproved :
    status === "requested" ? labels.hintStatusRequested :
    null;

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface/85 p-2.5 shadow-glass backdrop-blur-xl">
          <button
            className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 text-sm font-bold text-red-600 transition-colors hover:bg-red-100/80 active:scale-[0.98]"
            disabled={!canReject || isPending}
            onClick={() => { setErrorMessage(null); setActiveAction("reject"); }}
            type="button"
          >
            <X className="size-4" aria-hidden="true" />
            {labels.actionReject}
          </button>
          <button
            className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#C9D8E8] bg-[#EAF1F8] text-sm font-bold text-[#1F3A5F] transition-colors hover:bg-[#DCE8F4] active:scale-[0.98]"
            disabled={!canOrdered || isPending}
            onClick={() => {
              setDeliveryMode("exact");
              setDeliveryDate("");
              setDeliveryStartDate("");
              setDeliveryEndDate("");
              setCalViewMonth(new Date());
              setErrorMessage(null);
              setActiveAction("ordered");
            }}
            type="button"
          >
            <PackageCheck className="size-4" aria-hidden="true" />
            {labels.actionMarkOrdered}
          </button>
          <button
            className="inline-flex h-12 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-[#315F91] text-sm font-black text-white shadow-sm transition-colors hover:bg-[#274D76] active:scale-[0.98]"
            disabled={!canApprove || isPending}
            onClick={() => { setErrorMessage(null); setActiveAction("approve"); }}
            type="button"
          >
            <Check className="size-4" aria-hidden="true" />
            {labels.actionApprove}
          </button>
        </div>
        {statusHint ? (
          <p className="px-1 text-center text-[11px] font-medium text-muted-foreground/70">
            {statusHint}
          </p>
        ) : null}
      </div>

      {activeAction && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-labelledby="order-action-modal-title"
              aria-modal="true"
              className={cn(
                "fixed inset-0 z-[100] flex min-h-dvh justify-center px-6 py-8",
                isOrdered ? "items-end sm:items-center" : "items-center",
              )}
              role="dialog"
            >
              <button
                aria-hidden="true"
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl"
                onClick={close}
                tabIndex={-1}
                type="button"
              />

              <div
                className={cn(
                  "relative flex w-full flex-col overflow-hidden border border-white/55 bg-surface shadow-[0_28px_90px_-34px_rgba(15,23,42,0.7)]",
                  isOrdered
                    ? "max-h-[92dvh] rounded-t-[28px] sm:max-h-none sm:max-w-[400px] sm:rounded-[28px]"
                    : "max-w-[360px] rounded-[28px] sm:mx-auto",
                )}
                style={{ animation: "modal-card-in 280ms cubic-bezier(0.34,1.26,0.64,1) both" }}
              >
                {/* Drag handle (mobile) */}
                {isOrdered ? (
                  <div className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden">
                    <div className="h-1 w-10 rounded-full bg-border/60" />
                  </div>
                ) : null}

                {/* ── Scrollable body ── */}
                <div
                  className={cn(
                    "flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-3 text-center",
                    isOrdered ? "pt-4" : "pt-8",
                  )}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "relative mb-4 flex size-16 items-center justify-center overflow-hidden rounded-full ring-1",
                      isOrdered
                        ? "bg-[#EAF1F8] text-[#315F91] ring-[#C9D8E8]"
                        : isReject
                          ? "bg-red-50 text-red-500 ring-red-200/70"
                          : "bg-[#EAF1F8] text-[#315F91] ring-[#C9D8E8]",
                    )}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/55 to-transparent"
                    />
                    <Icon className="relative size-8" aria-hidden="true" />
                  </div>

                  <h3
                    className="text-xl font-black tracking-tight text-foreground"
                    id="order-action-modal-title"
                  >
                    {modalTitle}
                  </h3>
                  <p className="mt-1.5 text-sm font-medium leading-6 text-muted-foreground">
                    {modalBody}
                  </p>

                  {/* ── Delivery date picker ── */}
                  {isOrdered ? (
                    <div className="mt-5 w-full text-left">
                      {/* Mode toggle */}
                      <div className="mb-3 inline-flex w-full items-center gap-1 rounded-xl border border-border/60 bg-background/55 p-1">
                        <button
                          className={cn(
                            "inline-flex h-9 flex-1 items-center justify-center rounded-lg text-xs font-black transition-all",
                            deliveryMode === "exact"
                              ? "bg-[#315F91] text-white shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => {
                            setDeliveryMode("exact");
                            setErrorMessage(null);
                          }}
                          type="button"
                        >
                          {labels.deliveryModeExact}
                        </button>
                        <button
                          className={cn(
                            "inline-flex h-9 flex-1 items-center justify-center rounded-lg text-xs font-black transition-all",
                            deliveryMode === "range"
                              ? "bg-[#315F91] text-white shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => {
                            setDeliveryMode("range");
                            setErrorMessage(null);
                          }}
                          type="button"
                        >
                          {labels.deliveryModeRange}
                        </button>
                      </div>

                      {/* Range mode hint */}
                      {deliveryMode === "range" && (
                        <p className="mb-2 text-[11px] font-medium text-muted-foreground/80">
                          {!deliveryStartDate || (deliveryStartDate && deliveryEndDate)
                            ? labels.deliveryStartDateLabel
                            : labels.deliveryEndDateLabel}
                        </p>
                      )}

                      {/* Inline calendar */}
                      <DeliveryCalendar
                        endDate={deliveryEndDate}
                        locale={locale}
                        mode={deliveryMode}
                        onDayClick={handleCalendarDayClick}
                        onNextMonth={() => setCalViewMonth((m) => addMonthsTo(m, 1))}
                        onPrevMonth={() => setCalViewMonth((m) => addMonthsTo(m, -1))}
                        selectedDate={deliveryDate}
                        startDate={deliveryStartDate}
                        viewMonth={calViewMonth}
                      />

                      {/* Selected date preview */}
                      {deliveryPreview ? (
                        <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-[#C9D8E8]/60 bg-[#EAF1F8] px-3 py-2.5">
                          <PackageCheck className="size-3.5 shrink-0 text-[#315F91]" aria-hidden="true" />
                          <p className="text-[13px] font-black text-[#315F91]">
                            {deliveryPreview}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2.5 h-10 rounded-xl border border-dashed border-border/50" />
                      )}
                    </div>
                  ) : null}

                  {errorMessage ? (
                    <p className="mt-3 text-xs font-semibold text-destructive">{errorMessage}</p>
                  ) : null}
                </div>

                {/* ── Fixed footer (항상 화면에 노출) ── */}
                <div
                  className={cn(
                    "shrink-0 px-6 pb-6 pt-3",
                    isOrdered && "border-t border-border/20",
                  )}
                >
                  <button
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#315F91] text-sm font-black text-white shadow-sm transition-colors hover:bg-[#274D76] disabled:opacity-40"
                    disabled={isConfirmDisabled}
                    onClick={handleConfirmAction}
                    type="button"
                  >
                    {isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        {labels.done}
                      </span>
                    ) : (
                      labels.done
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
