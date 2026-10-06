"use client";

import { Fragment, useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { exportOpsRevenueReport, exportOpsRevenueWorkbook, type OpsRevenueExportPayload } from "@/app/admin/ops/revenue/actions";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { AdminExportButtons } from "@/components/admin/shared/admin-export-buttons";
import { AdminMonthPicker } from "@/components/admin/shared/admin-month-picker";
import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";
import type { Dictionary } from "@/lib/i18n";
import {
  REVENUE_COMPARES,
  REVENUE_MODES,
  changePct,
  fiscalPeriodNumber,
  metricsOf,
  monthPhase,
  quintileCuts,
  quintileLevel,
  shiftRange,
  sumMetrics,
  yoyLevel,
  type RevenueCell,
  type RevenueCompare,
  type RevenueMetrics,
  type RevenueMode,
  type RevenueRange,
} from "@/lib/ops-revenue";
import type { OpsRevenueData } from "@/lib/ops-revenue-server";
import "./ops-revenue.css";

/**
 * 매출 화면 — 시안 A v2(보고서형 + 「건물 × 월」 탭, 2026-10-06 사용자 확정).
 *
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「매출 화면」
 *
 * 숫자는 서버가 판매 캘린더 「매출 요약」과 같은 식으로 낸 **칸**(건물 × 달 조각)이고, 여기서는 합계에 넣을 건물을
 * 골라 더하고 비율을 다시 나눈다. 기간은 주소(`?mode=…`)라 새로고침 · 공유가 된다. 탭 · 건물 고르기 · 매트릭스
 * 선택은 화면 안 상태다.
 */
type Copy = Dictionary["opsRevenue"];
type SharedCopy = Dictionary["admin"]["shared"];
type Tab = "report" | "matrix";
type Metric = "revenue" | "net" | "occupancy" | "adr" | "revpar";
type Lens = "value" | "yoy";

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

const VALUE_BG = ["hsl(223 30% 97.5%)", "hsl(223 46% 93%)", "hsl(223 52% 87.5%)", "hsl(223 54% 81%)", "hsl(223 56% 74%)"];
const YOY_BG = ["hsl(4 74% 89%)", "hsl(4 70% 95%)", "hsl(40 18% 94%)", "hsl(146 44% 91%)", "hsl(146 42% 82%)"];
const YOY_FG = ["hsl(4 66% 34%)", "hsl(4 56% 40%)", "var(--adm-muted)", "hsl(146 50% 26%)", "hsl(146 56% 22%)"];
const CHANNEL_COLOR = { airbnb: "var(--orv-abnb)", booking: "var(--orv-bkng)", direct: "var(--orv-dir)", other: "var(--orv-oth)" };

/** 비교 기간 주소 조각 — 1년 전(기본)은 싣지 않는다. */
type CompareQuery = { compare: RevenueCompare; from?: string; to?: string };

/** 기간 → 주소. 월은 공용 월 선택기(`?ym=`)와 같은 키를 쓴다. 비교 기간(`cmp`)은 기간을 옮겨도 따라간다. */
export function revenueHref(mode: RevenueMode, range: RevenueRange, tab: Tab, compare?: CompareQuery): string {
  const query = new URLSearchParams({ mode });
  if (mode === "month") query.set("ym", range.from.slice(0, 7));
  else query.set("from", range.from);
  if (mode === "custom") query.set("to", range.to);
  if (compare && compare.compare !== "1y") {
    query.set("cmp", compare.compare);
    if (compare.compare === "custom" && compare.from && compare.to) {
      query.set("cfrom", compare.from);
      query.set("cto", compare.to);
    }
  }
  if (tab === "matrix") query.set("tab", tab);
  return `/admin/ops/revenue?${query.toString()}`;
}

export function OpsRevenueConsole({
  data,
  copy,
  shared,
  localeTag,
  initialTab,
}: {
  data: OpsRevenueData;
  copy: Copy;
  shared: SharedCopy;
  localeTag: string;
  initialTab: Tab;
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(data.properties.filter((p) => !p.defaultExcluded).map((p) => p.name)),
  );
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("revenue");
  const [lens, setLens] = useState<Lens>("value");
  const anchor = data.months[11];
  const [pick, setPick] = useState<{ property: string | null; month: string }>(() => ({
    month: anchor,
    property: data.properties.find((p) => !p.defaultExcluded)?.name ?? data.properties[0]?.name ?? null,
  }));
  const [toast, setToast] = useState<string | null>(null);

  // 탭은 주소에도 적는다 — 기간을 옮겨도(링크) 같은 탭으로 돌아온다.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "matrix") url.searchParams.set("tab", "matrix");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [tab]);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 2000);
  };
  const go = (href: string) => startNav(() => router.push(href));

  // ── 숫자 모양 ──
  const yen = (value: number) => `¥${Math.round(value).toLocaleString(localeTag)}`;
  const man = (value: number) => {
    const m = value / 1e6;
    return `¥${m >= 100 ? m.toFixed(0) : m.toFixed(1)}M`;
  };
  const pct = (value: number) => `${value.toFixed(1)}%`;
  const deltaText = (delta: number | null) =>
    delta === null ? copy.newLabel : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}%`;
  const pointText = (current: number, previous: number) => {
    const d = current - previous;
    return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}${copy.pointSuffix}`;
  };
  const tone = (delta: number | null) => (delta === null ? "z" : delta >= 0.05 ? "up" : delta <= -0.05 ? "dn" : "z");
  const monthShort = (month: string) =>
    new Intl.DateTimeFormat(localeTag, { month: "short", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  const monthLong = (month: string) =>
    new Intl.DateTimeFormat(localeTag, { month: "long", timeZone: "UTC", year: "numeric" }).format(new Date(`${month}-15T00:00:00Z`));
  const dayLabel = (date: string, withYear: boolean) =>
    new Intl.DateTimeFormat(localeTag, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      ...(withYear ? { year: "numeric" } : {}),
    }).format(new Date(`${date}T00:00:00Z`));
  const rangeLabel = (mode: RevenueMode, range: RevenueRange) => {
    if (mode === "month") return monthLong(range.from.slice(0, 7));
    if (mode === "fiscal") {
      return fill(copy.fiscalLabel, {
        from: range.from.slice(0, 7).replace("-", "."),
        n: fiscalPeriodNumber(Number(range.from.slice(0, 4))),
        to: range.to.slice(0, 7).replace("-", "."),
      });
    }
    if (mode === "year") return range.from.slice(0, 4);
    const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
    return `${dayLabel(range.from, true)} – ${dayLabel(range.to, !sameYear)}`;
  };

  // ── 합 ──
  const isIn = (name: string) => included.has(name);
  const totalOf = (cells: Record<string, RevenueCell> | undefined) =>
    sumMetrics(data.properties.filter((p) => isIn(p.name)).map((p) => cells?.[p.name]));
  const current = totalOf(data.rangeCells);
  const previous = totalOf(data.previousRangeCells);
  const phase = data.range.to < data.today ? "past" : data.range.from > data.today ? "future" : "current";

  const exportPayload = (): OpsRevenueExportPayload => {
    const row = (name: string, cur: RevenueMetrics, prev: RevenueMetrics) => ({
      adr: cur.occupiedNights > 0 ? cur.adr : null,
      commission: cur.commission,
      name,
      net: cur.net,
      occupancyPct: cur.availableNights > 0 ? cur.occupancyPct : null,
      previous: prev.revenue,
      revenue: cur.revenue,
      revpar: cur.availableNights > 0 ? cur.revpar : null,
    });
    return {
      monthLabels: data.months.map((month) => monthLong(month)),
      monthRangeLabel: `${monthLong(data.months[0])} – ${monthLong(data.months[data.months.length - 1])}`,
      monthlyTotal: data.months.map((month) =>
        data.properties.filter((p) => isIn(p.name)).reduce((sum, p) => sum + (data.monthCells[month]?.[p.name]?.revenue ?? 0), 0),
      ),
      monthly: data.properties.map((p) => ({
        name: p.name,
        values: data.months.map((month) => {
          const cell = data.monthCells[month]?.[p.name];
          return cell && cell.revenue > 0 ? cell.revenue : null;
        }),
      })),
      compare: data.compare,
      rangeLabel: rangeLabel(data.mode, data.range),
      rows: data.properties
        .filter((p) => (data.rangeCells[p.name]?.revenue ?? 0) > 0 || (data.previousRangeCells[p.name]?.revenue ?? 0) > 0)
        .map((p) => row(p.name, metricsOf(data.rangeCells[p.name] ?? sumMetrics([])), metricsOf(data.previousRangeCells[p.name] ?? sumMetrics([])))),
      total: row(fill(copy.totalRow, { n: included.size }), current, previous),
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
    prevMonth: shared.datePrevMonth,
    nextYear: shared.dateNextYear,
    prevYear: shared.datePrevYear,
    reset: shared.dateReset,
    thisMonth: shared.dateThisMonth,
  };
  const modeLabel: Record<RevenueMode, string> = {
    custom: copy.modeCustom,
    fiscal: copy.modeFiscal,
    month: copy.modeMonth,
    week: copy.modeWeek,
    year: copy.modeYear,
  };

  const cmpQ: CompareQuery = { compare: data.compare, from: data.previousRange.from, to: data.previousRange.to };
  const lastYearLabel = data.compare === "1y" ? copy.lastYearValue : copy.compareValue;
  const compareLabel: Record<RevenueCompare, string> = {
    "1y": copy.cmp1y,
    "2y": copy.cmp2y,
    "3y": copy.cmp3y,
    custom: copy.cmpCustom,
  };
  // ── 숫자 6개 ──
  const dRev = changePct(current.revenue, previous.revenue);
  const kpis = [
    { d: deltaText(dRev), hero: true, label: copy.kpiRevenue, sub: fill(lastYearLabel, { v: man(previous.revenue) }), tone: tone(dRev), value: man(current.revenue) },
    {
      d: deltaText(changePct(current.commission, previous.commission)),
      label: copy.kpiCommission,
      sub: fill(copy.shareOfRevenue, { v: current.revenue > 0 ? pct((current.commission / current.revenue) * 100) : "—" }),
      tone: "z",
      value: man(current.commission),
    },
    { d: deltaText(changePct(current.net, previous.net)), label: copy.kpiNet, sub: fill(lastYearLabel, { v: man(previous.net) }), tone: tone(changePct(current.net, previous.net)), value: man(current.net) },
    {
      d: previous.availableNights > 0 ? pointText(current.occupancyPct, previous.occupancyPct) : copy.newLabel,
      label: copy.kpiOccupancy,
      sub: fill(copy.nightsOf, { a: current.occupiedNights.toLocaleString(localeTag), b: current.availableNights.toLocaleString(localeTag) }),
      tone: previous.availableNights > 0 ? tone(current.occupancyPct - previous.occupancyPct) : "z",
      value: pct(current.occupancyPct),
    },
    { d: deltaText(changePct(current.adr, previous.adr)), label: copy.kpiAdr, sub: fill(lastYearLabel, { v: yen(previous.adr) }), tone: tone(changePct(current.adr, previous.adr)), value: yen(current.adr) },
    { d: deltaText(changePct(current.revpar, previous.revpar)), label: copy.kpiRevpar, sub: fill(lastYearLabel, { v: yen(previous.revpar) }), tone: tone(changePct(current.revpar, previous.revpar)), value: yen(current.revpar) },
  ];

  const prevRange = shiftRange(data.mode, data.range, -1);
  const nextRange = shiftRange(data.mode, data.range, 1);

  return (
    <div className={`orv${navPending ? " is-pending" : ""}`}>
      <div className="orv__top">
        <h1 className="orv__title">{copy.title}</h1>
        <div className="orv__export">
          <AdminExportButtons
            disabled={current.revenue === 0 && previous.revenue === 0}
            labels={shared}
            onExportPdf={() => exportOpsRevenueReport(exportPayload())}
            onExportXls={() => exportOpsRevenueWorkbook(exportPayload())}
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
              href={revenueHref(mode, mode === "custom" ? data.range : shiftToMode(mode, data.range, data.today), tab, cmpQ)}
              key={mode}
              role="tab"
            >
              {modeLabel[mode]}
            </Link>
          ))}
        </div>
        {data.mode === "month" ? (
          <AdminMonthPicker
            basePath="/admin/ops/revenue"
            labels={{
              nextMonth: shared.dateNextMonth,
              nextYear: shared.dateNextYear,
              open: shared.dateSelect,
              prevMonth: shared.datePrevMonth,
              prevYear: shared.datePrevYear,
              thisMonth: shared.dateThisMonth,
            }}
            localeTag={localeTag}
            preserveQueryKeys={["mode", "tab", "cmp", "cfrom", "cto"]}
            ym={data.range.from.slice(0, 7)}
          />
        ) : data.mode === "custom" ? (
          <AdminDateRangePicker
            ariaLabel={shared.pickRange}
            from={data.range.from}
            labels={rangePickerLabels}
            localeTag={localeTag}
            onChange={(from, to) => {
              if (from && to) go(revenueHref("custom", { from, to }, tab, cmpQ));
            }}
            to={data.range.to}
          />
        ) : (
          <div className="orv__pnav">
            <Link aria-label={copy.prev} className="orv__arrow" href={revenueHref(data.mode, prevRange, tab, cmpQ)}>
              <ChevronLeft aria-hidden="true" />
            </Link>
            <span className="orv__plabel">{rangeLabel(data.mode, data.range)}</span>
            <Link aria-label={copy.next} className="orv__arrow" href={revenueHref(data.mode, nextRange, tab, cmpQ)}>
              <ChevronRight aria-hidden="true" />
            </Link>
          </div>
        )}
        <div className="orv__cmp">
          <span className="k">{copy.compare}</span>
          <div className="orv__seg">
            {REVENUE_COMPARES.map((key) => (
              <Link
                aria-pressed={data.compare === key}
                className={data.compare === key ? "on" : ""}
                // 「직접」을 처음 누르면 지금 비교 기간을 그대로 들고 간다 — 거기서 달력으로 고친다.
                href={revenueHref(data.mode, data.range, tab, { compare: key, from: data.previousRange.from, to: data.previousRange.to })}
                key={key}
              >
                {compareLabel[key]}
              </Link>
            ))}
          </div>
          {data.compare === "custom" ? (
            <AdminDateRangePicker
              ariaLabel={copy.colCompare}
              from={data.previousRange.from}
              labels={rangePickerLabels}
              localeTag={localeTag}
              onChange={(from, to) => {
                if (from && to) go(revenueHref(data.mode, data.range, tab, { compare: "custom", from, to }));
              }}
              to={data.previousRange.to}
            />
          ) : (
            <span className="orv__cmprange">
              {fill(data.compare === "1y" ? copy.compareSame : copy.compareRange, { range: rangeLabel(data.mode, data.previousRange) })}
            </span>
          )}
        </div>
        {phase !== "past" && <span className="orv__pill is-warn">{phase === "current" ? copy.inProgress : copy.futureOnly}</span>}
      </div>

      <div className="orv__chips">
        <span className="orv__tag">{copy.includeLabel}</span>
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
              <span className={`orv__d ${kpi.tone}`}>{kpi.d}</span>
              <span>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="orv__tabbar">
        <div className="orv__tabs" role="tablist">
          {(["report", "matrix"] as const).map((key) => (
            <button aria-selected={tab === key} className={tab === key ? "on" : ""} key={key} onClick={() => setTab(key)} role="tab" type="button">
              {key === "report" ? copy.tabReport : copy.tabMatrix}
            </button>
          ))}
        </div>
        {tab === "matrix" && (
          <div className="orv__mxctl">
            <div className="orv__seg">
              {(["revenue", "net", "occupancy", "adr", "revpar"] as const).map((key) => (
                <button className={metric === key ? "on" : ""} key={key} onClick={() => setMetric(key)} type="button">
                  {{ adr: copy.metricAdr, net: copy.metricNet, occupancy: copy.metricOccupancy, revenue: copy.metricRevenue, revpar: copy.metricRevpar }[key]}
                </button>
              ))}
            </div>
            <div className="orv__seg">
              {(["value", "yoy"] as const).map((key) => (
                <button className={lens === key ? "on" : ""} key={key} onClick={() => setLens(key)} type="button">
                  {key === "value" ? copy.lensValue : copy.lensYoy}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab === "report" ? (
        <ReportTab
          cmpQ={cmpQ}
          copy={copy}
          current={current}
          data={data}
          deltaText={deltaText}
          go={go}
          isIn={isIn}
          man={man}
          monthShort={monthShort}
          openRow={openRow}
          pct={pct}
          rangeText={rangeLabel(data.mode, data.range)}
          setOpenRow={setOpenRow}
          tab={tab}
          tone={tone}
          yen={yen}
        />
      ) : (
        <MatrixTab
          copy={copy}
          data={data}
          isIn={isIn}
          lens={lens}
          man={man}
          metric={metric}
          monthLong={monthLong}
          monthShort={monthShort}
          pick={pick}
          pointText={pointText}
          setPick={setPick}
          deltaText={deltaText}
          tone={tone}
          yen={yen}
          pct={pct}
        />
      )}

      {toast && <div className="orv__toast" role="status">{toast}</div>}
    </div>
  );
}

/** 다른 모드로 갈 때 — 지금 보던 기간의 끝(오늘보다 뒤면 오늘)이 든 그 모드의 기간으로. 모양은 서버가 바로잡는다. */
function shiftToMode(mode: RevenueMode, range: RevenueRange, today: string): RevenueRange {
  const base = range.to > today && range.from <= today ? today : range.to;
  switch (mode) {
    case "month":
      return { from: `${base.slice(0, 7)}-01`, to: base };
    default:
      return { from: base, to: base };
  }
}

// ── 추이 · 건물별 ─────────────────────────────────────────────────────────

type Fmt = {
  yen: (value: number) => string;
  man: (value: number) => string;
  pct: (value: number) => string;
  deltaText: (delta: number | null) => string;
  tone: (delta: number | null) => string;
};

function ReportTab({
  cmpQ,
  data,
  copy,
  current,
  isIn,
  openRow,
  setOpenRow,
  monthShort,
  rangeText,
  go,
  tab,
  yen,
  man,
  pct,
  deltaText,
  tone,
}: Fmt & {
  cmpQ: CompareQuery;
  data: OpsRevenueData;
  copy: Copy;
  current: RevenueMetrics;
  isIn: (name: string) => boolean;
  openRow: string | null;
  setOpenRow: (name: string | null) => void;
  monthShort: (month: string) => string;
  rangeText: string;
  go: (href: string) => void;
  tab: Tab;
}) {
  const inNames = data.properties.filter((p) => isIn(p.name)).map((p) => p.name);
  const bars = data.months.map((month) => {
    const cur = sumMetrics(inNames.map((name) => data.monthCells[month]?.[name]));
    const prev = sumMetrics(inNames.map((name) => data.monthCells[shiftMonthKey(month, -12)]?.[name]));
    return { cur, month, prev };
  });
  const max = Math.max(1, ...bars.map((bar) => Math.max(bar.cur.revenue, bar.prev.revenue))) * 1.08;
  const step = Math.max(1e6, Math.ceil(max / 4 / 1e7) * 1e7);
  const top = step * 4;
  const todayDay = Number(data.today.slice(8));
  const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const selectedMonths = new Set(
    data.months.filter((month) => month >= data.range.from.slice(0, 7) && month <= data.range.to.slice(0, 7)),
  );

  const channels = (
    [
      ["airbnb", current.airbnb, copy.channelAirbnb, copy.channelWithCommission],
      ["booking", current.booking, copy.channelBooking, copy.channelWithCommission],
      ["direct", current.direct, copy.channelDirect, copy.channelNoCommission],
      ["other", current.other, copy.channelOther, copy.channelOtherSub],
    ] as const
  ).filter(([, value]) => value > 0);

  return (
    <>
      <section className="orv__card">
        <div className="orv__ch">
          <h2>{copy.chartTitle}</h2>
          <span className="orv__muted">{copy.chartHint}</span>
          <span className="orv__grow" />
          <span className="orv__lg"><i className="b1" />{copy.legendThisYear}</span>
          <span className="orv__lg"><i className="b0" />{copy.legendLastYear}</span>
          <span className="orv__lg"><i className="bf" />{copy.legendBooked}</span>
          <span className="orv__lg"><i className="oc" />{copy.legendOccupancy}</span>
        </div>
        <div className="orv__chart">
          <div className="orv__yax">
            {[4, 3, 2, 1].map((n) => (
              <span key={n}>¥{((step * n) / 1e6).toFixed(0)}M</span>
            ))}
            <span>0</span>
          </div>
          {bars.map(({ cur, month, prev }) => {
            const p = monthPhase(month, data.today);
            const href = revenueHref("month", { from: `${month}-01`, to: `${month}-28` }, tab, cmpQ);
            return (
              <button
                className={`orv__col is-${p}${selectedMonths.has(month) ? " on" : ""}`}
                key={month}
                onClick={() => go(href)}
                style={p === "current" ? ({ "--done": `${Math.round((todayDay / daysIn(month)) * 100)}%` } as CSSProperties) : undefined}
                title={`${month} · ${yen(cur.revenue)}`}
                type="button"
              >
                <span className="bars">
                  <i className="b0" style={{ height: `${(prev.revenue / top) * 100}%` }} />
                  <i className="b1" style={{ height: `${(cur.revenue / top) * 100}%` }} />
                </span>
                <span className={`ml${month.endsWith("-01") ? " y" : ""}`}>{monthShort(month)}</span>
                <span className="ocb"><i style={{ width: `${cur.occupancyPct}%` }} /></span>
                <span className="oc">{cur.availableNights > 0 ? `${cur.occupancyPct.toFixed(0)}%` : "—"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="orv__split">
        <section className="orv__card orv__tablecard">
          <div className="orv__ch">
            <h2>{copy.tableTitle}</h2>
            <span className="orv__muted">{rangeText} · {copy.tableHint}</span>
            <span className="orv__grow" />
            <span className="orv__lg"><i style={{ background: CHANNEL_COLOR.airbnb }} />{copy.channelAirbnb}</span>
            <span className="orv__lg"><i style={{ background: CHANNEL_COLOR.booking }} />{copy.channelBooking}</span>
            <span className="orv__lg"><i style={{ background: CHANNEL_COLOR.direct }} />{copy.channelDirect}</span>
          </div>
          <div className="orv__tablewrap">
            <table className="orv__table">
              <thead>
                <tr>
                  <th>{copy.colProperty}</th>
                  <th>{copy.colRevenue}</th>
                  <th>{data.compare === "1y" ? copy.colLastYear : copy.colCompare}</th>
                  <th>{copy.colChange}</th>
                  <th>{copy.colOccupancy}</th>
                  <th>{copy.colAdr}</th>
                  <th>{copy.colRevpar}</th>
                  <th>{copy.colNet}</th>
                  <th>{copy.colChannels}</th>
                </tr>
              </thead>
              <tbody>
                {data.properties.map((property) => {
                  const cur = metricsOf(data.rangeCells[property.name] ?? sumMetrics([]));
                  const prev = metricsOf(data.previousRangeCells[property.name] ?? sumMetrics([]));
                  const open = openRow === property.name;
                  const delta = changePct(cur.revenue, prev.revenue);
                  const rooms = open
                    ? property.rooms.map((room) => ({
                        cur: metricsOf(data.rangeRoomCells[room.key] ?? sumMetrics([])),
                        label: room.label,
                        prev: metricsOf(data.previousRangeRoomCells[room.key] ?? sumMetrics([])),
                      }))
                    : [];
                  return (
                    <RowGroup key={property.name}>
                      <tr
                        aria-expanded={open}
                        className={`orv__row${open ? " open" : ""}${isIn(property.name) ? "" : " off"}`}
                        onClick={() => setOpenRow(open ? null : property.name)}
                      >
                        <td>
                          <span className="orv__bn">
                            <span className="tw" aria-hidden="true" />
                            {property.name}
                            {!isIn(property.name) && <span className="orv__pill">{copy.excludedTag}</span>}
                          </span>
                        </td>
                        <td className="num">{cur.revenue > 0 ? yen(cur.revenue) : "—"}</td>
                        <td className="num faint">{prev.revenue > 0 ? yen(prev.revenue) : copy.newLabel}</td>
                        <td><span className={`orv__d ${prev.revenue > 0 ? tone(delta) : "z"}`}>{prev.revenue > 0 ? deltaText(delta) : "—"}</span></td>
                        <td><Occ value={cur.availableNights > 0 ? cur.occupancyPct : null} pct={pct} /></td>
                        <td className="num">{cur.occupiedNights > 0 ? yen(cur.adr) : "—"}</td>
                        <td className="num">{cur.availableNights > 0 ? yen(cur.revpar) : "—"}</td>
                        <td className="num">{cur.revenue > 0 ? yen(cur.net) : "—"}</td>
                        <td><ChannelBar cell={cur} /></td>
                      </tr>
                      {rooms.map((room) => {
                        const d = changePct(room.cur.revenue, room.prev.revenue);
                        return (
                          <tr className="orv__room" key={room.label}>
                            <td>{room.label}</td>
                            <td className="num">{room.cur.revenue > 0 ? yen(room.cur.revenue) : "—"}</td>
                            <td className="num faint">{room.prev.revenue > 0 ? yen(room.prev.revenue) : "—"}</td>
                            <td><span className={`orv__d ${tone(d)}`}>{room.prev.revenue > 0 ? deltaText(d) : "—"}</span></td>
                            <td><Occ value={room.cur.availableNights > 0 ? room.cur.occupancyPct : null} pct={pct} /></td>
                            <td className="num">{room.cur.occupiedNights > 0 ? yen(room.cur.adr) : "—"}</td>
                            <td className="num">{room.cur.availableNights > 0 ? yen(room.cur.revpar) : "—"}</td>
                            <td className="num faint">{room.cur.revenue > 0 ? yen(room.cur.net) : "—"}</td>
                            <td><ChannelBar cell={room.cur} /></td>
                          </tr>
                        );
                      })}
                    </RowGroup>
                  );
                })}
                <TotalRow copy={copy} data={data} isIn={isIn} yen={yen} pct={pct} deltaText={deltaText} tone={tone} man={man} />
              </tbody>
            </table>
          </div>
        </section>

        <aside className="orv__side">
          <section className="orv__card">
            <div className="orv__ch"><h2>{copy.flowTitle}</h2></div>
            <div className="orv__pad">
              <div className="orv__flow">
                <div><span className="k">{copy.flowRevenue}</span><span className="num">{yen(current.revenue)}</span></div>
                <div><span className="k">{copy.flowCommission}</span><span className="num bad">− {yen(current.commission)}</span></div>
                <div className="t"><span>{copy.flowNet}</span><span className="num">{yen(current.net)}</span></div>
              </div>
              <p className="orv__note">
                {fill(copy.flowNote, { rate: current.revenue > 0 ? pct((current.commission / current.revenue) * 100) : "—" })}
              </p>
            </div>
          </section>
          <section className="orv__card">
            <div className="orv__ch"><h2>{copy.channelTitle}</h2><span className="orv__muted">{copy.channelBasis}</span></div>
            <div className="orv__pad">
              <div className="orv__stack">
                {channels.map(([key, value]) => (
                  <i key={key} style={{ background: CHANNEL_COLOR[key], width: `${(value / Math.max(1, current.revenue)) * 100}%` }} />
                ))}
              </div>
              {channels.map(([key, value, name, sub]) => (
                <div className="orv__chr" key={key}>
                  <i style={{ background: CHANNEL_COLOR[key] }} />
                  <span className="nm">{name}</span>
                  <span className="num">{yen(value)}</span>
                  <span className="num faint">{pct((value / Math.max(1, current.revenue)) * 100)}</span>
                  <span className="sub">{sub}</span>
                </div>
              ))}
            </div>
          </section>
          <p className="orv__note">{copy.basisNote}</p>
        </aside>
      </div>
    </>
  );
}

function RowGroup({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

function TotalRow({ data, copy, isIn, yen, pct, deltaText, tone }: Fmt & { data: OpsRevenueData; copy: Copy; isIn: (name: string) => boolean }) {
  const names = data.properties.filter((p) => isIn(p.name)).map((p) => p.name);
  const cur = sumMetrics(names.map((name) => data.rangeCells[name]));
  const prev = sumMetrics(names.map((name) => data.previousRangeCells[name]));
  const delta = changePct(cur.revenue, prev.revenue);
  return (
    <tr className="orv__total">
      <td>{fill(copy.totalRow, { n: names.length })}</td>
      <td className="num">{yen(cur.revenue)}</td>
      <td className="num faint">{prev.revenue > 0 ? yen(prev.revenue) : "—"}</td>
      <td><span className={`orv__d ${tone(delta)}`}>{prev.revenue > 0 ? deltaText(delta) : "—"}</span></td>
      <td className="num">{cur.availableNights > 0 ? pct(cur.occupancyPct) : "—"}</td>
      <td className="num">{cur.occupiedNights > 0 ? yen(cur.adr) : "—"}</td>
      <td className="num">{cur.availableNights > 0 ? yen(cur.revpar) : "—"}</td>
      <td className="num">{yen(cur.net)}</td>
      <td />
    </tr>
  );
}

function Occ({ value, pct }: { value: number | null; pct: (value: number) => string }) {
  if (value === null) return <span className="faint">—</span>;
  return (
    <span className="orv__occ">
      <span className="num">{pct(value)}</span>
      <span className="bar"><i style={{ width: `${Math.min(100, value)}%` }} /></span>
    </span>
  );
}

function ChannelBar({ cell }: { cell: RevenueCell }) {
  const total = Math.max(1, cell.revenue);
  return (
    <span className="orv__mini" aria-hidden="true">
      <i style={{ background: CHANNEL_COLOR.airbnb, width: `${(cell.airbnb / total) * 100}%` }} />
      <i style={{ background: CHANNEL_COLOR.booking, width: `${(cell.booking / total) * 100}%` }} />
      <i style={{ background: CHANNEL_COLOR.direct, width: `${(cell.direct / total) * 100}%` }} />
      <i style={{ background: CHANNEL_COLOR.other, width: `${(cell.other / total) * 100}%` }} />
    </span>
  );
}

// ── 건물 × 월 ─────────────────────────────────────────────────────────────

function MatrixTab({
  data,
  copy,
  isIn,
  metric,
  lens,
  pick,
  setPick,
  monthShort,
  monthLong,
  pointText,
  yen,
  man,
  pct,
  deltaText,
  tone,
}: Fmt & {
  data: OpsRevenueData;
  copy: Copy;
  isIn: (name: string) => boolean;
  metric: Metric;
  lens: Lens;
  pick: { property: string | null; month: string };
  setPick: (pick: { property: string | null; month: string }) => void;
  monthShort: (month: string) => string;
  monthLong: (month: string) => string;
  pointText: (current: number, previous: number) => string;
}) {
  const months = data.months;
  const inNames = data.properties.filter((p) => isIn(p.name)).map((p) => p.name);
  const value = (m: RevenueMetrics) =>
    metric === "revenue" ? m.revenue : metric === "net" ? m.net : metric === "occupancy" ? m.occupancyPct : metric === "adr" ? m.adr : m.revpar;
  const short = (v: number) =>
    metric === "occupancy" ? `${v.toFixed(0)}%` : metric === "adr" || metric === "revpar" ? `${Math.round(v / 1000)}K` : (v / 1e6).toFixed(1);
  const unit = metric === "occupancy" ? copy.unitPercent : metric === "adr" || metric === "revpar" ? copy.unitThousand : copy.unitMillion;
  const perRow = metric === "revenue" || metric === "net";
  const isPast = (month: string) => monthPhase(month, data.today) === "past";
  const has = (m: RevenueMetrics) => (metric === "revenue" || metric === "net" ? m.revenue > 0 : metric === "adr" ? m.occupiedNights > 0 : m.availableNights > 0);
  const deltaOf = (cur: RevenueMetrics, prev: RevenueMetrics) =>
    metric === "occupancy" ? (prev.availableNights > 0 ? cur.occupancyPct - prev.occupancyPct : null) : has(prev) ? changePct(value(cur), value(prev)) : null;
  const deltaShort = (d: number | null) =>
    d === null ? "" : `${Math.abs(d) >= 100 && metric !== "occupancy" ? "100%+" : `${Math.abs(d).toFixed(0)}${metric === "occupancy" ? copy.pointSuffix : "%"}`}`;

  const rowCells = (names: string[]) =>
    months.map((month) => ({
      cur: sumMetrics(names.map((name) => data.monthCells[month]?.[name])),
      month,
      prev: sumMetrics(names.map((name) => data.monthCells[shiftMonthKey(month, -12)]?.[name])),
    }));
  const rows = data.properties.map((p) => ({ name: p.name, rooms: p.roomCount, cells: rowCells([p.name]) }));
  const totalCells = rowCells(inNames);
  const pastValues = (cells: ReturnType<typeof rowCells>) => cells.filter((c) => isPast(c.month) && has(c.cur)).map((c) => value(c.cur));
  const globalCuts = quintileCuts(rows.flatMap((row) => pastValues(row.cells)));
  const firstFuture = months.findIndex((month) => !isPast(month));

  const sum12 = (cells: ReturnType<typeof rowCells>) => {
    const cur = sumMetrics(cells.slice(0, 12).map((c) => c.cur));
    const prev = sumMetrics(cells.slice(0, 12).map((c) => c.prev));
    const v = value(cur);
    const d = deltaOf(cur, prev);
    // 전년 12개월 중 문을 연 달이 절반도 안 되면 증감 대신 「신규」(2026-10-06 — 연 지 얼마 안 된 건물의 +650% 같은 숫자).
    const prevOpenMonths = cells.slice(0, 12).filter((c) => c.prev.occupiedNights > 0).length;
    const thin = prevOpenMonths < 6;
    return {
      d: thin ? copy.newLabel : metric === "occupancy" ? (d === null ? copy.newLabel : pointText(v, value(prev))) : deltaText(d),
      tone: thin ? "z" : tone(d),
      v: metric === "occupancy" ? pct(v) : metric === "adr" || metric === "revpar" ? yen(v) : man(v),
    };
  };

  const cellView = (cur: RevenueMetrics, prev: RevenueMetrics, month: string, cuts: number[], property: string | null) => {
    const future = !isPast(month);
    const selected = pick.property === property && pick.month === month;
    if (cur.occupiedNights === 0 && cur.revenue === 0) {
      return { className: "orv__mc na", style: undefined, sub: "", text: "" };
    }
    const d = deltaOf(cur, prev);
    const classes = ["orv__mc", future ? "fut" : "", selected ? "on" : "", property === null ? "tot" : "", months.indexOf(month) === firstFuture ? "edge" : ""];
    if (lens === "value") {
      return {
        className: classes.join(" "),
        style: { background: VALUE_BG[quintileLevel(value(cur), cuts)] },
        sub: d === null ? "" : `${d >= 0 ? "▲" : "▼"}${deltaShort(d)}`,
        subClass: d === null ? "" : d >= 0 ? "u" : "dn",
        text: short(value(cur)),
      };
    }
    const level = yoyLevel(d);
    return {
      className: classes.join(" "),
      style: level < 0 ? { background: "var(--surface2)", color: "var(--faint)" } : { background: YOY_BG[level], color: YOY_FG[level] },
      sub: short(value(cur)),
      subClass: "",
      text: d === null ? copy.newLabel : `${d >= 0 ? "+" : "−"}${deltaShort(d)}`,
    };
  };

  // 고른 칸
  const pickNames = pick.property === null ? inNames : [pick.property];
  const pickCur = sumMetrics(pickNames.map((name) => data.monthCells[pick.month]?.[name]));
  const pickPrev = sumMetrics(pickNames.map((name) => data.monthCells[shiftMonthKey(pick.month, -12)]?.[name]));
  const pickProperty = data.properties.find((p) => p.name === pick.property);
  const pickRooms = pickProperty
    ? pickProperty.rooms
        .map((room) => ({ label: room.label, m: metricsOf(data.monthRoomCells[pick.month]?.[room.key] ?? sumMetrics([])) }))
        .filter((room) => room.m.availableNights > 0)
        .sort((a, b) => a.m.occupancyPct - b.m.occupancyPct)
    : [];
  const pickDelta = changePct(pickCur.revenue, pickPrev.revenue);
  const pickChannels = (
    [
      ["airbnb", pickCur.airbnb, copy.channelAirbnb],
      ["booking", pickCur.booking, copy.channelBooking],
      ["direct", pickCur.direct, copy.channelDirect],
      ["other", pickCur.other, copy.channelOther],
    ] as const
  ).filter(([, v]) => v > 0);
  const metricName = { adr: copy.metricAdr, net: copy.metricNet, occupancy: copy.metricOccupancy, revenue: copy.metricRevenue, revpar: copy.metricRevpar }[metric];

  return (
    <div className="orv__mxsplit">
      <section className="orv__card orv__mxcard">
        <div className="orv__ch">
          <h2>{fill(lens === "value" ? copy.matrixTitle : copy.matrixTitleYoy, { metric: metricName })}</h2>
          <span className="orv__unit">{fill(lens === "value" ? copy.unitNote : copy.unitNoteYoy, { unit })}</span>
          <span className="orv__grow" />
          <span className="orv__muted">{copy.matrixHint}</span>
        </div>
        <div className="orv__mx">
          <div className="orv__mg" role="grid">
            <div />
            {months.map((month, index) => (
              <div
                className={`orv__mh${isPast(month) ? "" : " fut"}${pick.month === month ? " sel" : ""}${index === firstFuture ? " edge" : ""}`}
                key={month}
              >
                <span className="yy">{index === 0 || month.endsWith("-01") ? month.slice(0, 4) : ""}</span>
                <span className="mm">{monthShort(month)}</span>
              </div>
            ))}
            <div className="orv__mh sum"><span className="yy" /><span className="mm">{copy.sum12}</span></div>

            {rows.map((row) => {
              const cuts = perRow ? quintileCuts(pastValues(row.cells)) : globalCuts;
              const total = sum12(row.cells);
              return (
                <RowGroup key={row.name}>
                  <div className={`orv__rl${isIn(row.name) ? "" : " off"}${pick.property === row.name ? " sel" : ""}`}>
                    <span className="n">{row.name}</span>
                    <span className="s">{fill(copy.roomCount, { n: row.rooms })}</span>
                  </div>
                  {row.cells.map(({ cur, prev, month }) => {
                    const view = cellView(cur, prev, month, cuts, row.name);
                    return (
                      <button
                        aria-label={`${row.name} ${monthLong(month)}`}
                        className={view.className}
                        disabled={view.className.endsWith("na")}
                        key={month}
                        onClick={() => setPick({ month, property: row.name })}
                        style={view.style}
                        type="button"
                      >
                        <span className="t">{view.text}</span>
                        <span className={`s ${view.subClass ?? ""}`}>{view.sub}</span>
                      </button>
                    );
                  })}
                  <div className="orv__sm">
                    <span className="v">{total.v}</span>
                    <span className={`orv__d ${total.tone}`}>{total.d}</span>
                  </div>
                </RowGroup>
              );
            })}
            <div className="orv__trow" />
            <div className={`orv__rl tot${pick.property === null ? " sel" : ""}`}>
              <span className="n">{copy.totalLabel}</span>
              <span className="s">{fill(copy.propertyCount, { n: inNames.length })}</span>
            </div>
            {totalCells.map(({ cur, prev, month }) => {
              const view = cellView(cur, prev, month, quintileCuts(pastValues(totalCells)), null);
              return (
                <button
                  aria-label={`${copy.totalLabel} ${monthLong(month)}`}
                  className={view.className}
                  disabled={view.className.endsWith("na")}
                  key={month}
                  onClick={() => setPick({ month, property: null })}
                  style={view.style}
                  type="button"
                >
                  <span className="t">{view.text}</span>
                  <span className={`s ${view.subClass ?? ""}`}>{view.sub}</span>
                </button>
              );
            })}
            {(() => {
              const total = sum12(totalCells);
              return (
                <div className="orv__sm">
                  <span className="v">{total.v}</span>
                  <span className={`orv__d ${total.tone}`}>{total.d}</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="orv__mfoot">
          <div className="orv__lgd">
            {(lens === "value" ? VALUE_BG : YOY_BG).map((bg, index) => (
              <span key={bg} style={{ background: bg, color: lens === "value" ? undefined : YOY_FG[index] }}>
                {lens === "value"
                  ? [copy.legendLow, "", copy.legendMid, "", copy.legendHigh][index]
                  : ["−15%↓", "−5%", "±5%", "+5%", "+15%↑"][index]}
              </span>
            ))}
          </div>
          <span className="orv__unit">{lens === "yoy" ? copy.legendYoy : perRow ? copy.legendRow : copy.legendAll}</span>
          <span className="orv__grow" />
          <span className="orv__lg"><i className="dash" />{copy.legendBookedCell}</span>
          <span className="orv__lg"><i className="na" />{copy.legendNotOpen}</span>
        </div>
      </section>

      <aside className="orv__side">
        <section className="orv__card">
          <div className="orv__ph">
            <div className="orv__crumb">
              {(pick.property ?? copy.totalLabel) + " · " + monthLong(pick.month)}
              {!isPast(pick.month) && ` · ${copy.detailBooked}`}
            </div>
            <div className="orv__big">
              <span className="num">{yen(pickCur.revenue)}</span>
              <span className={`orv__d ${tone(pickDelta)}`}>
                {pickPrev.revenue > 0 ? fill(copy.lastYearValue, { v: deltaText(pickDelta) }) : copy.noLastYear}
              </span>
            </div>
            <div className="orv__muted">
              {fill(copy.detailSold, {
                a: pickCur.occupiedNights.toLocaleString(),
                b: pickCur.availableNights.toLocaleString(),
                c: yen(pickCur.commission),
              })}
            </div>
          </div>
          <div className="orv__kvg">
            <div>
              <span className="l">{copy.kpiOccupancy}</span>
              <span className="v">
                {pickCur.availableNights > 0 ? pct(pickCur.occupancyPct) : "—"}
                {pickPrev.availableNights > 0 && pickCur.availableNights > 0 && (
                  <span className={`orv__d ${tone(pickCur.occupancyPct - pickPrev.occupancyPct)}`}>
                    {pointText(pickCur.occupancyPct, pickPrev.occupancyPct)}
                  </span>
                )}
              </span>
            </div>
            <div>
              <span className="l">{copy.colAdr}</span>
              <span className="v">
                {pickCur.occupiedNights > 0 ? yen(pickCur.adr) : "—"}
                {pickPrev.occupiedNights > 0 && pickCur.occupiedNights > 0 && (
                  <span className={`orv__d ${tone(changePct(pickCur.adr, pickPrev.adr))}`}>{deltaText(changePct(pickCur.adr, pickPrev.adr))}</span>
                )}
              </span>
            </div>
            <div>
              <span className="l">{copy.colRevpar}</span>
              <span className="v">{pickCur.availableNights > 0 ? yen(pickCur.revpar) : "—"}</span>
            </div>
            <div>
              <span className="l">{copy.colNet}</span>
              <span className="v">{yen(pickCur.net)}</span>
            </div>
          </div>
          <div className="orv__pad">
            <span className="orv__l">{copy.colChannels}</span>
            <div className="orv__stack">
              {pickChannels.map(([key, v]) => (
                <i key={key} style={{ background: CHANNEL_COLOR[key], width: `${(v / Math.max(1, pickCur.revenue)) * 100}%` }} />
              ))}
            </div>
            <span className="orv__muted">
              {pickChannels.map(([, v, name]) => `${name} ${((v / Math.max(1, pickCur.revenue)) * 100).toFixed(0)}%`).join(" · ")}
            </span>
          </div>
          {pickProperty ? (
            pickRooms.length > 0 && (
              <div className="orv__pad orv__rooms">
                <span className="orv__l">{copy.detailRooms}</span>
                {pickRooms.map((room) => (
                  <div className="orv__rr" key={room.label}>
                    <span className="n">{room.label}</span>
                    <span className="bar">
                      <i
                        style={{
                          background: room.m.occupancyPct < 85 ? "hsl(38 70% 52%)" : "hsl(146 40% 42%)",
                          width: `${Math.min(100, room.m.occupancyPct)}%`,
                        }}
                      />
                    </span>
                    <span className="num">{man(room.m.revenue)}</span>
                    <span className="num faint">{room.m.occupancyPct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="orv__pad orv__note">{copy.detailTotalNote}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
