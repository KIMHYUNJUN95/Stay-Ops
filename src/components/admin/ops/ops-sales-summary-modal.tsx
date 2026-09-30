"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { BedDouble, ChevronRight, Info, ReceiptText, Tag, TrendingUp, Wallet, X } from "lucide-react";
import { loadOpsSalesSummary, type OpsSalesSummaryResult } from "@/app/admin/ops/calendar/actions";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import type { SalesChannel, SalesMetrics, SalesRoomRow } from "@/lib/ops-sales-summary";

/**
 * 판매 캘린더 「매출 요약」 모달 — **보고 있는 창 × 고른 건물**(2026-09-30).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「매출 요약」
 * 식: src/lib/ops-sales-summary.ts (저쪽 건물 캘린더 그대로 — 34번 문서)
 *
 * 옆 패널이 아니라 **가운데 큰 모달**이다 — KPI · 채널 · 건물(객실 펼침)을 한눈에 봐야 하고, 격자를 고치는
 * 동작이 아니라 격자를 덮어도 된다. 셸 동작(Esc · 스크롤 잠금 · 포커스 복귀 · 포커스 가둠)은 콘솔 공용
 * `useAdminPanelA11y`. `<body>` 로 포털하되 `.adm` 로 감싸 콘솔 토큰을 그대로 받는다.
 *
 * ## 빨리 열린다
 *
 * 버튼에 마우스를 올리거나 포커스하면 **미리 부른다**(`prefetchSalesSummary`). 결과는 격자가 받은 서버
 * 데이터(`rows` 배열) 단위로 기억한다 — 같은 화면에서 다시 열면 바로 뜨고, 라이브 신호·쓰기 반영으로
 * 서버 데이터가 새로 오면(= 새 배열) 기억이 저절로 버려진다.
 */

export type SalesSummaryCopy = {
  localeTag: string;
  rcClose: string;
  ssTitle: string;
  ssDays: string;
  ssAllProperties: string;
  ssLoading: string;
  ssError: string;
  ssErrForbidden: string;
  ssRetry: string;
  ssGross: string;
  ssGrossNote: string;
  ssCommission: string;
  ssCommissionNote: string;
  ssNet: string;
  ssOccupancy: string;
  ssOccupancyNote: string;
  ssAdr: string;
  ssAdrNote: string;
  ssRevpar: string;
  ssRevparNote: string;
  ssVacant: string;
  ssNightsUnit: string;
  ssVacantNote: string;
  ssVacantHint: string;
  ssFutureVacant: string;
  ssFutureNone: string;
  ssChannels: string;
  ssChannelCol: string;
  ssRevenueCol: string;
  ssCommissionCol: string;
  ssNetCol: string;
  ssNightsCol: string;
  ssArrivalsCol: string;
  ssDirect: string;
  ssOther: string;
  ssTotal: string;
  ssProperties: string;
  ssPropertyCol: string;
  ssRoomsCol: string;
  ssOccupancyCol: string;
  ssVacantCol: string;
  ssOffCatalogHint: string;
  ssZeroNote: string;
  ssBasisTitle: string;
  ssBasisRevenue: string;
  ssBasisStatus: string;
  ssBasisOccupancy: string;
  ssBasisCommission: string;
  ssBasisLegacy: string;
};

type Loaded = Extract<OpsSalesSummaryResult, { ok: true }>["summary"];
type State = { status: "loading" } | { status: "error"; forbidden: boolean } | { status: "ready"; summary: Loaded };

// ── 미리 부르기 · 기억 ──────────────────────────────────────────────────

type SalesArgs = { start: string; days: number; properties: readonly string[] };

/** 서버 데이터(격자 `rows` 배열) → 창·건물 키 → 진행 중이거나 끝난 요청. 배열이 바뀌면 통째로 버려진다. */
const salesCache = new WeakMap<object, Map<string, Promise<OpsSalesSummaryResult>>>();

function salesKey(args: SalesArgs): string {
  return `${args.start}|${args.days}|${args.properties.join("\u0001")}`;
}

/** 요청을 시작하거나(없으면) 이미 있는 것을 돌려준다. 실패한 결과는 기억하지 않는다. */
export function prefetchSalesSummary(scope: object, args: SalesArgs): Promise<OpsSalesSummaryResult> {
  let byKey = salesCache.get(scope);
  if (!byKey) {
    byKey = new Map();
    salesCache.set(scope, byKey);
  }
  const key = salesKey(args);
  const existing = byKey.get(key);
  if (existing) return existing;
  const request = loadOpsSalesSummary({ days: args.days, properties: [...args.properties], start: args.start }).then(
    (result) => {
      if (!result.ok) byKey.delete(key);
      return result;
    },
    (error: unknown) => {
      byKey.delete(key);
      throw error;
    },
  );
  byKey.set(key, request);
  return request;
}

// ── 표시 ────────────────────────────────────────────────────────────────

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type Fmt = {
  yen: (value: number) => string;
  count: (value: number) => string;
  pct: (value: number) => string;
  nights: (value: number) => string;
};

/** 가동률 등급 — 저쪽 포트폴리오 표와 같은 80 / 60 경계. 색만이 아니라 숫자가 늘 옆에 있다. */
function occLevel(value: number): "hi" | "mid" | "lo" {
  return value >= 80 ? "hi" : value >= 60 ? "mid" : "lo";
}

const CLOSE_MS = 150;

export function OpsSalesSummaryModal({
  copy,
  days,
  onClose,
  properties,
  scope,
  start,
}: {
  copy: SalesSummaryCopy;
  /** 보고 있는 창의 일수(30일 뷰 = 30, 월간 = 그 달 일수). */
  days: number;
  onClose: () => void;
  /** 고른 건물(탭 순서). 빈 목록 = 전체. */
  properties: string[];
  /** 기억 단위 — 격자가 받은 서버 데이터(`rows` 배열). 바뀌면 새로 부른다. */
  scope: object;
  /** 보고 있는 창의 첫날. */
  start: string;
}) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };
  const panelRef = useAdminPanelA11y<HTMLDivElement>(requestClose, { trapFocus: true });
  const titleId = useId();
  const basisId = useId();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [basisOpen, setBasisOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    // 새로 부르는 동안에도 **이전 숫자를 그대로 둔다**(라이브 새로고침) — 처음 열 때만 스켈레톤.
    prefetchSalesSummary(scope, { days, properties, start }).then(
      (result) => {
        if (!alive) return;
        setState(
          result.ok
            ? { status: "ready", summary: result.summary }
            : { forbidden: result.error === "forbidden", status: "error" },
        );
      },
      () => {
        if (alive) setState({ forbidden: false, status: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt, days, properties, scope, start]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  // ¥ 표기는 로캘과 무관하게 하나로(ko-KR · en-US 의 JPY 는 「JP¥」가 된다). 자릿수 구분만 로캘을 따른다.
  const numberFormat = new Intl.NumberFormat(copy.localeTag, { maximumFractionDigits: 0 });
  const fmt: Fmt = {
    count: (value) => numberFormat.format(value),
    nights: (value) => copy.ssNightsUnit.replace("{n}", numberFormat.format(value)),
    pct: (value) => `${value.toFixed(1)}%`,
    yen: (value) => {
      const rounded = Math.round(value);
      return `${rounded < 0 ? "−" : ""}¥${numberFormat.format(Math.abs(rounded))}`;
    },
  };

  const end = addDays(start, days - 1);
  const period = `${start} → ${end.slice(0, 4) === start.slice(0, 4) ? end.slice(5) : end}`;

  return createPortal(
    <div className={`adm opsss-root${closing ? " is-closing" : ""}`}>
      <div aria-hidden="true" className="opsss__scrim" onClick={requestClose} />
      <div aria-labelledby={titleId} aria-modal="true" className="opsss" ref={panelRef} role="dialog" tabIndex={-1}>
        <header className="opsss__head">
          <div className="opsss__headmain">
            <div className="opsss__titlerow">
              <h2 className="opsss__title" id={titleId}>
                {copy.ssTitle}
              </h2>
              <span className="opsss__range">{period}</span>
              <span className="opsss__days">{copy.ssDays.replace("{n}", String(days))}</span>
            </div>
            <div className="opsss__chips">
              {properties.length === 0 ? (
                <span className="opsss__chip all">{copy.ssAllProperties}</span>
              ) : (
                properties.map((name) => (
                  <span className="opsss__chip" key={name}>
                    {name}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="opsss__headtools">
            <button
              aria-controls={basisId}
              aria-expanded={basisOpen}
              className={`opsss__basisbtn${basisOpen ? " on" : ""}`}
              onClick={() => setBasisOpen((value) => !value)}
              type="button"
            >
              <Info aria-hidden="true" />
              {copy.ssBasisTitle}
            </button>
            <button aria-label={copy.rcClose} className="opsss__x" onClick={requestClose} type="button">
              <X aria-hidden="true" />
            </button>
          </div>
          {basisOpen && (
            <div className="opsss__basis" id={basisId} role="note">
              <ul>
                <li>{copy.ssBasisRevenue}</li>
                <li>{copy.ssBasisStatus}</li>
                <li>{copy.ssBasisOccupancy}</li>
                <li>{copy.ssBasisCommission}</li>
                {state.status === "ready" && state.summary.zeroPriceCount > 0 && (
                  <li>{copy.ssZeroNote.replace("{n}", fmt.count(state.summary.zeroPriceCount))}</li>
                )}
              </ul>
              <p>{copy.ssBasisLegacy}</p>
            </div>
          )}
        </header>

        <div className="opsss__body">
          {state.status === "loading" && <SummarySkeleton label={copy.ssLoading} />}
          {state.status === "error" && (
            <div className="opsss__state" role="alert">
              <p>{state.forbidden ? copy.ssErrForbidden : copy.ssError}</p>
              {!state.forbidden && (
                <button className="opsss__retry" onClick={retry} type="button">
                  {copy.ssRetry}
                </button>
              )}
            </div>
          )}
          {state.status === "ready" && <SummaryContent copy={copy} fmt={fmt} summary={state.summary} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 최종 배치와 같은 골격 — 뜨는 순간 자리가 바뀌지 않는다. */
function SummarySkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="opsss__top sk">
      <span className="opsss__sronly">{label}</span>
      <div className="opsss__left">
        <div className="opsss__flow sk">
          <span className="opsss__bone w30" />
          <span className="opsss__bone huge" />
          <span className="opsss__bone w60" />
        </div>
        <div className="opsss__tiles">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="opsss__tile sk" key={index}>
              <span className="opsss__bone w40" />
              <span className="opsss__bone big" />
              <span className="opsss__bone w60" />
            </div>
          ))}
        </div>
      </div>
      <div className="opsss__card sk">
        <span className="opsss__bone w30" />
        <span className="opsss__bone bar" />
        {Array.from({ length: 4 }, (_, index) => (
          <span className="opsss__bone row" key={index} />
        ))}
      </div>
      <div className="opsss__card sk wide">
        <span className="opsss__bone w30" />
        {Array.from({ length: 6 }, (_, index) => (
          <span className="opsss__bone row" key={index} />
        ))}
      </div>
    </div>
  );
}

/** 가동률 게이지 — 숫자를 원 안에 둔다. */
function Gauge({ value }: { value: number }) {
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className={`opsss__gauge ${occLevel(value)}`}>
      <svg aria-hidden="true" viewBox="0 0 64 64">
        <circle className="track" cx="32" cy="32" r={radius} />
        <circle
          className="fill"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="opsss__gaugev">{value.toFixed(1)}%</span>
    </span>
  );
}

function OccCell({ fmt, value }: { fmt: Fmt; value: number }) {
  return (
    <span className="opsss__occcell">
      <span aria-hidden="true" className={`opsss__minibar ${occLevel(value)}`}>
        <span style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      {fmt.pct(value)}
    </span>
  );
}

export function SummaryContent({
  copy,
  fmt,
  initialOpen,
  summary,
}: {
  copy: SalesSummaryCopy;
  fmt: Fmt;
  /** 처음부터 펼쳐 둘 건물. 없으면 건물이 하나일 때만 펼친다. */
  initialOpen?: readonly string[];
  summary: Loaded;
}) {
  const totals: SalesMetrics = summary.totals;
  const channelLabel = (channel: SalesChannel) =>
    channel === "airbnb" ? "Airbnb" : channel === "booking" ? "Booking.com" : channel === "direct" ? copy.ssDirect : copy.ssOther;
  // 「기타」는 값이 있을 때만 줄을 만든다(대개 0 — 2026-09 실측 0건).
  const channels = summary.byChannel.filter(
    (row) => row.channel !== "other" || row.revenue > 0 || row.arrivals > 0 || row.nights > 0,
  );
  const channelRevenue = channels.reduce((sum, row) => sum + row.revenue, 0);
  const share = (value: number) => (channelRevenue > 0 ? (value / channelRevenue) * 100 : 0);

  // 건물 한 곳만 보고 있으면 객실을 펼친 채로 연다 — 볼 것이 그것뿐이다.
  const [open, setOpen] = useState<Set<string>>(() =>
    initialOpen
      ? new Set(initialOpen)
      : summary.byProperty.length === 1
        ? new Set([summary.byProperty[0].propertyName])
        : new Set(),
  );
  const toggle = (name: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const cells = (row: SalesMetrics, offCatalog = false) => (
    <>
      <td className="c-occ" data-label={copy.ssOccupancyCol}>
        {offCatalog ? <span className="dim">–</span> : <OccCell fmt={fmt} value={row.occupancyPct} />}
      </td>
      <td className="c-num" data-label={copy.ssNightsCol}>
        {offCatalog ? "–" : fmt.count(row.occupiedNights)}
      </td>
      <td className="c-num dim" data-label={copy.ssVacantCol}>
        {offCatalog ? "–" : fmt.count(row.vacantNights)}
      </td>
      <td className="c-num" data-label="ADR">
        {fmt.yen(row.adr)}
      </td>
      <td className="c-num dim" data-label="RevPAR">
        {offCatalog ? "–" : fmt.yen(row.revpar)}
      </td>
      <td className="c-num strong" data-label={copy.ssRevenueCol}>
        {fmt.yen(row.revenue)}
      </td>
      <td className="c-num dim" data-label={copy.ssCommissionCol}>
        {fmt.yen(row.commission)}
      </td>
      <td className="c-num" data-label={copy.ssNetCol}>
        {fmt.yen(row.net)}
      </td>
    </>
  );

  const roomRow = (room: SalesRoomRow) => (
    <tr className="is-room" key={room.key}>
      <th className="c-name" scope="row">
        <span className="opsss__roomname" title={room.inCatalog ? room.label : `${room.label} — ${copy.ssOffCatalogHint}`}>
          {room.label}
          {!room.inCatalog && <span className="opsss__offcat">*</span>}
        </span>
      </th>
      <td className="c-rooms" data-label={copy.ssRoomsCol} />
      {cells(room, !room.inCatalog)}
    </tr>
  );

  return (
    <>
      <div className="opsss__top">
        <div className="opsss__left">
          {/* 총매출 → − 수수료 → = 순매출: 한 흐름으로 읽힌다. */}
          <section className="opsss__flow" aria-label={copy.ssGross}>
            <div className="opsss__flowmain">
              <span className="opsss__klabel">
                <Wallet aria-hidden="true" />
                {copy.ssGross}
              </span>
              <span className="opsss__heroval">{fmt.yen(totals.revenue)}</span>
              <span className="opsss__knote">{copy.ssGrossNote.replace("{n}", fmt.count(summary.reservationCount))}</span>
            </div>
            <div className="opsss__flowsteps">
              <div className="opsss__flowstep">
                <span aria-hidden="true" className="opsss__op">−</span>
                <span className="opsss__flowtext">
                  <span className="opsss__klabel">
                    <ReceiptText aria-hidden="true" />
                    {copy.ssCommission}
                  </span>
                  <span className="opsss__flowval">{fmt.yen(totals.commission)}</span>
                  <span className="opsss__knote">{copy.ssCommissionNote}</span>
                </span>
              </div>
              <div className="opsss__flowstep net">
                <span aria-hidden="true" className="opsss__op">=</span>
                <span className="opsss__flowtext">
                  <span className="opsss__klabel">{copy.ssNet}</span>
                  <span className="opsss__flowval">{fmt.yen(totals.net)}</span>
                </span>
              </div>
            </div>
          </section>

          <div className="opsss__tiles">
            <div className="opsss__tile occ">
              <Gauge value={totals.occupancyPct} />
              <span className="opsss__tiletext">
                <span className="opsss__klabel">{copy.ssOccupancy}</span>
                <span className="opsss__knote">
                  {copy.ssOccupancyNote
                    .replace("{sold}", fmt.count(totals.occupiedNights))
                    .replace("{total}", fmt.count(totals.availableNights))}
                </span>
              </span>
            </div>
            <div className="opsss__tile">
              <span className="opsss__klabel">
                <Tag aria-hidden="true" />
                {copy.ssAdr}
              </span>
              <span className="opsss__kval">{fmt.yen(totals.adr)}</span>
              <span className="opsss__knote">{copy.ssAdrNote}</span>
            </div>
            <div className="opsss__tile">
              <span className="opsss__klabel">
                <TrendingUp aria-hidden="true" />
                {copy.ssRevpar}
              </span>
              <span className="opsss__kval">{fmt.yen(totals.revpar)}</span>
              <span className="opsss__knote">{copy.ssRevparNote}</span>
            </div>
            <div className="opsss__tile" title={copy.ssVacantHint}>
              <span className="opsss__klabel">
                <BedDouble aria-hidden="true" />
                {copy.ssVacant}
              </span>
              <span className="opsss__kval">{fmt.nights(totals.vacantNights)}</span>
              <span className="opsss__knote">{copy.ssVacantNote}</span>
              <span className="opsss__kfuture">
                {summary.futureVacancy.days > 0
                  ? copy.ssFutureVacant.replace("{n}", fmt.count(summary.futureVacancy.vacantNights))
                  : copy.ssFutureNone}
              </span>
            </div>
          </div>
        </div>

        {/* ── 채널별 ── */}
        <section className="opsss__card opsss__channels">
          <div className="opsss__cardhead">
            <h3 className="opsss__h3">{copy.ssChannels}</h3>
            <div className="opsss__legend">
              {channels.map((row) => (
                <span className="opsss__lchip" key={row.channel}>
                  <span className={`opsss__sw ${row.channel}`} />
                  {channelLabel(row.channel)}
                  <span className="opsss__lpct">{fmt.pct(share(row.revenue))}</span>
                </span>
              ))}
            </div>
          </div>
          {channelRevenue > 0 && (
            <div
              aria-label={channels.map((row) => `${channelLabel(row.channel)} ${fmt.pct(share(row.revenue))}`).join(", ")}
              className="opsss__stack"
              role="img"
            >
              {channels
                .filter((row) => row.revenue > 0)
                .map((row) => (
                  <span
                    className={`opsss__seg ${row.channel}`}
                    key={row.channel}
                    style={{ flexGrow: row.revenue }}
                    title={`${channelLabel(row.channel)} · ${fmt.yen(row.revenue)} · ${fmt.pct(share(row.revenue))}`}
                  >
                    {share(row.revenue) >= 9 && <span className="opsss__segpct">{Math.round(share(row.revenue))}%</span>}
                  </span>
                ))}
            </div>
          )}
          <table className="opsss__table opsss__chtable">
            <colgroup>
              <col className="w-name" />
              <col />
              <col />
              <col />
              <col className="w-small" />
              <col className="w-small" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{copy.ssChannelCol}</th>
                <th scope="col">{copy.ssRevenueCol}</th>
                <th scope="col">{copy.ssCommissionCol}</th>
                <th scope="col">{copy.ssNetCol}</th>
                <th scope="col">{copy.ssNightsCol}</th>
                <th scope="col">{copy.ssArrivalsCol}</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((row) => (
                <tr key={row.channel}>
                  <th className="c-name" scope="row">
                    <span className={`opsss__sw ${row.channel}`} />
                    <span className="opsss__ellip" title={channelLabel(row.channel)}>
                      {channelLabel(row.channel)}
                    </span>
                  </th>
                  <td className="c-num strong">{fmt.yen(row.revenue)}</td>
                  <td className="c-num dim">
                    {row.channel === "airbnb" || row.channel === "booking" ? fmt.yen(row.commission) : "–"}
                  </td>
                  <td className="c-num">{fmt.yen(row.net)}</td>
                  <td className="c-num dim">{fmt.count(row.nights)}</td>
                  <td className="c-num dim">{fmt.count(row.arrivals)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{copy.ssTotal}</th>
                <td className="c-num">{fmt.yen(totals.revenue)}</td>
                <td className="c-num">{fmt.yen(totals.commission)}</td>
                <td className="c-num">{fmt.yen(totals.net)}</td>
                <td className="c-num">{fmt.count(channels.reduce((sum, row) => sum + row.nights, 0))}</td>
                <td className="c-num">{fmt.count(channels.reduce((sum, row) => sum + row.arrivals, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>

      {/* ── 건물별 — 줄을 누르면 그 건물의 객실이 아래로 펼쳐진다(여럿 동시에). ── */}
      <section className="opsss__card opsss__props">
        <h3 className="opsss__h3">{copy.ssProperties}</h3>
        <table className="opsss__table opsss__ptable">
          <colgroup>
            <col className="w-pname" />
            <col className="w-rooms" />
            <col className="w-occ" />
            <col className="w-n" />
            <col className="w-n" />
            <col className="w-yen" />
            <col className="w-yen" />
            <col className="w-yen-l" />
            <col className="w-yen" />
            <col className="w-yen-l" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{copy.ssPropertyCol}</th>
              <th scope="col">{copy.ssRoomsCol}</th>
              <th scope="col">{copy.ssOccupancyCol}</th>
              <th scope="col">{copy.ssNightsCol}</th>
              <th scope="col">{copy.ssVacantCol}</th>
              <th scope="col">ADR</th>
              <th scope="col">RevPAR</th>
              <th scope="col">{copy.ssRevenueCol}</th>
              <th scope="col">{copy.ssCommissionCol}</th>
              <th scope="col">{copy.ssNetCol}</th>
            </tr>
          </thead>
          {summary.byProperty.map((row) => {
            const expanded = open.has(row.propertyName);
            return (
              // 건물마다 `<tbody>` 하나 — 건물 줄과 펼친 객실 줄이 한 묶음이다.
              <tbody className={`opsss__group${expanded ? " is-open" : ""}`} key={row.propertyName}>
                  <tr className="is-prop">
                    <th className="c-name" scope="row">
                      <button
                        aria-expanded={expanded}
                        className="opsss__expand"
                        onClick={() => toggle(row.propertyName)}
                        title={row.propertyName}
                        type="button"
                      >
                        <ChevronRight aria-hidden="true" className="opsss__chev" />
                        <span className="opsss__ellip">{row.propertyName}</span>
                      </button>
                    </th>
                    <td className="c-rooms c-num" data-label={copy.ssRoomsCol}>
                      {fmt.count(row.roomCount)}
                    </td>
                    {cells(row)}
                  </tr>
                  {expanded && row.rooms.map(roomRow)}
              </tbody>
            );
          })}
          <tfoot>
            <tr>
              <th scope="row">{copy.ssTotal}</th>
              <td className="c-rooms c-num" data-label={copy.ssRoomsCol}>
                {fmt.count(totals.roomCount)}
              </td>
              {cells(totals)}
            </tr>
          </tfoot>
        </table>
      </section>
    </>
  );
}
