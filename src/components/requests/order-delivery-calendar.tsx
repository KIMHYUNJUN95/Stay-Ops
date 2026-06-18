"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronRight as RowChevron } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { OrderRequestStatus as OrderStatus } from "@/lib/order-requests";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/shell/bottom-sheet";

/**
 * Order delivery calendar — a bottom sheet with a large month grid of supply-order deliveries.
 *
 * Opened from the calendar icon on the Requests "비품주문 (order)" tab. Entries are derived directly
 * from each order's `delivery_date` (point) or `delivery_start_date`..`delivery_end_date` (range), so
 * an admin saving / editing a delivery date is reflected automatically — there is no separate store.
 * Uses the shared canonical BottomSheet, so it slides up from the bottom with drag-to-dismiss, scrim
 * fade, body-lock and Esc — no close button.
 */

export type DeliveryCalendarOrder = {
  id: string;
  buildingName: string;
  roomLabel: string;
  title: string;
  reporterName: string;
  status: OrderStatus;
  deliveryDate: string | null;
  deliveryStartDate: string | null;
  deliveryEndDate: string | null;
};

type Copy = {
  title: string;
  empty: string;
  dayEmpty: string;
  today: string;
  close: string;
  countTemplate: string;
  rangeLabel: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

// Tokyo "today" as YYYY-MM-DD (client-only popup, so a live Date is fine).
function tokyoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date());
}

// A day belongs to an order's delivery window. Range takes priority (delivery_date mirrors the start).
function dayMatches(order: DeliveryCalendarOrder, iso: string): boolean {
  if (order.deliveryStartDate && order.deliveryEndDate) {
    return iso >= order.deliveryStartDate && iso <= order.deliveryEndDate;
  }
  return order.deliveryDate === iso;
}

function formatDeliveryDate(value: string, locale: Locale) {
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(Date.UTC(y, m - 1, d, 3, 0, 0)));
}

export function OrderDeliveryCalendar({
  orders,
  locale,
  buildingLabels,
  statusLabels,
  copy,
  onClose,
  onOpenOrder,
}: {
  orders: DeliveryCalendarOrder[];
  locale: Locale;
  buildingLabels: Record<string, string>;
  statusLabels: Record<OrderStatus, string>;
  copy: Copy;
  onClose: () => void;
  onOpenOrder: (id: string) => void;
}) {
  const today = useMemo(() => tokyoToday(), []);
  const [month, setMonth] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m };
  });
  const [selected, setSelected] = useState<string | null>(today);

  // Only orders that actually carry a delivery date/window can appear.
  const deliverable = useMemo(
    () => orders.filter((o) => o.deliveryDate || (o.deliveryStartDate && o.deliveryEndDate)),
    [orders],
  );

  const monthPrefix = `${month.y}-${pad(month.m)}`;
  const isCurrentMonth = monthPrefix === today.slice(0, 7);
  const first = new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();

  const monthLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date(Date.UTC(month.y, month.m - 1, 15)));

  const ordersOnDay = (iso: string) => deliverable.filter((o) => dayMatches(o, iso));

  const shiftMonth = (delta: number) => {
    setMonth((cur) => {
      const idx = (cur.m - 1) + delta;
      return { y: cur.y + Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 + 1 };
    });
    setSelected(null);
  };
  const goToday = () => {
    const [y, m] = today.split("-").map(Number);
    setMonth({ y, m });
    setSelected(today);
  };

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2025, 0, 5 + i)),
    ),
  );

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < first; i++) cells.push(<span key={`pad-${i}`} />);
  for (let d = 1; d <= daysIn; d++) {
    const iso = `${monthPrefix}-${pad(d)}`;
    const list = ordersOnDay(iso);
    const isT = iso === today;
    const isSel = iso === selected;
    const w = (first + d - 1) % 7;
    cells.push(
      <button
        className={cn(
          "flex aspect-square flex-col items-center justify-start gap-1 rounded-xl pt-2 text-[14px] font-bold transition-colors",
          isSel
            ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_hsl(var(--primary-hsl)/0.7)]"
            : isT
              ? "bg-primary/[0.07] text-primary ring-1 ring-inset ring-primary/25"
              : "text-foreground hover:bg-slate-50",
        )}
        key={iso}
        onClick={() => setSelected(iso)}
        type="button"
      >
        <span
          className={cn(
            !isSel && !isT && w === 0 && "text-rose-500",
            !isSel && !isT && w === 6 && "text-blue-600",
          )}
        >
          {d}
        </span>
        <span className="flex h-1.5 items-center gap-0.5">
          {list.slice(0, 3).map((_, i) => (
            <span
              className={cn("size-1 rounded-full", isSel ? "bg-primary-foreground/80" : "bg-primary")}
              key={i}
            />
          ))}
        </span>
      </button>,
    );
  }

  const selectedList = selected ? ordersOnDay(selected) : [];
  const selectedLabel = selected
    ? new Intl.DateTimeFormat(locale, {
        month: "long",
        day: "numeric",
        weekday: "short",
        timeZone: "Asia/Tokyo",
      }).format(new Date(`${selected}T00:00:00+09:00`))
    : null;

  const monthCount = useMemo(() => {
    let n = 0;
    for (let d = 1; d <= daysIn; d++) {
      if (ordersOnDay(`${monthPrefix}-${pad(d)}`).length > 0) n++;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthPrefix, daysIn, deliverable]);

  return (
    <BottomSheet
      ariaLabel={copy.title}
      className="max-h-[88dvh] flex flex-col"
      header={
        <div className="flex items-center gap-2 pb-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/[0.09] text-primary">
            <CalendarDays className="size-[17px]" aria-hidden="true" />
          </span>
          <p className="text-[16px] font-black tracking-[-0.01em] text-foreground">{copy.title}</p>
        </div>
      }
      onClose={onClose}
      zIndexClassName="z-[120]"
    >
      {() => (
        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5">
          {/* Month nav */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                aria-label="prev"
                className="flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-foreground"
                onClick={() => shiftMonth(-1)}
                type="button"
              >
                <ChevronLeft className="size-[18px]" aria-hidden="true" />
              </button>
              <span className="min-w-[124px] text-center text-[15px] font-black tracking-[-0.01em] text-foreground">
                {monthLabel}
              </span>
              <button
                aria-label="next"
                className="flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-foreground"
                onClick={() => shiftMonth(1)}
                type="button"
              >
                <ChevronRight className="size-[18px]" aria-hidden="true" />
              </button>
            </div>
            {!isCurrentMonth ? (
              <button
                className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] px-3 py-1.5 text-[12px] font-bold text-primary transition-colors hover:bg-primary/10"
                onClick={goToday}
                type="button"
              >
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {copy.today}
              </button>
            ) : null}
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
            {weekdays.map((label, i) => (
              <span className={cn(i === 0 && "text-rose-500", i === 6 && "text-blue-600")} key={i}>
                {label}
              </span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1">{cells}</div>

          {/* Month summary / empty */}
          {monthCount === 0 ? (
            <div className="mt-4 flex flex-col items-center rounded-[18px] border border-dashed border-border bg-surface/60 px-6 py-8 text-center">
              <span className="mb-2.5 flex size-10 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                <CalendarDays className="size-5" aria-hidden="true" />
              </span>
              <p className="text-[12.5px] font-semibold text-muted-foreground">{copy.empty}</p>
            </div>
          ) : null}

          {/* Selected day detail */}
          {selected ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <span
                  className={cn(
                    "text-[13px] font-black tracking-[-0.01em]",
                    selected === today ? "text-primary" : "text-foreground",
                  )}
                >
                  {selectedLabel}
                </span>
                {selected === today ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">
                    {copy.today}
                  </span>
                ) : null}
                {selectedList.length > 0 ? (
                  <span className="rounded-full bg-slate-100 px-[7px] py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
                    {copy.countTemplate.replace("{n}", String(selectedList.length))}
                  </span>
                ) : null}
              </div>

              {selectedList.length === 0 ? (
                <p className="px-0.5 py-3 text-[12.5px] text-muted-foreground">{copy.dayEmpty}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedList.map((o) => {
                    const building = buildingLabels[o.buildingName] ?? o.buildingName;
                    const place = o.roomLabel && o.roomLabel !== "-" ? `${building} · ${o.roomLabel}` : building;
                    const isRange = Boolean(o.deliveryStartDate && o.deliveryEndDate);
                    return (
                      <button
                        className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left transition-colors active:bg-slate-50"
                        key={o.id}
                        onClick={() => onOpenOrder(o.id)}
                        type="button"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[14px] font-bold tracking-[-0.01em] text-foreground">
                              {o.title}
                            </span>
                            <span className="shrink-0 rounded-full bg-primary/[0.08] px-1.5 py-px text-[10px] font-bold text-primary">
                              {statusLabels[o.status] ?? o.status}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-[12px] text-muted-foreground">{place}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                            <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-slate-100 text-[9.5px] font-extrabold text-slate-600">
                              {o.reporterName.slice(0, 1)}
                            </span>
                            <span className="truncate">{o.reporterName}</span>
                            {isRange ? (
                              <span className="ml-1 shrink-0 text-muted-foreground/80">
                                · {copy.rangeLabel}: {formatDeliveryDate(o.deliveryStartDate!, locale)} ~{" "}
                                {formatDeliveryDate(o.deliveryEndDate!, locale)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <RowChevron className="mt-1 size-4 shrink-0 text-slate-300" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}
