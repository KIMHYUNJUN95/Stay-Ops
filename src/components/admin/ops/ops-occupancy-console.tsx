"use client";

import { Fragment, useEffect, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { exportOpsOccupancyReport, exportOpsOccupancyWorkbook, type OpsOccupancyExportPayload } from "@/app/admin/ops/occupancy/actions";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { AdminExportButtons } from "@/components/admin/shared/admin-export-buttons";
import { AdminMonthPicker } from "@/components/admin/shared/admin-month-picker";
import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";
import type { Dictionary } from "@/lib/i18n";
import {
  OCCUPANCY_LINE,
  heatLevel,
  isMostlyVacant,
  mostVacantCells,
  occupancyGrade,
  roomsBelowUsual,
  seriesAverage,
  vacancyLevel,
  type RoomSeries,
} from "@/lib/ops-occupancy";
import {
  REVENUE_MODES,
  fiscalPeriodNumber,
  metricsOf,
  monthPhase,
  shiftRange,
  sumMetrics,
  type RevenueCell,
  type RevenueMetrics,
  type RevenueMode,
  type RevenueRange,
} from "@/lib/ops-revenue";
import type { OpsRevenueData } from "@/lib/ops-revenue-server";
import "./ops-revenue.css";
import "./ops-occupancy.css";

/**
 * 가동률 화면 — 시안 A(보고서형) · B(객실 × 월) · C(앞으로)를 탭 셋으로 (2026-10-07 사용자 「이대로 구현」).
 *
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「가동률 화면」
 *
 * 숫자는 매출 화면과 **같은 칸**(`getOpsRevenueData`)이다 — 판매 박 · 전체 박을 건물 × 달 조각으로 받아, 합계에 넣을
 * 건물을 골라 더하고 비율을 다시 나눈다. 식은 저쪽 가동률 화면과 같다(2026-10-07 대조 243칸 일치). 도구줄 · 칩 · 숫자
 * 카드 · 표는 매출 화면 부품(`orv__*`)을 그대로 쓰고, 막대 · 히트맵 · 앞으로 칸만 `occ__*`.
 */
type Copy = Dictionary["opsOccupancy"];
type RevenueCopy = Dictionary["opsRevenue"];
type SharedCopy = Dictionary["admin"]["shared"];
export type OccupancyTab = "report" | "rooms" | "forward";
type SortKey = "occupancy" | "nights" | "vacant" | "previous" | "change";
type RoomSort = "catalog" | "last" | "avg";

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

/** 히트맵 5단계 — 글자는 늘 검정(매출 「건물 × 월」과 같은 원칙), 60 아래만 붉게. */
const HEAT_BG = ["hsl(4 70% 90%)", "hsl(38 82% 90%)", "hsl(223 30% 93%)", "hsl(223 40% 85%)", "hsl(223 46% 77%)"];
/** 앞으로 칸 — 방 수 대비 빈 박. 0 = 거의 팔림 ~ 4 = 거의 빔. */
const VACANCY_BG = ["hsl(146 30% 93%)", "hsl(44 40% 94%)", "hsl(38 82% 92%)", "hsl(20 70% 91%)", "hsl(4 66% 88%)"];

export function occupancyHref(mode: RevenueMode, range: RevenueRange, tab: OccupancyTab): string {
  const query = new URLSearchParams({ mode });
  if (mode === "month") query.set("ym", range.from.slice(0, 7));
  else query.set("from", range.from);
  if (mode === "custom") query.set("to", range.to);
  if (tab !== "report") query.set("tab", tab);
  return `/admin/ops/occupancy?${query.toString()}`;
}

/** 판매 캘린더 그 건물 · 그 달(월간 보기). */
function calendarHref(property: string, month: string): string {
  const query = new URLSearchParams({ mode: "monthly", property, ym: month });
  return `/admin/ops/calendar?${query.toString()}`;
}

/** 다른 모드로 갈 때 — 지금 보던 기간의 끝(오늘보다 뒤면 오늘)이 든 그 모드의 기간으로. 모양은 서버가 바로잡는다. */
function shiftToMode(mode: RevenueMode, range: RevenueRange, today: string): RevenueRange {
  const base = range.to > today && range.from <= today ? today : range.to;
  return mode === "month" ? { from: `${base.slice(0, 7)}-01`, to: base } : { from: base, to: base };
}

export function OpsOccupancyConsole({
  data,
  copy,
  rcopy,
  shared,
  localeTag,
  initialTab,
}: {
  data: OpsRevenueData;
  copy: Copy;
  rcopy: RevenueCopy;
  shared: SharedCopy;
  localeTag: string;
  initialTab: OccupancyTab;
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [tab, setTab] = useState<OccupancyTab>(initialTab);
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(data.properties.filter((p) => !p.defaultExcluded).map((p) => p.name)),
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "report") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [tab]);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 2000);
  };
  const go = (href: string) => startNav(() => router.push(href));

  const n = (value: number) => value.toLocaleString(localeTag);
  const pct = (value: number) => `${value.toFixed(1)}%`;
  const pointText = (current: number, previous: number) => {
    const d = current - previous;
    return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}${rcopy.pointSuffix}`;
  };
  const pointTone = (d: number | null) => (d === null ? "z" : d >= 0.05 ? "up" : d <= -0.05 ? "dn" : "z");
  const monthShort = (month: string) =>
    new Intl.DateTimeFormat(localeTag, { month: "short", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  const monthLong = (month: string) =>
    new Intl.DateTimeFormat(localeTag, { month: "long", timeZone: "UTC", year: "numeric" }).format(new Date(`${month}-15T00:00:00Z`));
  const dayLabel = (date: string, withYear: boolean) =>
    new Intl.DateTimeFormat(localeTag, { day: "numeric", month: "short", timeZone: "UTC", ...(withYear ? { year: "numeric" } : {}) }).format(
      new Date(`${date}T00:00:00Z`),
    );
  const rangeLabel = (mode: RevenueMode, range: RevenueRange) => {
    if (mode === "month") return monthLong(range.from.slice(0, 7));
    if (mode === "fiscal") {
      return fill(rcopy.fiscalLabel, {
        from: range.from.slice(0, 7).replace("-", "."),
        n: fiscalPeriodNumber(Number(range.from.slice(0, 4))),
        to: range.to.slice(0, 7).replace("-", "."),
      });
    }
    if (mode === "year") return range.from.slice(0, 4);
    const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
    return `${dayLabel(range.from, true)} – ${dayLabel(range.to, !sameYear)}`;
  };
  const gradeLabel = (value: number) =>
    ({ excellent: copy.gradeExcellent, fair: copy.gradeFair, good: copy.gradeGood, poor: copy.gradePoor })[occupancyGrade(value)];

  const isIn = (name: string) => included.has(name);
  const inNames = data.properties.filter((p) => isIn(p.name)).map((p) => p.name);
  const totalOf = (cells: Record<string, RevenueCell> | undefined) => sumMetrics(inNames.map((name) => cells?.[name]));
  const current = totalOf(data.rangeCells);
  const previous = totalOf(data.previousRangeCells);
  const phase = data.range.to < data.today ? "past" : data.range.from > data.today ? "future" : "current";
  const months12 = data.months.slice(0, 12);
  const anchor = data.months[11];

  /** 객실 12달 — 문 열기 전(분모 0)은 `null`. 한 달도 안 열린 방(목록 밖)은 뺀다. */
  const roomSeries: RoomSeries[] = data.properties.flatMap((property) =>
    property.rooms
      .map((room) => ({
        key: room.key,
        label: room.label,
        property: property.name,
        values: months12.map((month) => {
          const cell = data.monthRoomCells[month]?.[room.key];
          return cell && cell.availableNights > 0 ? (cell.occupiedNights / cell.availableNights) * 100 : null;
        }),
      }))
      .filter((room) => room.values.some((value) => value !== null)),
  );

  const exportPayload = (): OpsOccupancyExportPayload => {
    const row = (name: string, cur: RevenueMetrics, prev: RevenueMetrics) => ({
      available: cur.availableNights,
      name,
      occupied: cur.occupiedNights,
      previousPct: prev.availableNights > 0 ? prev.occupancyPct : null,
    });
    const fwdCell = (cell: RevenueCell | undefined) => ({ available: cell?.availableNights ?? 0, occupied: cell?.occupiedNights ?? 0 });
    return {
      forward: data.properties.map((p) => ({ cells: data.forwardMonths.map((month) => fwdCell(data.forwardCells[month]?.[p.name])), name: p.name })),
      forwardLabel: fill(copy.forwardBadge, { today: data.today }),
      forwardMonthLabels: data.forwardMonths.map((month) => monthLong(month)),
      forwardTotal: data.forwardMonths.map((month) => fwdCell(totalOf(data.forwardCells[month]))),
      rangeLabel: rangeLabel(data.mode, data.range),
      roomMonthLabels: months12.map((month) => monthShort(month)),
      roomRangeLabel: fill(copy.roomsRange, { from: monthLong(months12[0]), to: monthLong(anchor) }),
      rooms: roomSeries.map((room) => ({ name: `${room.property} ${room.label}`, values: room.values })),
      rows: data.properties
        .filter((p) => (data.rangeCells[p.name]?.availableNights ?? 0) > 0)
        .map((p) => row(p.name, metricsOf(data.rangeCells[p.name] ?? sumMetrics([])), metricsOf(data.previousRangeCells[p.name] ?? sumMetrics([])))),
      total: row(fill(rcopy.totalRow, { n: inNames.length }), current, previous),
    };
  };

  if (data.properties.length === 0) {
    return (
      <div className="orv">
        <div className="orv__empty">{copy.empty}</div>
      </div>
    );
  }

  const rangePickerLabels = {
    apply: shared.dateApply,
    nextMonth: shared.dateNextMonth,
    pickMonth: shared.datePickMonth,
    pickYear: shared.datePickYear,
    prevMonth: shared.datePrevMonth,
    reset: shared.dateReset,
    thisMonth: shared.dateThisMonth,
    typeEnd: shared.dateTypeEnd,
    typeStart: shared.dateTypeStart,
  };
  const modeLabel: Record<RevenueMode, string> = {
    custom: rcopy.modeCustom,
    fiscal: rcopy.modeFiscal,
    month: rcopy.modeMonth,
    week: rcopy.modeWeek,
    year: rcopy.modeYear,
  };

  // ── 숫자 6개 ──
  const lowest = data.properties
    .filter((p) => isIn(p.name) && (data.rangeCells[p.name]?.availableNights ?? 0) > 0)
    .map((p) => ({ cur: metricsOf(data.rangeCells[p.name]!), name: p.name, prev: metricsOf(data.previousRangeCells[p.name] ?? sumMetrics([])) }))
    .sort((a, b) => a.cur.occupancyPct - b.cur.occupancyPct)[0];
  const underLine = data.properties
    .filter((p) => isIn(p.name))
    .flatMap((p) => p.rooms)
    .filter((room) => {
      const cell = data.rangeRoomCells[room.key];
      return !!cell && cell.availableNights > 0 && (cell.occupiedNights / cell.availableNights) * 100 < OCCUPANCY_LINE;
    }).length;
  const thisMonth = data.forwardMonths[0];
  const thisMonthTotal = thisMonth ? totalOf(data.forwardCells[thisMonth]) : null;
  const roomTotal = data.properties.filter((p) => isIn(p.name)).reduce((sum, p) => sum + p.roomCount, 0);
  const hasPrev = previous.availableNights > 0;
  const kpis = [
    {
      d: hasPrev ? pointText(current.occupancyPct, previous.occupancyPct) : rcopy.newLabel,
      hero: true,
      label: copy.kpiOccupancy,
      sub: hasPrev ? fill(rcopy.lastYearValue, { v: pct(previous.occupancyPct) }) : "",
      tone: hasPrev ? pointTone(current.occupancyPct - previous.occupancyPct) : "z",
      value: current.availableNights > 0 ? pct(current.occupancyPct) : "—",
    },
    {
      d: "",
      label: copy.kpiSold,
      sub: fill(copy.kpiSoldSub, { n: inNames.length, rooms: roomTotal }),
      tone: "z",
      value: `${n(current.occupiedNights)} / ${n(current.availableNights)}`,
    },
    { d: "", label: copy.kpiVacant, sub: copy.kpiVacantSub, tone: "z", value: n(Math.max(0, current.availableNights - current.occupiedNights)) },
    {
      d: lowest && lowest.prev.availableNights > 0 ? pointText(lowest.cur.occupancyPct, lowest.prev.occupancyPct) : "",
      label: copy.kpiLowest,
      sub: lowest?.name ?? "",
      tone: lowest && lowest.prev.availableNights > 0 ? pointTone(lowest.cur.occupancyPct - lowest.prev.occupancyPct) : "z",
      value: lowest ? pct(lowest.cur.occupancyPct) : "—",
    },
    { d: "", label: copy.kpiUnder, sub: copy.kpiUnderSub, tone: "z", value: fill(copy.roomsUnit, { n: underLine }) },
    {
      d: "",
      label: copy.kpiThisMonth,
      sub: thisMonth ? fill(copy.kpiThisMonthSub, { month: monthLong(thisMonth) }) : "",
      tone: "z",
      value: thisMonthTotal && thisMonthTotal.availableNights > 0 ? pct(thisMonthTotal.occupancyPct) : "—",
    },
  ];

  const prevRange = shiftRange(data.mode, data.range, -1);
  const nextRange = shiftRange(data.mode, data.range, 1);
  const tabs: Array<[OccupancyTab, string]> = [
    ["report", copy.tabReport],
    ["rooms", copy.tabRooms],
    ["forward", copy.tabForward],
  ];

  return (
    <div className={`orv occ${navPending ? " is-pending" : ""}`}>
      <div className="orv__top">
        <h1 className="orv__title">{copy.title}</h1>
        <div className="orv__export">
          <AdminExportButtons
            disabled={current.availableNights === 0}
            labels={shared}
            onExportPdf={() => exportOpsOccupancyReport(exportPayload())}
            onExportXls={() => exportOpsOccupancyWorkbook(exportPayload())}
            onToast={flash}
          />
        </div>
      </div>

      <div className="orv__bar">
        <div className="orv__seg" role="tablist">
          {REVENUE_MODES.map((mode) => (
            <Link
              aria-selected={mode === data.mode}
              className={mode === data.mode ? "on" : ""}
              href={occupancyHref(mode, mode === "custom" ? data.range : shiftToMode(mode, data.range, data.today), tab)}
              key={mode}
              role="tab"
            >
              {modeLabel[mode]}
            </Link>
          ))}
        </div>
        {data.mode === "month" ? (
          <AdminMonthPicker
            basePath="/admin/ops/occupancy"
            labels={{
              nextMonth: shared.dateNextMonth,
              nextYear: shared.dateNextYear,
              open: shared.dateSelect,
              prevMonth: shared.datePrevMonth,
              prevYear: shared.datePrevYear,
              thisMonth: shared.dateThisMonth,
            }}
            localeTag={localeTag}
            preserveQueryKeys={["mode", "tab"]}
            ym={data.range.from.slice(0, 7)}
          />
        ) : data.mode === "custom" ? (
          <AdminDateRangePicker
            ariaLabel={shared.pickRange}
            from={data.range.from}
            labels={rangePickerLabels}
            localeTag={localeTag}
            onChange={(from, to) => {
              if (from && to) go(occupancyHref("custom", { from, to }, tab));
            }}
            to={data.range.to}
          />
        ) : (
          <div className="orv__pnav">
            <Link aria-label={rcopy.prev} className="orv__arrow" href={occupancyHref(data.mode, prevRange, tab)}>
              <ChevronLeft aria-hidden="true" />
            </Link>
            <span className="orv__plabel">{rangeLabel(data.mode, data.range)}</span>
            <Link aria-label={rcopy.next} className="orv__arrow" href={occupancyHref(data.mode, nextRange, tab)}>
              <ChevronRight aria-hidden="true" />
            </Link>
          </div>
        )}
        <span className="orv__cmp">
          <span className="k">{rcopy.compare}</span>
          {fill(rcopy.compareSame, { range: rangeLabel(data.mode, data.previousRange) })}
        </span>
        {phase !== "past" && <span className="orv__pill is-warn">{phase === "current" ? rcopy.inProgress : rcopy.futureOnly}</span>}
      </div>

      <div className="orv__chips">
        <span className="orv__tag">{rcopy.includeLabel}</span>
        {data.properties.map((p) => (
          <button
            aria-pressed={isIn(p.name)}
            className={`orv__chip${isIn(p.name) ? " on" : ""}`}
            key={p.name}
            onClick={() =>
              setIncluded((prev) => {
                const next = new Set(prev);
                if (next.has(p.name)) next.delete(p.name);
                else next.add(p.name);
                return next;
              })
            }
            type="button"
          >
            <span className="ck" aria-hidden="true" />
            {p.name}
          </button>
        ))}
      </div>

      <div className="orv__kpis">
        {kpis.map((kpi) => (
          <div className={`orv__kpi${kpi.hero ? " is-hero" : ""}`} key={kpi.label}>
            <div className="l">{kpi.label}</div>
            <div className="v">{kpi.value}</div>
            <div className="s">
              {kpi.d && <span className={`orv__d ${kpi.tone}`}>{kpi.d}</span>}
              <span>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="orv__tabbar">
        <div className="orv__tabs" role="tablist">
          {tabs.map(([key, label]) => (
            <button aria-selected={tab === key} className={tab === key ? "on" : ""} key={key} onClick={() => setTab(key)} role="tab" type="button">
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "report" && (
        <ReportTab
          copy={copy}
          data={data}
          go={go}
          gradeLabel={gradeLabel}
          inNames={inNames}
          isIn={isIn}
          monthShort={monthShort}
          n={n}
          pct={pct}
          pointText={pointText}
          pointTone={pointTone}
          rangeText={rangeLabel(data.mode, data.range)}
          rcopy={rcopy}
          tab={tab}
        />
      )}
      {tab === "rooms" && (
        <RoomsTab
          anchor={anchor}
          copy={copy}
          data={data}
          inNames={inNames}
          isIn={isIn}
          monthLong={monthLong}
          monthShort={monthShort}
          months12={months12}
          n={n}
          pct={pct}
          pointText={pointText}
          pointTone={pointTone}
          rcopy={rcopy}
          series={roomSeries}
        />
      )}
      {tab === "forward" && (
        <ForwardTab copy={copy} data={data} inNames={inNames} isIn={isIn} monthLong={monthLong} monthShort={monthShort} n={n} pct={pct} rcopy={rcopy} />
      )}

      <p className="orv__note">{copy.basisNote}</p>
      {toast && <div className="orv__toast" role="status">{toast}</div>}
    </div>
  );
}

// ── 추이 · 건물별 (시안 A) ─────────────────────────────────────────────────

type Fmt = {
  n: (value: number) => string;
  pct: (value: number) => string;
  pointText: (current: number, previous: number) => string;
  pointTone: (delta: number | null) => string;
};

function ReportTab({
  data,
  copy,
  rcopy,
  inNames,
  isIn,
  monthShort,
  rangeText,
  go,
  tab,
  gradeLabel,
  n,
  pct,
  pointText,
  pointTone,
}: Fmt & {
  data: OpsRevenueData;
  copy: Copy;
  rcopy: RevenueCopy;
  inNames: string[];
  isIn: (name: string) => boolean;
  monthShort: (month: string) => string;
  rangeText: string;
  go: (href: string) => void;
  tab: OccupancyTab;
  gradeLabel: (value: number) => string;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "desc" | "asc" } | null>(null);
  const cycleSort = (key: SortKey) =>
    setSort((cur) => (cur?.key !== key ? { dir: "desc", key } : cur.dir === "desc" ? { dir: "asc", key } : null));
  const sortValue = (key: SortKey, cur: RevenueMetrics, prev: RevenueMetrics): number | null => {
    switch (key) {
      case "occupancy":
        return cur.availableNights > 0 ? cur.occupancyPct : null;
      case "nights":
        return cur.availableNights > 0 ? cur.occupiedNights : null;
      case "vacant":
        return cur.availableNights > 0 ? cur.availableNights - cur.occupiedNights : null;
      case "previous":
        return prev.availableNights > 0 ? prev.occupancyPct : null;
      case "change":
        return cur.availableNights > 0 && prev.availableNights > 0 ? cur.occupancyPct - prev.occupancyPct : null;
    }
  };
  const sorted = <T,>(items: T[], pick: (item: T) => { cur: RevenueMetrics; prev: RevenueMetrics }) => {
    if (!sort) return items;
    return items
      .map((item, index) => ({ index, item, value: sortValue(sort.key, pick(item).cur, pick(item).prev) }))
      .sort((a, b) => {
        if (a.value === null || b.value === null) return a.value === null ? (b.value === null ? a.index - b.index : 1) : -1;
        return sort.dir === "desc" ? b.value - a.value || a.index - b.index : a.value - b.value || a.index - b.index;
      })
      .map((entry) => entry.item);
  };
  const sortHead = (key: SortKey, label: string) => {
    const active = sort?.key === key;
    const next = !active ? rcopy.sortDesc : sort.dir === "desc" ? rcopy.sortAsc : rcopy.sortReset;
    return (
      <th aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"} scope="col">
        <button className={`orv__sort${active ? " on" : ""}`} onClick={() => cycleSort(key)} title={next} type="button">
          {label}
          {active && (sort.dir === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />)}
        </button>
      </th>
    );
  };

  const todayDay = Number(data.today.slice(8));
  const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const selectedMonths = new Set(data.months.filter((month) => month >= data.range.from.slice(0, 7) && month <= data.range.to.slice(0, 7)));
  const bars = data.months.map((month) => ({
    cur: sumMetrics(inNames.map((name) => data.monthCells[month]?.[name])),
    month,
    prev: sumMetrics(inNames.map((name) => data.monthCells[shiftMonthKey(month, -12)]?.[name])),
  }));

  const line = (name: string, cur: RevenueMetrics, prev: RevenueMetrics, room: boolean) => {
    const has = cur.availableNights > 0;
    const vacant = cur.availableNights - cur.occupiedNights;
    return (
      <>
        <td><OccBar value={has ? cur.occupancyPct : null} pct={pct} /></td>
        <td className="num">{has ? `${n(cur.occupiedNights)} / ${n(cur.availableNights)}` : "—"}</td>
        <td className={`num${room && isMostlyVacant(cur.occupiedNights, cur.availableNights) ? " occ__hot" : ""}`}>{has ? n(vacant) : "—"}</td>
        <td className="num faint">{prev.availableNights > 0 ? pct(prev.occupancyPct) : name ? rcopy.newLabel : "—"}</td>
        <td>
          <span className={`orv__d ${has && prev.availableNights > 0 ? pointTone(cur.occupancyPct - prev.occupancyPct) : "z"}`}>
            {has && prev.availableNights > 0 ? pointText(cur.occupancyPct, prev.occupancyPct) : "—"}
          </span>
        </td>
        <td>{has ? <span className={`occ__grade is-${occupancyGrade(cur.occupancyPct)}`}>{gradeLabel(cur.occupancyPct)}</span> : null}</td>
      </>
    );
  };

  const total = sumMetrics(inNames.map((name) => data.rangeCells[name]));
  const totalPrev = sumMetrics(inNames.map((name) => data.previousRangeCells[name]));

  return (
    <>
      <section className="orv__card">
        <div className="orv__ch">
          <h2>{copy.chartTitle}</h2>
          <span className="orv__muted">{copy.chartHint}</span>
          <span className="orv__grow" />
          <span className="orv__lg"><i className="b1" />{rcopy.legendThisYear}</span>
          <span className="orv__lg"><i className="occ__lgprev" />{rcopy.legendLastYear}</span>
          <span className="orv__lg"><i className="bf" />{rcopy.legendBooked}</span>
          <span className="orv__lg"><i className="occ__lgline" />{copy.legendLine}</span>
        </div>
        <div className="occ__chart">
          <div className="occ__yax">
            {[100, 75, 50, 25].map((v) => (
              <span key={v}>{v}%</span>
            ))}
            <span>0</span>
          </div>
          <div className="occ__plot">
            <div className="occ__line">
              <span>{OCCUPANCY_LINE}%</span>
            </div>
            {bars.map(({ cur, month, prev }) => {
              const p = monthPhase(month, data.today);
              const has = cur.availableNights > 0;
              return (
                <button
                  className={`occ__col is-${p}${selectedMonths.has(month) ? " on" : ""}`}
                  key={month}
                  onClick={() => go(occupancyHref("month", { from: `${month}-01`, to: `${month}-01` }, tab))}
                  style={p === "current" ? ({ "--done": `${Math.round((todayDay / daysIn(month)) * 100)}%` } as CSSProperties) : undefined}
                  title={`${month} · ${has ? pct(cur.occupancyPct) : "—"}`}
                  type="button"
                >
                  <span className="v">{has ? `${cur.occupancyPct.toFixed(0)}%` : "—"}</span>
                  <span className="bar">
                    <i className={`b1${has && cur.occupancyPct < OCCUPANCY_LINE && p === "past" ? " low" : ""}`} style={{ height: `${has ? cur.occupancyPct : 0}%` }} />
                    {prev.availableNights > 0 && <i className="b0" style={{ bottom: `${prev.occupancyPct}%` }} />}
                  </span>
                  <span className={`ml${month.endsWith("-01") ? " y" : ""}`}>{monthShort(month)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="orv__card orv__tablecard">
        <div className="orv__ch">
          <h2>{copy.tableTitle}</h2>
          <span className="orv__muted">{rangeText} · {copy.tableHint}</span>
          <span className="orv__grow" />
          <span className="orv__muted">{copy.gradeNote}</span>
        </div>
        <div className="orv__tablewrap">
          <table className="orv__table occ__table">
            <thead>
              <tr>
                <th scope="col">
                  <button className={`orv__sort${sort ? "" : " on"}`} onClick={() => setSort(null)} title={rcopy.sortReset} type="button">
                    {rcopy.colProperty}
                  </button>
                </th>
                {sortHead("occupancy", rcopy.colOccupancy)}
                {sortHead("nights", copy.colNights)}
                {sortHead("vacant", copy.colVacant)}
                {sortHead("previous", rcopy.colLastYear)}
                {sortHead("change", rcopy.colChange)}
                <th scope="col">{copy.colGrade}</th>
              </tr>
            </thead>
            <tbody>
              {sorted(data.properties, (property) => ({
                cur: metricsOf(data.rangeCells[property.name] ?? sumMetrics([])),
                prev: metricsOf(data.previousRangeCells[property.name] ?? sumMetrics([])),
              })).map((property) => {
                const cur = metricsOf(data.rangeCells[property.name] ?? sumMetrics([]));
                const prev = metricsOf(data.previousRangeCells[property.name] ?? sumMetrics([]));
                const open = openRow === property.name;
                const rooms = open
                  ? sorted(
                      property.rooms
                        .map((room) => ({
                          cur: metricsOf(data.rangeRoomCells[room.key] ?? sumMetrics([])),
                          label: room.label,
                          prev: metricsOf(data.previousRangeRoomCells[room.key] ?? sumMetrics([])),
                        }))
                        .filter((room) => room.cur.availableNights > 0),
                      (room) => room,
                    )
                  : [];
                return (
                  <Fragment key={property.name}>
                    <tr
                      aria-expanded={open}
                      className={`orv__row${open ? " open" : ""}${isIn(property.name) ? "" : " off"}`}
                      onClick={() => setOpenRow(open ? null : property.name)}
                    >
                      <td>
                        <span className="orv__bn">
                          <span className="tw" aria-hidden="true" />
                          {property.name}
                          {!isIn(property.name) && <span className="orv__pill">{rcopy.excludedTag}</span>}
                        </span>
                      </td>
                      {line(property.name, cur, prev, false)}
                    </tr>
                    {rooms.map((room) => (
                      <tr className="orv__room" key={room.label}>
                        <td>{room.label}</td>
                        {line("", room.cur, room.prev, true)}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr className="orv__total">
                <td>{fill(rcopy.totalRow, { n: inNames.length })}</td>
                <td className="num">{total.availableNights > 0 ? pct(total.occupancyPct) : "—"}</td>
                <td className="num">{`${n(total.occupiedNights)} / ${n(total.availableNights)}`}</td>
                <td className="num">{n(Math.max(0, total.availableNights - total.occupiedNights))}</td>
                <td className="num faint">{totalPrev.availableNights > 0 ? pct(totalPrev.occupancyPct) : "—"}</td>
                <td>
                  <span className={`orv__d ${totalPrev.availableNights > 0 ? pointTone(total.occupancyPct - totalPrev.occupancyPct) : "z"}`}>
                    {totalPrev.availableNights > 0 && total.availableNights > 0 ? pointText(total.occupancyPct, totalPrev.occupancyPct) : "—"}
                  </span>
                </td>
                <td>{total.availableNights > 0 && <span className={`occ__grade is-${occupancyGrade(total.occupancyPct)}`}>{gradeLabel(total.occupancyPct)}</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="orv__note occ__foot">{copy.tableFoot}</p>
      </section>
    </>
  );
}

function OccBar({ value, pct }: { value: number | null; pct: (value: number) => string }) {
  if (value === null) return <span className="faint">—</span>;
  return (
    <span className="occ__bar">
      <span className="num">{pct(value)}</span>
      <span className="track">
        <i className={value < OCCUPANCY_LINE ? "low" : ""} style={{ width: `${Math.min(100, value)}%` }} />
        <b style={{ left: `${OCCUPANCY_LINE}%` }} />
      </span>
    </span>
  );
}

// ── 객실 × 월 (시안 B) ────────────────────────────────────────────────────

function RoomsTab({
  data,
  copy,
  rcopy,
  series,
  months12,
  anchor,
  inNames,
  isIn,
  monthShort,
  monthLong,
  n,
  pct,
  pointText,
  pointTone,
}: Fmt & {
  data: OpsRevenueData;
  copy: Copy;
  rcopy: RevenueCopy;
  series: RoomSeries[];
  months12: string[];
  anchor: string;
  inNames: string[];
  isIn: (name: string) => boolean;
  monthShort: (month: string) => string;
  monthLong: (month: string) => string;
}) {
  const [roomSort, setRoomSort] = useState<RoomSort>("catalog");
  const sortRooms = (rooms: RoomSeries[]) => {
    if (roomSort === "catalog") return rooms;
    const key = (room: RoomSeries) => (roomSort === "last" ? room.values.at(-1) : seriesAverage(room.values));
    return rooms
      .map((room, index) => ({ index, room, value: key(room) ?? null }))
      .sort((a, b) => (a.value === null || b.value === null ? (a.value === null ? 1 : -1) : a.value - b.value || a.index - b.index))
      .map((entry) => entry.room);
  };

  const anchorTotal = sumMetrics(inNames.map((name) => data.monthCells[anchor]?.[name]));
  const anchorPrev = sumMetrics(inNames.map((name) => data.monthCells[shiftMonthKey(anchor, -12)]?.[name]));
  const inSeries = series.filter((room) => isIn(room.property));
  const low = inSeries
    .filter((room) => room.values.at(-1) !== null && room.values.at(-1) !== undefined)
    .sort((a, b) => (a.values.at(-1) as number) - (b.values.at(-1) as number))
    .slice(0, 10);
  const below = roomsBelowUsual(inSeries).slice(0, 8);
  const lastIndex = months12.length - 1;

  return (
    <div className="orv__mxsplit">
      <section className="orv__card">
        <div className="orv__ch">
          <h2>{copy.roomsTitle}</h2>
          <span className="orv__unit">{fill(copy.roomsRange, { from: monthLong(months12[0]), to: monthLong(anchor) })}</span>
          <span className="orv__grow" />
          <span className="orv__tag">{copy.sortLabel}</span>
          <div className="orv__seg">
            {(
              [
                ["catalog", copy.sortCatalog],
                ["last", copy.sortLast],
                ["avg", copy.sortAvg],
              ] as const
            ).map(([key, label]) => (
              <button className={roomSort === key ? "on" : ""} key={key} onClick={() => setRoomSort(key)} type="button">
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="orv__ch occ__subhead"><span className="orv__muted">{copy.roomsHint}</span></div>
        <div className="orv__mx">
          <div className="occ__heat" role="grid">
            <div />
            {months12.map((month, index) => (
              <div className={`orv__mh${index === lastIndex ? " sel" : ""}`} key={month}>
                <span className="yy">{index === 0 || month.endsWith("-01") ? month.slice(0, 4) : ""}</span>
                <span className="mm">{monthShort(month)}</span>
              </div>
            ))}
            <div className="orv__mh sum"><span className="yy" /><span className="mm">{copy.colAvg}</span></div>
            {data.properties.map((property) => {
              const rooms = sortRooms(series.filter((room) => room.property === property.name));
              if (rooms.length === 0) return null;
              const off = !isIn(property.name);
              return (
                <Fragment key={property.name}>
                  <div className={`occ__group${off ? " off" : ""}`}>
                    {property.name}
                    <span>{fill(rcopy.roomCount, { n: property.roomCount })}</span>
                    {off && <span className="orv__pill">{rcopy.excludedTag}</span>}
                  </div>
                  {rooms.map((room) => {
                    const avg = seriesAverage(room.values);
                    return (
                      <Fragment key={room.key}>
                        <div className={`occ__rn${off ? " off" : ""}`}>{room.label}</div>
                        {room.values.map((value, index) => (
                          <Link
                            aria-label={`${property.name} ${room.label} ${monthLong(months12[index])}`}
                            className={`occ__hc${value === null ? " na" : ""}${index === lastIndex ? " last" : ""}${off ? " off" : ""}`}
                            href={calendarHref(property.name, months12[index])}
                            key={months12[index]}
                            style={value === null ? undefined : { background: HEAT_BG[heatLevel(value)] }}
                            title={value === null ? rcopy.legendNotOpen : pct(value)}
                          >
                            {value === null ? "" : Math.round(value)}
                          </Link>
                        ))}
                        <div className={`occ__avg${avg !== null && avg < 75 ? " low" : ""}`}>{avg === null ? "—" : `${Math.round(avg)}%`}</div>
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
        <div className="orv__mfoot">
          <div className="orv__lgd">
            {["<60", "60–75", "75–85", "85–95", "95+"].map((label, index) => (
              <span key={label} style={{ background: HEAT_BG[index] }}>{label}</span>
            ))}
          </div>
          <span className="orv__unit">{copy.legendCellNote}</span>
          <span className="orv__grow" />
          <span className="orv__lg"><i className="na" />{rcopy.legendNotOpen}</span>
        </div>
      </section>

      <aside className="orv__side">
        <section className="orv__card">
          <div className="orv__ph">
            <div className="orv__crumb">{fill(copy.summaryTitle, { month: monthLong(anchor), n: inNames.length })}</div>
            <div className="orv__big">
              <span className="num">{anchorTotal.availableNights > 0 ? pct(anchorTotal.occupancyPct) : "—"}</span>
              {anchorPrev.availableNights > 0 && anchorTotal.availableNights > 0 && (
                <span className={`orv__d ${pointTone(anchorTotal.occupancyPct - anchorPrev.occupancyPct)}`}>
                  {pointText(anchorTotal.occupancyPct, anchorPrev.occupancyPct)}
                </span>
              )}
            </div>
            <div className="orv__muted">
              {fill(copy.summarySub, {
                a: n(anchorTotal.occupiedNights),
                b: n(anchorTotal.availableNights),
                c: n(Math.max(0, anchorTotal.availableNights - anchorTotal.occupiedNights)),
              })}
            </div>
          </div>
          <div className="orv__pad orv__rooms">
            <span className="orv__l">{fill(copy.lowTitle, { month: monthShort(anchor) })} · {copy.lowHint}</span>
            {low.map((room) => {
              const value = room.values.at(-1) as number;
              return (
                <Link className="orv__rr occ__rr" href={calendarHref(room.property, anchor)} key={room.key}>
                  <span className="n">{room.property} {room.label}</span>
                  <span className="bar">
                    <i style={{ background: value < OCCUPANCY_LINE ? "var(--danger)" : value < 75 ? "hsl(35 80% 48%)" : "var(--orv-occ)", width: `${Math.min(100, value)}%` }} />
                  </span>
                  <span className="num">{Math.round(value)}%</span>
                </Link>
              );
            })}
          </div>
        </section>
        <section className="orv__card">
          <div className="orv__ch"><h2>{copy.dropTitle}</h2></div>
          <div className="orv__pad">
            <span className="orv__muted">{copy.dropHint}</span>
            {below.length === 0 ? (
              <span className="orv__note">{copy.dropNone}</span>
            ) : (
              below.map((room) => (
                <Link className="occ__drop" href={calendarHref(room.property, anchor)} key={room.key}>
                  {fill(copy.dropItem, { avg: Math.round(room.usual), now: Math.round(room.now), room: `${room.property} ${room.label}` })}
                </Link>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

// ── 앞으로 (시안 C) ───────────────────────────────────────────────────────

function ForwardTab({
  data,
  copy,
  rcopy,
  inNames,
  isIn,
  monthLong,
  monthShort,
  n,
  pct,
}: Pick<Fmt, "n" | "pct"> & {
  data: OpsRevenueData;
  copy: Copy;
  rcopy: RevenueCopy;
  inNames: string[];
  isIn: (name: string) => boolean;
  monthLong: (month: string) => string;
  monthShort: (month: string) => string;
}) {
  const months = data.forwardMonths;
  const totals = months.map((month) => ({
    cur: sumMetrics(inNames.map((name) => data.forwardCells[month]?.[name])),
    month,
    prev: sumMetrics(inNames.map((name) => data.forwardPreviousCells[month]?.[name])),
  }));
  const cellOf = (name: string, month: string) => metricsOf(data.forwardCells[month]?.[name] ?? sumMetrics([]));
  const watch = mostVacantCells(
    data.properties
      .filter((p) => isIn(p.name))
      .flatMap((p) =>
        months.slice(0, 3).map((month) => {
          const cell = cellOf(p.name, month);
          return { available: cell.availableNights, month, occupancy: cell.occupancyPct, property: p.name, vacant: cell.availableNights - cell.occupiedNights };
        }),
      ),
  );

  return (
    <>
      <div className="occ__fbadge"><span className="orv__pill is-warn">{fill(copy.forwardBadge, { today: data.today })}</span></div>
      <div className="occ__fcards">
        {totals.map(({ cur, month, prev }, index) => {
          const vacant = Math.max(0, cur.availableNights - cur.occupiedNights);
          return (
            <div className={`occ__fcard${index === 0 ? " cur" : ""}`} key={month}>
              <div className="h">
                <b>{monthLong(month)}</b>
                <span className={index === 0 ? "warn" : ""}>{index === 0 ? copy.fwdInProgress : copy.fwdBooked}</span>
              </div>
              <span className="v">{cur.availableNights > 0 ? pct(cur.occupancyPct) : "—"}</span>
              <span className="occ__ftrack">
                <i className={cur.occupancyPct < OCCUPANCY_LINE ? "low" : ""} style={{ width: `${Math.min(100, cur.occupancyPct)}%` }} />
                <b style={{ left: `${OCCUPANCY_LINE}%` }} />
              </span>
              <span className="s">
                {fill(copy.fwdVacant, { v: n(vacant) })} · {fill(copy.fwdPrevFinal, { v: prev.availableNights > 0 ? pct(prev.occupancyPct) : "—" })}
              </span>
            </div>
          );
        })}
      </div>

      <section className="orv__card">
        <div className="orv__ch">
          <h2>{copy.fwdMatrixTitle}</h2>
          <span className="orv__muted">{copy.fwdMatrixHint}</span>
          <span className="orv__grow" />
          <span className="orv__muted">{copy.fwdShade}</span>
        </div>
        <div className="orv__mx">
          <div className="occ__fgrid">
            <div />
            {months.map((month, index) => (
              <div className={`orv__mh${index === 0 ? " sel" : ""}`} key={month}>
                <span className="yy">{index === 0 || month.endsWith("-01") ? month.slice(0, 4) : ""}</span>
                <span className="mm">{monthShort(month)}</span>
              </div>
            ))}
            {data.properties.map((property) => {
              const off = !isIn(property.name);
              return (
                <Fragment key={property.name}>
                  <div className={`orv__rl${off ? " off" : ""}`}>
                    <span className="n">{property.name}</span>
                    <span className="s">{off ? rcopy.excludedTag : fill(rcopy.roomCount, { n: property.roomCount })}</span>
                  </div>
                  {months.map((month, index) => {
                    const cell = cellOf(property.name, month);
                    const vacant = Math.max(0, cell.availableNights - cell.occupiedNights);
                    return (
                      <Link
                        aria-label={`${property.name} ${monthLong(month)}`}
                        className={`occ__fc${index === 0 ? " cur" : ""}${off ? " off" : ""}`}
                        href={calendarHref(property.name, month)}
                        key={month}
                        style={{ background: VACANCY_BG[vacancyLevel(vacant, cell.availableNights)] }}
                      >
                        <span className="t">{cell.availableNights > 0 ? n(vacant) : "—"}</span>
                        <span className="s">{cell.availableNights > 0 ? fill(copy.fwdBookedPct, { v: cell.occupancyPct.toFixed(0) }) : ""}</span>
                      </Link>
                    );
                  })}
                </Fragment>
              );
            })}
            <div className="orv__trow" />
            <div className="orv__rl tot">
              <span className="n">{rcopy.totalLabel}</span>
              <span className="s">{fill(rcopy.propertyCount, { n: inNames.length })}</span>
            </div>
            {totals.map(({ cur, month }) => (
              <div className="occ__fc tot" key={month}>
                <span className="t">{n(Math.max(0, cur.availableNights - cur.occupiedNights))}</span>
                <span className="s">{cur.availableNights > 0 ? pct(cur.occupancyPct) : ""}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="orv__split">
        <section className="orv__card">
          <div className="orv__ch"><h2>{copy.fwdCompareTitle}</h2></div>
          <div className="orv__pad">
            <span className="orv__note">{copy.fwdCompareNote}</span>
            {totals.map(({ cur, month, prev }) => (
              <div className="occ__cmp" key={month}>
                <b>{monthShort(month)}</b>
                <span className="track">
                  {prev.availableNights > 0 && <i className="prev" style={{ width: `${Math.min(100, prev.occupancyPct)}%` }} />}
                  <i className="now" style={{ width: `${Math.min(100, cur.occupancyPct)}%` }} />
                  <em style={{ left: `${OCCUPANCY_LINE}%` }} />
                </span>
                <span className="num">{cur.availableNights > 0 ? pct(cur.occupancyPct) : "—"}</span>
              </div>
            ))}
          </div>
        </section>
        <aside className="orv__card occ__watch">
          <div className="orv__ch"><h2>{copy.fwdWatchTitle}</h2></div>
          <div className="orv__pad">
            <span className="orv__muted">{copy.fwdWatchHint}</span>
            {watch.map((cell) => (
              <Link className="occ__drop" href={calendarHref(cell.property, cell.month)} key={`${cell.property}|${cell.month}`}>
                {fill(copy.fwdWatchItem, { month: monthShort(cell.month), pct: `${cell.occupancy.toFixed(0)}%`, property: cell.property, v: n(cell.vacant) })}
              </Link>
            ))}
            {months[0] && (
              <Link className="occ__more" href={`/admin/ops/calendar?mode=monthly&ym=${months[0]}`}>
                {copy.fwdOpenCalendar} →
              </Link>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
