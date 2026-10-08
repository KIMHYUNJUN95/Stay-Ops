"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { exportOpsCompareReport, exportOpsCompareWorkbook, type OpsCompareExportPayload } from "@/app/admin/ops/revenue/compare/actions";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { AdminExportButtons } from "@/components/admin/shared/admin-export-buttons";
import { AdminMonthPicker } from "@/components/admin/shared/admin-month-picker";
import type { Dictionary } from "@/lib/i18n";
import {
  REVENUE_MODES,
  defaultRange,
  fiscalPeriodNumber,
  lastDayOfMonth,
  metricsOf,
  previousYearRange,
  shiftRange,
  sumMetrics,
  type RevenueMetrics,
  type RevenueMode,
  type RevenueRange,
} from "@/lib/ops-revenue";
import {
  bridgeScale,
  buildBridge,
  changePctOrNull,
  findNewRooms,
  groupProperties,
  growthDrivers,
  newRoomShare,
  niceUnit,
  topMover,
  totalOf,
  type BridgeStep,
} from "@/lib/ops-revenue-compare";
import type { OpsRevenueCompareData, OpsRevenueComparePeriod } from "@/lib/ops-revenue-server";
import "./ops-revenue.css";
import "./ops-revenue-compare.css";

/**
 * 매출 비교(A vs B) — 시안 「매출 비교」 1번 v4(아이보리 · 계기판, 2026-10-08 사용자 「이대로 구현」).
 *
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「매출 비교」
 *
 * 숫자는 매출 화면과 같은 칸(서버 `getOpsRevenueCompareData`)이고, 합계에 넣을 건물 · B → A 차이 분해는 여기서
 * (`ops-revenue-compare.ts`, 순수). 두 기간 · 건물 선택은 주소에 남는다 — 링크로 같은 비교를 공유한다.
 */
type Copy = Dictionary["opsRevenueCompare"];
type RevenueCopy = Dictionary["opsRevenue"];
type SharedCopy = Dictionary["admin"]["shared"];
type Metric = "revenue" | "occupancy" | "adr" | "revpar";

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

export function compareHref(a: OpsRevenueComparePeriod, b: OpsRevenueComparePeriod, excluded: readonly string[]): string {
  const query = new URLSearchParams({ af: a.range.from, am: a.mode, at: a.range.to, bf: b.range.from, bm: b.mode, bt: b.range.to });
  for (const name of excluded) query.append("ex", name);
  return `/admin/ops/revenue/compare?${query.toString()}`;
}

/** 모드를 바꿀 때 — 지금 기간의 끝(오늘보다 뒤면 오늘)이 든 그 모드의 기간. */
function rangeForMode(mode: RevenueMode, range: RevenueRange, today: string): RevenueRange {
  if (mode === "custom") return range;
  const base = range.to > today && range.from <= today ? today : range.to;
  if (mode === "month") return { from: `${base.slice(0, 7)}-01`, to: lastDayOfMonth(base.slice(0, 7)) };
  return defaultRange(mode, base);
}

export function OpsRevenueCompareConsole({
  data,
  copy,
  rcopy,
  shared,
  localeTag,
  initialExcluded,
}: {
  data: OpsRevenueCompareData;
  copy: Copy;
  rcopy: RevenueCopy;
  shared: SharedCopy;
  localeTag: string;
  initialExcluded: string[] | null;
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [included, setIncluded] = useState<Set<string>>(() => {
    const out = initialExcluded ? new Set(initialExcluded) : new Set(data.properties.filter((p) => p.defaultExcluded).map((p) => p.name));
    return new Set(data.properties.filter((p) => !out.has(p.name)).map((p) => p.name));
  });
  const [metric, setMetric] = useState<Metric>("revenue");
  const [toast, setToast] = useState<string | null>(null);
  const excluded = data.properties.filter((p) => !included.has(p.name)).map((p) => p.name);

  // 건물 선택도 주소에 — 링크를 복사하면 같은 비교가 열린다.
  const excludedKey = excluded.join("|");
  useEffect(() => {
    window.history.replaceState(window.history.state, "", compareHref(data.a, data.b, excludedKey ? excludedKey.split("|") : []));
  }, [data.a, data.b, excludedKey]);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 2000);
  };
  const go = (a: OpsRevenueComparePeriod, b: OpsRevenueComparePeriod) => startNav(() => router.push(compareHref(a, b, excluded)));

  // ── 글자 모양 ──
  const yen = (v: number) => `¥${Math.round(v).toLocaleString(localeTag)}`;
  const signedYen = (v: number) => `${v >= 0 ? "+" : "−"}${yen(Math.abs(v))}`;
  const n = (v: number) => Math.round(v).toLocaleString(localeTag);
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const signedPct = (v: number | null) => (v === null ? rcopy.newLabel : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`);
  const signedPoint = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}${rcopy.pointSuffix}`;
  const tone = (v: number | null) => (v === null ? "z" : v > 0.05 ? "up" : v < -0.05 ? "dn" : "z");
  const dayLabel = (date: string, withYear: boolean) =>
    new Intl.DateTimeFormat(localeTag, { day: "numeric", month: "short", timeZone: "UTC", ...(withYear ? { year: "numeric" } : {}) }).format(
      new Date(`${date}T00:00:00Z`),
    );
  const periodLabel = ({ mode, range }: OpsRevenueComparePeriod) => {
    if (mode === "month") {
      return new Intl.DateTimeFormat(localeTag, { month: "long", timeZone: "UTC", year: "numeric" }).format(new Date(`${range.from}T00:00:00Z`));
    }
    if (mode === "fiscal") {
      return fill(rcopy.fiscalLabel, {
        from: range.from.slice(0, 7).replace("-", "."),
        n: fiscalPeriodNumber(Number(range.from.slice(0, 4))),
        to: range.to.slice(0, 7).replace("-", "."),
      });
    }
    if (mode === "year") return range.from.slice(0, 4);
    return `${dayLabel(range.from, true)} – ${dayLabel(range.to, range.from.slice(0, 4) !== range.to.slice(0, 4))}`;
  };
  const aLabel = periodLabel(data.a);
  const bLabel = periodLabel(data.b);

  // ── 숫자 ──
  const inNames = data.properties.filter((p) => included.has(p.name)).map((p) => p.name);
  const groups = groupProperties(inNames, data.aCells, data.bCells);
  const aTot = totalOf(inNames, data.aCells);
  const bTot = totalOf(inNames, data.bCells);
  const delta = aTot.revenue - bTot.revenue;
  const growth = changePctOrNull(aTot.revenue, bTot.revenue);
  // 기존 건물의 새 객실(첫 판매일이 B 뒤) — 건물 숫자는 그대로, 차이 분해에서만 몫을 떼어 낸다(2026-10-08).
  const newRooms = findNewRooms(groups.existing, data.rooms, data.roomFirstSale, data.b.range.to, data.a.range.to);
  const roomShare = newRoomShare(newRooms, data.aRoomCells, data.bRoomCells);
  const drivers = growthDrivers(groups, data.aCells, data.bCells, roomShare);
  const aEx = totalOf(groups.existing, data.aCells);
  const bEx = totalOf(groups.existing, data.bCells);
  const exGrowth = changePctOrNull(aEx.revenue, bEx.revenue);
  const freshSum = totalOf(groups.fresh, data.aCells).revenue;
  const closedSum = totalOf(groups.closed, data.bCells).revenue;
  const mixChanged = groups.fresh.length > 0 || groups.closed.length > 0;
  const sameRange = data.a.range.from === data.b.range.from && data.a.range.to === data.b.range.to;
  // 단가 · 가동률 변화는 **같은 방들끼리**(새 객실 뺀 것) — 기여 막대와 같은 기준.
  const same = { a: drivers.existingA, b: drivers.existingB };
  const exAdr = changePctOrNull(same.a.adr, same.b.adr);
  const exOcc = same.a.availableNights > 0 && same.b.availableNights > 0 ? same.a.occupancyPct - same.b.occupancyPct : null;

  const exportPayload = (): OpsCompareExportPayload => {
    const side = (m: RevenueMetrics) => ({ available: m.availableNights, occupied: m.occupiedNights, revenue: m.revenue });
    return {
      aLabel,
      bLabel,
      rows: inNames
        .map((name) => ({ a: side(metricsOf(data.aCells[name] ?? sumMetrics([]))), b: side(metricsOf(data.bCells[name] ?? sumMetrics([]))), name }))
        .filter((row) => row.a.revenue !== 0 || row.b.revenue !== 0),
      total: { a: side(aTot), b: side(bTot) },
    };
  };

  return (
    <div className={`orv orc${navPending ? " is-pending" : ""}`}>
      <div className="orc__tabs" role="tablist">
        <Link href="/admin/ops/revenue">{rcopy.tabReport}</Link>
        <Link href="/admin/ops/revenue?tab=matrix">{rcopy.tabMatrix}</Link>
        <span aria-current="page" className="on">{rcopy.tabCompare}</span>
      </div>

      <header className="orc__head">
        <div className="orc__headl">
          <div className="orc__eyebrow">
            <span className="live"><i />{copy.live}</span>
            <span>{copy.eyebrow}</span>
          </div>
          <h1 className="orc__h1">
            <span className="t">{fill(copy.headlineVs, { a: aLabel, b: bLabel })}</span>{" "}
            <span className={`num ${tone(growth)}`}>{signedPct(growth)}</span>
            {mixChanged && groups.existing.length > 0 && (
              <>
                <span className="t">, {copy.headlineExisting}</span> <span className={`num ${tone(exGrowth)}`}>{signedPct(exGrowth)}</span>
              </>
            )}
          </h1>
          {sameRange && <span className="orc__warn">{copy.sameRange}</span>}
        </div>
        <div className="orc__actions">
          <button
            className="orc__pill"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href).then(() => flash(copy.copied));
            }}
            type="button"
          >
            {copy.copyLink}
          </button>
          <AdminExportButtons
            disabled={aTot.revenue === 0 && bTot.revenue === 0}
            labels={shared}
            onExportPdf={() => exportOpsCompareReport(exportPayload())}
            onExportXls={() => exportOpsCompareWorkbook(exportPayload())}
            onToast={flash}
          />
        </div>
      </header>

      <section className="orc__builder">
        <Slot
          copy={copy}
          label={copy.slotA}
          localeTag={localeTag}
          onChange={(next) => go(next, data.b)}
          period={data.a}
          periodLabel={periodLabel}
          rcopy={rcopy}
          shared={shared}
          side="a"
          today={data.today}
        />
        <span className="orc__vs">{copy.vs}</span>
        <Slot
          copy={copy}
          label={copy.slotB}
          localeTag={localeTag}
          onChange={(next) => go(data.a, next)}
          period={data.b}
          periodLabel={periodLabel}
          rcopy={rcopy}
          shared={shared}
          side="b"
          today={data.today}
        />
        <div className="orc__quick">
          <button className="orc__pill is-primary" onClick={() => go(data.a, { mode: data.a.mode, range: previousYearRange(data.a.range) })} type="button">
            ⟲ {copy.quickLastYear}
          </button>
          <button className="orc__pill" onClick={() => go(data.a, { mode: data.a.mode, range: shiftRange(data.a.mode, data.a.range, -1) })} type="button">
            {copy.quickPrev}
          </button>
        </div>
      </section>

      <div className="orv__chips">
        <span className="orv__tag">{rcopy.includeLabel}</span>
        {data.properties.map((p) => (
          <button
            aria-pressed={included.has(p.name)}
            className={`orv__chip${included.has(p.name) ? " on" : ""}`}
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

      {aTot.revenue === 0 && bTot.revenue === 0 ? (
        <div className="orv__empty">{copy.empty}</div>
      ) : (
        <>
          <section className="orc__hero">
            <TotalPanel
              aTotal={aTot.revenue}
              bLabel={bLabel}
              bTotal={bTot.revenue}
              closedSum={closedSum}
              copy={copy}
              delta={delta}
              existingCount={groups.existing.length}
              existingDelta={same.a.revenue - same.b.revenue}
              newRoomsDelta={roomShare ? roomShare.a.revenue - roomShare.b.revenue : 0}
              freshSum={freshSum}
              propertyCount={inNames.length}
              signedYen={signedYen}
              yen={yen}
            />
            <GrowthPanel
              aEx={same.a}
              bEx={same.b}
              copy={copy}
              drivers={drivers}
              newRoomLabels={roomShare?.labels ?? []}
              freshNames={groups.fresh}
              closedNames={groups.closed}
              growth={growth}
              n={n}
              signedPoint={signedPoint}
              signedYen={signedYen}
              yen={yen}
              insights={[
                ...(groups.fresh.length > 0
                  ? [fill(copy.insNew, { d: signedYen(delta), n: yen(freshSum), names: groups.fresh.join(" · ") })]
                  : []),
                ...(roomShare && roomShare.a.revenue - roomShare.b.revenue !== 0
                  ? [fill(copy.insNewRooms, { names: roomShare.labels.join(" · "), v: signedYen(roomShare.a.revenue - roomShare.b.revenue) })]
                  : []),
                ...(groups.existing.length > 0 && (mixChanged || roomShare)
                  ? [
                      fill(copy.insExisting, {
                        adr: signedPct(exAdr),
                        n: groups.existing.length,
                        occ: exOcc === null ? "—" : signedPoint(exOcc),
                      }),
                    ]
                  : []),
                ...(() => {
                  const mover = topMover(groups.existing, data.aCells, data.bCells);
                  if (!mover) return [];
                  return [fill(mover.delta > 0 ? copy.insTopUp : copy.insTopDown, { d: signedPct(mover.pct), name: mover.name, v: signedYen(mover.delta) })];
                })(),
                ...(!mixChanged ? [copy.insSame] : []),
              ].slice(0, 3)}
              signedPct={signedPct}
              tone={tone}
            />
          </section>

          <section className="orc__kpis">
            <Kpi
              a={aTot.availableNights > 0 ? pct(aTot.occupancyPct) : "—"}
              aRatio={aTot.occupancyPct}
              b={bTot.availableNights > 0 ? pct(bTot.occupancyPct) : "—"}
              bRatio={bTot.occupancyPct}
              code="OCC"
              delta={aTot.availableNights > 0 && bTot.availableNights > 0 ? signedPoint(aTot.occupancyPct - bTot.occupancyPct) : rcopy.newLabel}
              label={rcopy.kpiOccupancy}
              note={fill(copy.kpiOccNote, { a: n(aTot.occupiedNights), b: n(aTot.availableNights) })}
              tone={tone(aTot.occupancyPct - bTot.occupancyPct)}
            />
            <Kpi
              a={n(aTot.occupiedNights)}
              aRatio={aTot.occupiedNights}
              b={n(bTot.occupiedNights)}
              bRatio={bTot.occupiedNights}
              code="ROOM NIGHTS"
              delta={signedPct(changePctOrNull(aTot.occupiedNights, bTot.occupiedNights))}
              label={copy.kpiNights}
              note={fill(copy.kpiNightsNote, { a: n(aTot.availableNights), b: n(bTot.availableNights) })}
              tone={tone(changePctOrNull(aTot.occupiedNights, bTot.occupiedNights))}
            />
            <Kpi
              a={aTot.occupiedNights > 0 ? yen(aTot.adr) : "—"}
              aRatio={aTot.adr}
              b={bTot.occupiedNights > 0 ? yen(bTot.adr) : "—"}
              bRatio={bTot.adr}
              code="ADR"
              delta={signedPct(changePctOrNull(aTot.adr, bTot.adr))}
              label={rcopy.kpiAdr}
              note={copy.kpiAdrNote}
              tone={tone(changePctOrNull(aTot.adr, bTot.adr))}
            />
            <Kpi
              a={aTot.availableNights > 0 ? yen(aTot.revpar) : "—"}
              aRatio={aTot.revpar}
              b={bTot.availableNights > 0 ? yen(bTot.revpar) : "—"}
              bRatio={bTot.revpar}
              code="RevPAR"
              delta={signedPct(changePctOrNull(aTot.revpar, bTot.revpar))}
              label={rcopy.kpiRevpar}
              note={copy.kpiRevparNote}
              tone={tone(changePctOrNull(aTot.revpar, bTot.revpar))}
            />
          </section>

          <Bridge
            aLabel={aLabel}
            bLabel={bLabel}
            bTotal={bTot.revenue}
            copy={copy}
            exAdr={exAdr}
            exOcc={exOcc}
            groups={groups}
            signedPct={signedPct}
            signedPoint={signedPoint}
            signedYen={signedYen}
            steps={buildBridge(groups, data.aCells, data.bCells, 3, roomShare)}
            yen={yen}
            aTotal={aTot.revenue}
          />

          <Duel
            aCells={data.aCells}
            aLabel={aLabel}
            bCells={data.bCells}
            bLabel={bLabel}
            copy={copy}
            metric={metric}
            names={inNames}
            pct={pct}
            rcopy={rcopy}
            setMetric={setMetric}
            signedPct={signedPct}
            signedPoint={signedPoint}
            yen={yen}
          />
        </>
      )}

      <p className="orc__basis">{copy.basisNote}</p>
      {toast && <div className="orv__toast" role="status">{toast}</div>}
    </div>
  );
}

// ── 기간 고르기 칸(A · B) ─────────────────────────────────────────────────

function Slot({
  side,
  label,
  period,
  onChange,
  today,
  copy,
  rcopy,
  shared,
  localeTag,
  periodLabel,
}: {
  side: "a" | "b";
  label: string;
  period: OpsRevenueComparePeriod;
  onChange: (next: OpsRevenueComparePeriod) => void;
  today: string;
  copy: Copy;
  rcopy: RevenueCopy;
  shared: SharedCopy;
  localeTag: string;
  periodLabel: (period: OpsRevenueComparePeriod) => string;
}) {
  const modeLabel: Record<RevenueMode, string> = {
    custom: rcopy.modeCustom,
    fiscal: rcopy.modeFiscal,
    month: rcopy.modeMonth,
    week: rcopy.modeWeek,
    year: rcopy.modeYear,
  };
  return (
    <div className={`orc__slot is-${side}`}>
      <div className="orc__slothd">
        <span className="badge">{side.toUpperCase()}</span>
        <span className="lbl">{label}</span>
        <span className="sub">{copy.sameProperties}</span>
      </div>
      <div className="orc__slotrow">
        <div className="orv__seg" role="tablist">
          {REVENUE_MODES.map((mode) => (
            <button
              aria-selected={mode === period.mode}
              className={mode === period.mode ? "on" : ""}
              key={mode}
              onClick={() => mode !== period.mode && onChange({ mode, range: rangeForMode(mode, period.range, today) })}
              role="tab"
              type="button"
            >
              {modeLabel[mode]}
            </button>
          ))}
        </div>
        {period.mode === "month" ? (
          <AdminMonthPicker
            basePath="/admin/ops/revenue/compare"
            labels={{
              nextMonth: shared.dateNextMonth,
              nextYear: shared.dateNextYear,
              open: shared.dateSelect,
              prevMonth: shared.datePrevMonth,
              prevYear: shared.datePrevYear,
              thisMonth: shared.dateThisMonth,
            }}
            localeTag={localeTag}
            onSelect={(ym) => onChange({ mode: "month", range: { from: `${ym}-01`, to: lastDayOfMonth(ym) } })}
            ym={period.range.from.slice(0, 7)}
          />
        ) : period.mode === "custom" ? (
          <AdminDateRangePicker
            ariaLabel={shared.pickRange}
            from={period.range.from}
            labels={{
              apply: shared.dateApply,
              nextMonth: shared.dateNextMonth,
              pickMonth: shared.datePickMonth,
              pickYear: shared.datePickYear,
              prevMonth: shared.datePrevMonth,
              reset: shared.dateReset,
              thisMonth: shared.dateThisMonth,
              typeEnd: shared.dateTypeEnd,
              typeStart: shared.dateTypeStart,
            }}
            localeTag={localeTag}
            onChange={(from, to) => {
              if (from && to) onChange({ mode: "custom", range: { from, to } });
            }}
            to={period.range.to}
          />
        ) : (
          <div className="orv__pnav">
            <button aria-label={rcopy.prev} className="orv__arrow" onClick={() => onChange({ ...period, range: shiftRange(period.mode, period.range, -1) })} type="button">
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="orv__plabel">{periodLabel(period)}</span>
            <button aria-label={rcopy.next} className="orv__arrow" onClick={() => onChange({ ...period, range: shiftRange(period.mode, period.range, 1) })} type="button">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 01 총매출 ─────────────────────────────────────────────────────────────

function TotalPanel({
  copy,
  aTotal,
  bTotal,
  bLabel,
  delta,
  freshSum,
  closedSum,
  existingDelta,
  newRoomsDelta,
  existingCount,
  propertyCount,
  yen,
  signedYen,
}: {
  copy: Copy;
  aTotal: number;
  bTotal: number;
  bLabel: string;
  delta: number;
  freshSum: number;
  closedSum: number;
  existingDelta: number;
  newRoomsDelta: number;
  existingCount: number;
  propertyCount: number;
  yen: (v: number) => string;
  signedYen: (v: number) => string;
}) {
  const max = Math.max(aTotal, bTotal, 1);
  const unit = niceUnit(max / 6);
  const top = Math.ceil((max * 1.04) / unit) * unit;
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  const labels = Array.from({ length: Math.round(top / unit) + 1 }, (_, i) => i * unit).filter((_, i, all) => all.length <= 8 || i % 2 === 0);
  return (
    <div className="orc__total">
      <i className="cn tl" /><i className="cn tr" /><i className="cn bl" /><i className="cn br" />
      <div className="orc__code"><span>{copy.secTotal}</span><span>{fill(copy.propertiesCount, { n: propertyCount })}</span></div>
      <div className="orc__big">
        <span className="v">{yen(aTotal)}</span>
        <span className={`d ${delta >= 0 ? "up" : "dn"}`}>{delta >= 0 ? "▲" : "▼"} {signedYen(delta)}</span>
      </div>
      <div className="orc__ruler">
        <span className="mk is-b" style={{ left: at(bTotal) }}>B {yen(bTotal)}</span>
        <span className="mk is-a" style={{ left: at(aTotal) }}>A</span>
        <div className="track" style={{ "--minor": `${(unit / 5 / top) * 100}%`, "--major": `${(unit / top) * 100}%` } as CSSProperties}>
          <div className="fill" style={{ width: at(aTotal) }} />
        </div>
        <div className="labels">
          {labels.map((v, i) => (
            <span key={v} style={{ left: at(v), transform: i === 0 ? "none" : v >= top ? "translateX(-100%)" : "translateX(-50%)" }}>
              {v === 0 ? "0" : yen(v)}
            </span>
          ))}
        </div>
      </div>
      <div className="orc__split">
        <div><span className="k">B · {bLabel}</span><span className="v b">{yen(bTotal)}</span></div>
        {freshSum !== 0 && <div><span className="k">{copy.splitNew}</span><span className="v up">{signedYen(freshSum)}</span></div>}
        {existingCount > 0 && (
          <div><span className="k">{fill(copy.splitExisting, { n: existingCount })}</span><span className={`v ${existingDelta >= 0 ? "up" : "dn"}`}>{signedYen(existingDelta)}</span></div>
        )}
        {newRoomsDelta !== 0 && <div><span className="k">{copy.splitNewRooms}</span><span className={`v ${newRoomsDelta >= 0 ? "up" : "dn"}`}>{signedYen(newRoomsDelta)}</span></div>}
        {closedSum !== 0 && <div><span className="k">{copy.splitClosed}</span><span className="v dn">{signedYen(-closedSum)}</span></div>}
      </div>
    </div>
  );
}

// ── 02 증감 — 기여 막대 + 요점 (2026-10-08, 다이얼 대신) ──────────────────

function GrowthPanel({
  copy,
  growth,
  insights,
  signedPct,
  tone,
  drivers,
  aEx,
  bEx,
  freshNames,
  closedNames,
  newRoomLabels,
  n,
  yen,
  signedYen,
  signedPoint,
}: {
  copy: Copy;
  growth: number | null;
  insights: string[];
  signedPct: (v: number | null) => string;
  tone: (v: number | null) => string;
  drivers: ReturnType<typeof growthDrivers>;
  aEx: RevenueMetrics;
  bEx: RevenueMetrics;
  freshNames: string[];
  closedNames: string[];
  newRoomLabels: string[];
  n: (v: number) => string;
  yen: (v: number) => string;
  signedYen: (v: number) => string;
  signedPoint: (v: number) => string;
}) {
  const max = Math.max(1e-9, Math.abs(drivers.totalPoints ?? 0), ...drivers.drivers.map((d) => Math.abs(d.points ?? 0)));
  const label = (key: (typeof drivers.drivers)[number]["key"]) =>
    ({
      closed: { name: copy.driverClosed, sub: closedNames.join(" · ") },
      fresh: { name: copy.driverFresh, sub: freshNames.join(" · ") },
      newRooms: { name: copy.driverNewRooms, sub: newRoomLabels.join(" · ") },
      price: { name: copy.driverPrice, sub: fill(copy.driverPriceSub, { a: yen(aEx.adr), b: yen(bEx.adr) }) },
      volume: { name: copy.driverVolume, sub: fill(copy.driverVolumeSub, { a: n(aEx.occupiedNights), b: n(bEx.occupiedNights) }) },
    })[key];
  const bar = (points: number | null) => {
    const w = points === null ? 0 : (Math.abs(points) / max) * 50;
    return points !== null && points < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` };
  };
  return (
    <div className="orc__growth">
      <div className="orc__code"><span>{copy.secGrowth}</span><span>B → A</span></div>
      <div className={`orc__growthv ${tone(growth)}`}>{signedPct(growth)}</div>
      <div className="orc__drivers">
        {drivers.drivers.map((d) => {
          const t = label(d.key);
          return (
            <div className="dr" key={d.key}>
              <div className="nm"><b>{t.name}</b><span>{t.sub}</span></div>
              <div className="tr"><i className={(d.points ?? 0) >= 0 ? "up" : "dn"} style={bar(d.points)} /><em /></div>
              <div className="vv">
                <span className={`p ${(d.points ?? 0) >= 0 ? "up" : "dn"}`}>{d.points === null ? "—" : signedPoint(d.points)}</span>
                <span className="y">{signedYen(d.value)}</span>
              </div>
            </div>
          );
        })}
        <div className="dr total">
          <div className="nm"><b>{copy.driverTotal}</b></div>
          <div className="tr"><i className={(drivers.totalPoints ?? 0) >= 0 ? "tot" : "dn"} style={bar(drivers.totalPoints)} /><em /></div>
          <div className="vv">
            <span className={`p ${tone(drivers.totalPoints)}`}>{signedPct(drivers.totalPoints)}</span>
            <span className="y">{signedYen(drivers.total)}</span>
          </div>
        </div>
      </div>
      <p className="orc__drnote">{copy.driverNote}</p>
      <ol className="orc__ins">
        {insights.map((text, index) => (
          <li key={index}>
            <span className="no">{String(index + 1).padStart(2, "0")}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── 지표 카드 ─────────────────────────────────────────────────────────────

function Kpi({
  code,
  label,
  a,
  b,
  aRatio,
  bRatio,
  delta,
  tone,
  note,
}: {
  code: string;
  label: string;
  a: string;
  b: string;
  aRatio: number;
  bRatio: number;
  delta: string;
  tone: string;
  note: string;
}) {
  const max = Math.max(aRatio, bRatio, 1e-9);
  return (
    <div className="orc__kpi">
      <i className="cn tr" />
      <span className="code">{code}</span>
      <div className="row">
        <span className="v">{a}</span>
        <span className={`dl ${tone}`}>{delta}</span>
      </div>
      <div className="bars">
        <span className="bar"><b className="tag a">A</b><span className="tr"><i className="a" style={{ width: `${(aRatio / max) * 100}%` }} /></span></span>
        <span className="bar"><b className="tag b">B</b><span className="tr"><i className="b" style={{ width: `${(bRatio / max) * 100}%` }} /></span></span>
      </div>
      <div className="foot"><span className="l">{label}</span><span className="bv">B {b}</span></div>
      <span className="note">{note}</span>
    </div>
  );
}

// ── 03 차이 분해(브리지) ──────────────────────────────────────────────────

function Bridge({
  steps,
  groups,
  copy,
  aLabel,
  bLabel,
  aTotal,
  bTotal,
  exAdr,
  exOcc,
  yen,
  signedYen,
  signedPct,
  signedPoint,
}: {
  steps: BridgeStep[];
  groups: ReturnType<typeof groupProperties>;
  copy: Copy;
  aLabel: string;
  bLabel: string;
  aTotal: number;
  bTotal: number;
  exAdr: number | null;
  exOcc: number | null;
  yen: (v: number) => string;
  signedYen: (v: number) => string;
  signedPct: (v: number | null) => string;
  signedPoint: (v: number) => string;
}) {
  const scale = bridgeScale(steps);
  const H = 300;
  const y = (v: number) => Math.max(0, ((v - scale.base) / (scale.top - scale.base)) * H);
  const text = (step: BridgeStep) => {
    switch (step.role) {
      case "totalB":
        return { label: `B · ${bLabel}`, sub: fill(copy.stepTotalSub, { n: groups.existing.length + groups.closed.length }) };
      case "totalA":
        return { label: `A · ${aLabel}`, sub: fill(copy.stepTotalSub, { n: groups.existing.length + groups.fresh.length }) };
      case "existing":
        return {
          label: fill(copy.stepExisting, { n: groups.existing.length }),
          sub: fill(copy.stepExistingSub, { adr: signedPct(exAdr), occ: exOcc === null ? "—" : signedPoint(exOcc) }),
        };
      case "newRooms":
        return { label: fill(copy.stepNewRooms, { n: step.names.length }), sub: step.names.join(" · ") };
      case "fresh":
        return { label: step.names[0], sub: copy.stepFreshSub };
      case "freshOther":
        return { label: fill(copy.stepFreshOther, { n: step.names.length }), sub: step.names.join(" · ") };
      case "closed":
        return { label: copy.stepClosed, sub: step.names.join(" · ") || copy.stepClosedSub };
    }
  };
  const total = (step: BridgeStep) => step.kind === "A" || step.kind === "B";
  return (
    <section className="orc__card">
      <div className="orc__cardhd">
        <div><span className="orc__codeline">{copy.secBridge.split(" — ")[0]}</span><h2>{copy.secBridge.split(" — ")[1] ?? copy.secBridge}</h2></div>
        <span className="orc__hint">{fill(copy.bridgeHint, { a: yen(aTotal), b: yen(bTotal) })}</span>
      </div>
      <div className="orc__bridge" style={{ "--cols": steps.length } as CSSProperties}>
        <div className="axis">
          {scale.ticks.map((v) => (
            <span key={v} style={{ bottom: y(v) }}>{yen(v)}</span>
          ))}
        </div>
        <div className="plot">
          <div className="area">
            {scale.ticks.map((v, i) => (
              <div className={`gl${i === 0 ? " base" : ""}`} key={v} style={{ bottom: y(v) }} />
            ))}
            <div className="cols">
              {steps.map((step, index) => {
                const lo = total(step) ? scale.base : Math.min(step.from, step.to);
                const hi = Math.max(step.from, step.to);
                const value = total(step) ? yen(step.to) : signedYen(step.to - step.from);
                return (
                  <div className="col" key={`${step.role}-${index}`}>
                    {!total(step) && <div className="ghost" style={{ height: y(lo) }} />}
                    <div className={`bar is-${step.kind}`} style={{ bottom: y(lo), height: Math.max(5, y(hi) - y(lo)) }} />
                    {total(step) && scale.base > 0 && <div className="brk" />}
                    {index < steps.length - 1 && <div className="link" style={{ bottom: y(step.to) }} />}
                    <span className={`chip is-${step.kind}`} style={{ bottom: y(hi) + 10 }}>{value}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="labels">
            {steps.map((step, index) => {
              const t = text(step);
              const share = step.role === "totalB" ? copy.shareBase : fill(copy.share, { d: signedPct(changePctOrNull(bTotal + (step.kind === "A" ? step.to - bTotal : step.to - step.from), bTotal)) });
              return (
                <div className="lb" key={`${step.role}-${index}`}>
                  <i className={`dot is-${step.kind}`} />
                  <b>{t.label}</b>
                  <span className="sub">{t.sub}</span>
                  <span className={`share is-${step.kind}`}>{share}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="orc__legend">
        <span><i className="is-B" />{copy.legendB}</span>
        <span><i className="is-down" />{copy.legendDown}</span>
        <span><i className="is-up" />{copy.legendUp}</span>
        <span><i className="is-A" />{copy.legendA}</span>
        <span><i className="dash" />{copy.legendRunning}</span>
        <span className="note">{scale.base > 0 ? fill(copy.axisFrom, { v: yen(scale.base) }) : copy.axisZero}</span>
      </div>
    </section>
  );
}

// ── 04 건물별 맞대기 ──────────────────────────────────────────────────────

function Duel({
  names,
  aCells,
  bCells,
  aLabel,
  bLabel,
  metric,
  setMetric,
  copy,
  rcopy,
  yen,
  pct,
  signedPct,
  signedPoint,
}: {
  names: string[];
  aCells: OpsRevenueCompareData["aCells"];
  bCells: OpsRevenueCompareData["bCells"];
  aLabel: string;
  bLabel: string;
  metric: Metric;
  setMetric: (metric: Metric) => void;
  copy: Copy;
  rcopy: RevenueCopy;
  yen: (v: number) => string;
  pct: (v: number) => string;
  signedPct: (v: number | null) => string;
  signedPoint: (v: number) => string;
}) {
  const valueOf = (m: RevenueMetrics): number | null => {
    switch (metric) {
      case "revenue":
        return m.revenue !== 0 ? m.revenue : null;
      case "occupancy":
        return m.availableNights > 0 ? m.occupancyPct : null;
      case "adr":
        return m.occupiedNights > 0 ? m.adr : null;
      case "revpar":
        return m.availableNights > 0 ? m.revpar : null;
    }
  };
  const fmt = (v: number | null) => (v === null ? "—" : metric === "occupancy" ? pct(v) : yen(v));
  const rows = names
    .map((name) => {
      const a = metricsOf(aCells[name] ?? sumMetrics([]));
      const b = metricsOf(bCells[name] ?? sumMetrics([]));
      return { a: valueOf(a), b: valueOf(b), fresh: b.revenue === 0 && a.revenue !== 0, gone: a.revenue === 0 && b.revenue !== 0, name };
    })
    .filter((row) => row.a !== null || row.b !== null)
    .sort((x, y) => (y.a ?? -Infinity) - (x.a ?? -Infinity));
  const max = Math.max(1e-9, ...rows.flatMap((row) => [row.a ?? 0, row.b ?? 0]));
  const metrics: Array<[Metric, string]> = [
    ["revenue", rcopy.metricRevenue],
    ["occupancy", rcopy.metricOccupancy],
    ["adr", rcopy.metricAdr],
    ["revpar", rcopy.metricRevpar],
  ];
  return (
    <section className="orc__card">
      <div className="orc__cardhd">
        <div><span className="orc__codeline">{copy.secProperties.split(" — ")[0]}</span><h2>{copy.secProperties.split(" — ")[1] ?? copy.secProperties}</h2></div>
        <div className="orc__seg">
          {metrics.map(([key, label]) => (
            <button className={metric === key ? "on" : ""} key={key} onClick={() => setMetric(key)} type="button">
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="orc__duel">
        <div className="hd"><span>{copy.tableHead}</span><span className="r">A · {aLabel}</span><span className="c">Δ</span><span>B · {bLabel}</span></div>
        {rows.map((row, index) => {
          const d =
            row.a === null || row.b === null ? null : metric === "occupancy" ? row.a - row.b : changePctOrNull(row.a, row.b);
          return (
            <div className="row" key={row.name}>
              <div className="nm">
                <span className="no">{String(index + 1).padStart(2, "0")}</span>
                <b>{row.name}</b>
                {row.fresh && <span className="tag new">{copy.tagNew}</span>}
                {row.gone && <span className="tag gone">{copy.tagClosed}</span>}
              </div>
              <div className="sa">
                <span className="v">{fmt(row.a)}</span>
                <span className="tr"><i style={{ width: `${((row.a ?? 0) / max) * 100}%` }} /></span>
              </div>
              <span className={`dl ${d === null ? "z" : d > 0.05 ? "up" : d < -0.05 ? "dn" : "z"}`}>
                {d === null ? "—" : metric === "occupancy" ? signedPoint(d) : signedPct(d)}
              </span>
              <div className="sb">
                <span className="tr"><i style={{ width: `${((row.b ?? 0) / max) * 100}%` }} /></span>
                <span className="v">{fmt(row.b)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
