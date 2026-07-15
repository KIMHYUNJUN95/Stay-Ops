"use client";

// 반환완료 분실물 전용 목록 (모바일). 요청 → 분실물 탭의 "반환완료" 진입 pill에서 들어온다.
// 반환완료(returned) 항목만 모아 상단 통계 + 검색 + 기간/건물 필터(바텀시트) + 월별 그룹 카드로 보여준다.
// 2026-07-15 신설 — Claude Design 핸드오프(반환완료 분실물 목록) 이식.
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  FileText,
  MapPin,
  Package,
  Search,
  Undo2,
  User,
} from "lucide-react";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ReturnedItemVM = {
  id: string;
  itemName: string;
  buildingLabel: string;
  roomLabel: string;
  thumbnailUrl: string | null;
  handledAtIso: string | null;
  handledDateKey: string | null; // Tokyo YYYY-MM-DD
  handledByName: string | null;
  reporterName: string;
  handlingMemo: string | null;
  monthKey: string; // Tokyo YYYY-MM
  relativeGroup: "thisMonth" | "lastMonth" | null;
};

type ReturnedStats = { total: number; month: number; week: number };
type Period = "all" | "today" | "7d" | "30d";

type ReturnedLostFoundListProps = {
  locale: Locale;
  items: ReturnedItemVM[];
  stats: ReturnedStats;
  todayKey: string;
  buildingOptions: string[];
  copy: Dictionary["lostFound"]["returned"];
};

const CARD =
  "relative overflow-hidden rounded-[20px] border border-slate-200/80 bg-surface p-3.5 shadow-[0_16px_34px_-30px_rgba(31,58,95,0.48)]";

function dayDiff(todayKey: string, key: string): number {
  const [ay, am, ad] = todayKey.split("-").map(Number);
  const [by, bm, bd] = key.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

export function ReturnedLostFoundList({
  locale,
  items,
  stats,
  todayKey,
  buildingOptions,
  copy,
}: ReturnedLostFoundListProps) {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [building, setBuilding] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  // 날짜와 시각을 분리 포맷 후 합친다. ko "7월 14일 14:31" · ja "7月14日 14:31" · en "Jul 14, 14:31".
  // (ko의 숫자 날짜 기본값 "07. 14."이 어색해서 month:"short"로 "7월 14일" 형태를 쓴다.)
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );
  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    [locale],
  );
  function formatReturnedAt(iso: string): string {
    const d = new Date(iso);
    return `${dateFmt.format(d)}${locale === "en" ? "," : ""} ${timeFmt.format(d)}`;
  }

  function monthLabel(monthKey: string, relative: ReturnedItemVM["relativeGroup"]): string {
    if (relative === "thisMonth") return copy.groupThisMonth;
    if (relative === "lastMonth") return copy.groupLastMonth;
    const [y, m] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
      new Date(Date.UTC(y, m - 1, 1, 3)),
    );
  }

  const periodLabel: Record<Period, string> = {
    all: copy.periodAll,
    today: copy.periodToday,
    "7d": copy.period7d,
    "30d": copy.period30d,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (
        q &&
        !(
          it.itemName.toLowerCase().includes(q) ||
          it.reporterName.toLowerCase().includes(q) ||
          (it.handledByName ?? "").toLowerCase().includes(q) ||
          it.roomLabel.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      if (building !== "all" && it.buildingLabel !== building) return false;
      if (period !== "all") {
        if (!it.handledDateKey) return false;
        const diff = dayDiff(todayKey, it.handledDateKey);
        if (period === "today" && diff !== 0) return false;
        if (period === "7d" && (diff < 0 || diff > 6)) return false;
        if (period === "30d" && (diff < 0 || diff > 29)) return false;
      }
      return true;
    });
  }, [items, query, building, period, todayKey]);

  // 월별 그룹 (이미 handled_at 내림차순 정렬됨 → 그룹 순서 유지).
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ReturnedItemVM[] }[] = [];
    for (const it of filtered) {
      const last = out[out.length - 1];
      if (last && last.key === it.monthKey) {
        last.items.push(it);
      } else {
        out.push({ key: it.monthKey, label: monthLabel(it.monthKey, it.relativeGroup), items: [it] });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, locale, copy.groupThisMonth, copy.groupLastMonth]);

  const buildingActive = building !== "all";

  return (
    <div className="space-y-3">
      {/* 반환완료만 배지 */}
      <div className="flex items-center justify-end">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#c5cdf0] bg-[#eef1fb] px-2.5 py-1 text-[11px] font-black text-[#3949ab]">
          <CircleCheck className="size-3" aria-hidden="true" />
          {copy.badge}
        </span>
      </div>

      {/* 통계 strip */}
      <div className="flex overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-[0_14px_30px_-28px_rgba(31,58,95,0.45)]">
        <Stat value={stats.total} label={copy.statTotal} tone="ret" />
        <Stat value={stats.month} label={copy.statMonth} tone="ret" />
        <Stat value={stats.week} label={copy.statWeek} tone="mut" />
      </div>

      {/* 검색 */}
      <label className="flex h-11 items-center gap-2.5 rounded-2xl border-[1.5px] border-slate-200/80 bg-white px-3.5">
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.searchPlaceholder}
          value={query}
        />
      </label>

      {/* 필터 칩 */}
      <div className="flex flex-wrap gap-2">
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-bold transition-colors",
            period !== "all"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-slate-200/80 bg-white text-slate-700",
          )}
          onClick={() => setSheetOpen(true)}
          type="button"
        >
          <span className="text-muted-foreground">{copy.filterPeriod}:</span>
          <span className="font-black text-primary">{periodLabel[period]}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-bold transition-colors",
            buildingActive
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-slate-200/80 bg-white text-slate-700",
          )}
          onClick={() => setSheetOpen(true)}
          type="button"
        >
          <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">{copy.filterBuilding}:</span>
          <span className="font-black text-primary">{buildingActive ? building : copy.periodAll}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className={`${CARD} py-8`}>
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 ring-1 ring-slate-200/80">
            <Undo2 className="size-5" aria-hidden="true" />
          </div>
          <p className="text-center text-sm font-bold text-slate-500">{copy.empty}</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key}>
            <div className="mb-2.5 mt-[18px] flex items-center gap-2 first:mt-1">
              <span className="text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">
                {group.label}
              </span>
              <span className="rounded-full bg-slate-100 px-1.5 py-px font-mono text-[10.5px] font-black text-slate-500 ring-1 ring-slate-200">
                {group.items.length}
              </span>
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            </div>
            <div className="space-y-2.5">
              {group.items.map((it) => (
                <Link className="block" href={`/mobile/requests/lost-found/${it.id}`} key={it.id}>
                  <div className={cn(CARD, "transition-all hover:-translate-y-0.5 active:scale-[0.99]")}>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-3.5 left-0 w-1 rounded-r-full bg-[#3949ab]"
                    />
                    <div className="flex items-start gap-3">
                      {it.thumbnailUrl ? (
                        <div className="relative size-[46px] shrink-0 overflow-hidden rounded-[14px] border border-slate-200/80 bg-slate-50">
                          <Image alt={it.itemName} className="object-cover" fill sizes="46px" src={it.thumbnailUrl} />
                        </div>
                      ) : (
                        <div className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px] border border-slate-200/80 bg-slate-50 text-slate-400">
                          <Package className="size-5" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 text-[14.5px] font-black leading-tight tracking-[-0.02em] text-slate-950">
                            {it.itemName}
                          </p>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#c5cdf0] bg-[#eef1fb] px-2 py-0.5 text-[11px] font-black text-[#3949ab]">
                            <Undo2 className="size-3" aria-hidden="true" />
                            {copy.statusReturned}
                          </span>
                        </div>
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                          <MapPin className="size-3" aria-hidden="true" />
                          {it.buildingLabel} {"·"} {it.roomLabel}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-slate-200/70 pt-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-slate-500">
                        <Undo2 className="size-3 text-slate-400" aria-hidden="true" />
                        {copy.metaReturned}{" "}
                        <b className="font-black text-foreground/80">
                          {it.handledAtIso ? formatReturnedAt(it.handledAtIso) : "-"}
                        </b>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-slate-500">
                        <User className="size-3 text-slate-400" aria-hidden="true" />
                        {copy.metaHandler} <b className="font-black text-foreground/80">{it.handledByName ?? "-"}</b>
                      </span>
                    </div>

                    {it.handlingMemo ? (
                      <div className="mt-2 flex items-start gap-2 rounded-[10px] bg-slate-100/70 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                        <FileText className="mt-0.5 size-3 shrink-0 text-[#3949ab]" aria-hidden="true" />
                        <span className="line-clamp-2">{it.handlingMemo}</span>
                      </div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}

      {sheetOpen ? (
        <BottomSheet
          ariaLabel={copy.filterSheetTitle}
          className="flex max-h-[85dvh] flex-col"
          header={
            <p className="px-1 text-[15px] font-black tracking-[-0.03em] text-slate-950">
              {copy.filterSheetTitle}
            </p>
          }
          onClose={() => setSheetOpen(false)}
          zIndexClassName="z-[95]"
        >
          {({ close }) => (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                    {copy.filterPeriod}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["all", "today", "7d", "30d"] as Period[]).map((p) => (
                      <button
                        aria-pressed={period === p}
                        className={cn(
                          "rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors",
                          period === p ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
                        )}
                        key={p}
                        onClick={() => setPeriod(p)}
                        type="button"
                      >
                        {periodLabel[p]}
                      </button>
                    ))}
                  </div>
                </div>

                {buildingOptions.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                      {copy.filterBuilding}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        aria-pressed={building === "all"}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors",
                          building === "all" ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
                        )}
                        onClick={() => setBuilding("all")}
                        type="button"
                      >
                        {building === "all" ? <Check className="size-3.5" aria-hidden="true" /> : null}
                        {copy.periodAll}
                      </button>
                      {buildingOptions.map((b) => (
                        <button
                          aria-pressed={building === b}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors",
                            building === b ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
                          )}
                          key={b}
                          onClick={() => setBuilding(b)}
                          type="button"
                        >
                          {building === b ? <Check className="size-3.5" aria-hidden="true" /> : null}
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-1 pt-4">
                <button
                  className="h-11 flex-1 rounded-2xl border border-border bg-surface text-sm font-bold text-slate-700 transition-colors hover:bg-muted/60 disabled:opacity-40"
                  disabled={period === "all" && building === "all"}
                  onClick={() => {
                    setPeriod("all");
                    setBuilding("all");
                  }}
                  type="button"
                >
                  {copy.reset}
                </button>
                <button
                  className="h-11 flex-1 rounded-2xl bg-primary text-sm font-black text-white transition-colors hover:bg-primary/90"
                  onClick={close}
                  type="button"
                >
                  {copy.apply}
                </button>
              </div>
            </div>
          )}
        </BottomSheet>
      ) : null}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "ret" | "mut" }) {
  return (
    <div className="flex-1 border-l border-slate-100 py-3 text-center first:border-l-0">
      <div
        className={cn(
          "font-mono text-[21px] font-black tracking-[-0.02em] tabular-nums",
          tone === "ret" ? "text-[#3949ab]" : "text-slate-700",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}
