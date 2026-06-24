"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { BedDouble, Check, ChevronDown, Filter, Package, User } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { LinenReturnRecord } from "@/lib/linen-returns";
import { cn } from "@/lib/utils";

type LinenLedgerViewProps = {
  building: string;
  copy: Dictionary["linenReturn"];
  currentUserId: string;
  locale: Locale;
  records: LinenReturnRecord[];
};

type Mode = "records" | "aggregate";

function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

export function LinenLedgerView({
  building,
  copy,
  currentUserId,
  locale,
  records,
}: LinenLedgerViewProps) {
  const [mode, setMode] = useState<Mode>("records");
  const [mineOnly, setMineOnly] = useState(false);
  const [registrant, setRegistrant] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const [openFilter, setOpenFilter] = useState<"registrant" | "item" | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenFilter(null);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const registrants = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) map.set(r.registeredByUserId, r.registrantName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [records]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) for (const l of r.lines) map.set(l.itemId, l.name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [records]);

  const filtered = useMemo(
    () =>
      records.filter((r) => {
        if (mineOnly && r.registeredByUserId !== currentUserId) return false;
        if (registrant && r.registeredByUserId !== registrant) return false;
        if (itemId && !r.lines.some((l) => l.itemId === itemId)) return false;
        return true;
      }),
    [records, mineOnly, currentUserId, registrant, itemId],
  );

  const relevantQty = (record: LinenReturnRecord) =>
    itemId
      ? record.lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0)
      : record.totalQuantity;

  const totalRecords = filtered.length;
  const totalQty = filtered.reduce((sum, r) => sum + relevantQty(r), 0);

  const aggregate = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; count: number }>();
    for (const r of filtered) {
      for (const l of r.lines) {
        if (itemId && l.itemId !== itemId) continue;
        const entry = agg.get(l.itemId) ?? { name: l.name, qty: 0, count: 0 };
        entry.qty += l.quantity;
        entry.count += 1;
        agg.set(l.itemId, entry);
      }
    }
    return Array.from(agg.values()).sort((a, b) => b.qty - a.qty);
  }, [filtered, itemId]);
  const maxQty = aggregate.length ? aggregate[0].qty : 1;

  const registrantLabel = registrant
    ? registrants.find((r) => r.id === registrant)?.name ?? copy.filterRegistrant
    : copy.allRegistrants;
  const itemLabel = itemId
    ? itemOptions.find((i) => i.id === itemId)?.name ?? copy.filterItem
    : copy.filterItem;

  const buildingParam = encodeURIComponent(building);

  return (
    <div ref={wrapRef}>
      {/* Mode switch */}
      <div className="relative mb-3.5 flex rounded-[13px] bg-slate-50 p-1">
        <span
          className="absolute bottom-1 top-1 w-[calc(50%-6px)] rounded-[10px] bg-surface shadow-[0_2px_6px_rgba(20,32,43,0.12)] transition-[left] duration-300"
          style={{ left: mode === "records" ? "4px" : "calc(50% + 2px)" }}
        />
        {(["records", "aggregate"] as const).map((m) => (
          <button
            className={cn(
              "relative z-10 h-[38px] flex-1 text-[13.5px] transition-colors",
              mode === m ? "font-extrabold text-foreground" : "font-semibold text-muted-foreground",
            )}
            key={m}
            onClick={() => setMode(m)}
            type="button"
          >
            {m === "records" ? copy.modeRecords : copy.modeAggregate}
          </button>
        ))}
      </div>

      {/* Filter chips — centered; no overflow clip so dropdowns can render below */}
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        <button
          aria-checked={mineOnly}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors",
            mineOnly
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-slate-700",
          )}
          onClick={() => setMineOnly((v) => !v)}
          role="switch"
          type="button"
        >
          <span
            className={cn(
              "flex size-[15px] items-center justify-center rounded-full border",
              mineOnly ? "border-primary bg-primary text-primary-foreground" : "border-slate-300",
            )}
          >
            {mineOnly ? <Check className="size-2.5" strokeWidth={3} aria-hidden="true" /> : null}
          </span>
          {copy.filterMine}
        </button>
        <FilterChip
          icon={<User className="size-[15px]" aria-hidden="true" />}
          label={registrantLabel}
          onToggle={() => setOpenFilter(openFilter === "registrant" ? null : "registrant")}
          open={openFilter === "registrant"}
        >
          <FilterOption active={!registrant} label={copy.allRegistrants} onClick={() => { setRegistrant(""); setOpenFilter(null); }} />
          {registrants.map((r) => (
            <FilterOption
              active={registrant === r.id}
              key={r.id}
              label={r.name}
              onClick={() => { setRegistrant(r.id); setOpenFilter(null); }}
            />
          ))}
        </FilterChip>
        <FilterChip
          align="right"
          icon={<BedDouble className="size-[15px]" aria-hidden="true" />}
          label={itemLabel}
          onToggle={() => setOpenFilter(openFilter === "item" ? null : "item")}
          open={openFilter === "item"}
        >
          <FilterOption active={!itemId} label={copy.allItems} onClick={() => { setItemId(""); setOpenFilter(null); }} />
          {itemOptions.map((i) => (
            <FilterOption
              active={itemId === i.id}
              key={i.id}
              label={i.name}
              onClick={() => { setItemId(i.id); setOpenFilter(null); }}
            />
          ))}
        </FilterChip>
      </div>

      {/* Summary */}
      <div className="mb-[18px] flex items-center rounded-[18px] border border-primary/15 bg-[linear-gradient(150deg,color-mix(in_oklab,var(--primary)_11%,white),color-mix(in_oklab,var(--primary)_6%,white))] p-4">
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <span className="font-mono text-[26px] font-bold tracking-[-0.02em] text-primary">{totalRecords}</span>
          <span className="text-[11.5px] font-semibold text-muted-foreground">{copy.summaryRecords}</span>
        </div>
        <div className="h-[38px] w-px bg-primary/15" />
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <span className="font-mono text-[26px] font-bold tracking-[-0.02em] text-primary">{totalQty}</span>
          <span className="text-[11.5px] font-semibold text-muted-foreground">{copy.summaryQuantity}</span>
        </div>
      </div>

      {mode === "records" ? (
        filtered.length === 0 ? (
          <EmptyState
            icon={<Filter className="size-7" aria-hidden="true" />}
            sub={copy.noLedgerResultSub}
            title={copy.noLedgerResultTitle}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((r) => (
              <Link
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_14px_26px_-22px_rgba(15,23,42,0.4)]"
                href={`/mobile/linen-return/record/${r.id}?building=${buildingParam}`}
                key={r.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-extrabold text-foreground">
                    {formatDateTime(r.registeredAt, locale)}
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-600">
                    {r.lines.length === 0
                      ? "—"
                      : r.lines.length === 1
                        ? r.lines[0].name
                        : `${r.lines[0].name} ${copy.summaryMore} ${r.lines.length - 1}${copy.kindsUnit}`}
                  </div>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                    <span className="flex size-[18px] items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">
                      {r.registrantName.slice(0, 1)}
                    </span>
                    {r.registrantName}
                  </div>
                </div>
                <span className="inline-flex items-baseline gap-0.5 font-mono text-foreground">
                  <b className="text-[19px] font-bold tracking-[-0.02em]">{relevantQty(r)}</b>
                  <span className="font-sans text-[11px] font-semibold text-muted-foreground">
                    {copy.quantityUnit}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )
      ) : aggregate.length === 0 ? (
        <EmptyState
          icon={<Package className="size-7" aria-hidden="true" />}
          sub={copy.noLedgerResultSub}
          title={copy.noAggTitle}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-slate-50 px-[15px] py-[11px] text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
            <span>{copy.aggHeaderItem}</span>
            <span className="text-right">{copy.aggHeaderCount}</span>
            <span className="min-w-[54px] text-right">{copy.aggHeaderQty}</span>
          </div>
          {aggregate.map((row) => (
            <div
              className="grid grid-cols-[84px_1fr_auto_auto] items-center gap-[11px] border-t border-slate-100 px-[15px] py-[13px]"
              key={row.name}
            >
              <span className="text-sm font-bold text-foreground">{row.name}</span>
              <span className="h-[7px] overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_60%,white),var(--primary))]"
                  style={{ width: `${Math.max(8, Math.round((row.qty / maxQty) * 100))}%` }}
                />
              </span>
              <span className="min-w-[30px] text-right text-[11.5px] font-semibold text-muted-foreground">
                {row.count}
                {copy.aggCountUnit}
              </span>
              <span className="min-w-[44px] text-right font-mono text-base font-bold text-foreground">
                {row.qty}
                <i className="ml-0.5 font-sans text-[10px] not-italic text-muted-foreground">
                  {copy.quantityUnit}
                </i>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  align = "center",
  children,
  icon,
  label,
  onToggle,
  open,
}: {
  align?: "center" | "right";
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <div className="relative">
      <button
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-full border bg-surface px-3 text-[12.5px] font-bold transition-colors",
          open ? "border-primary text-primary" : "border-border text-slate-700",
        )}
        onClick={onToggle}
        type="button"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="max-w-[110px] truncate">{label}</span>
        <ChevronDown
          className="size-[15px] text-slate-400 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul
          className={cn(
            "absolute z-50 mt-1.5 max-h-60 w-48 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-border bg-surface p-1 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)]",
            align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
          )}
        >
          {children}
        </ul>
      ) : null}
    </div>
  );
}

function FilterOption({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <li
      className={cn(
        "flex h-10 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold transition-colors",
        active ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-50",
      )}
      onClick={onClick}
    >
      {label}
    </li>
  );
}

function EmptyState({
  icon,
  sub,
  title,
}: {
  icon: React.ReactNode;
  sub?: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex size-[60px] items-center justify-center rounded-[18px] bg-slate-50 text-slate-400">
        {icon}
      </span>
      <p className="text-[15px] font-extrabold text-foreground">{title}</p>
      {sub ? <p className="mt-1.5 text-[13px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
