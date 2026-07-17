"use client";

// Admin 주문·비품 console — 배송 예정 캘린더. 주문 처리됨(ordered) 주문의 배송일(단일/기간)을 월간
// 캘린더에 레인 배치하고, 날짜를 선택하면 우측 dayPanel에 그날 배송 목록을 보여준다.
// calEvents(orders-console-data.ts)의 그리디 인터벌 패킹을 그대로 사용한다.
import { ChevronLeft, ChevronRight, MapPin, Truck } from "lucide-react";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import type { Locale } from "@/lib/i18n";
import type { AdminOrderVM } from "@/lib/admin-orders";
import { calEvents, fmtDate, fmtMonth, iso, WD, dateToNum, sortForBoard } from "./orders-console-data";
import {
  ErrorState,
  OrderIcon,
  ReporterAvatar,
  StatusPill,
  UrgBadge,
  buildingOptionsOf,
  type OrdersCopy,
} from "./orders-console-shared";

export type CalMonth = { y: number; m: number };

type CalendarProps = {
  orders: AdminOrderVM[];
  t: OrdersCopy;
  locale: Locale;
  todayKey: string;
  calProp: string;
  onCalPropChange: (v: string) => void;
  calMonth: CalMonth;
  onCalMonthChange: (next: CalMonth) => void;
  calSel: string | null;
  onCalSelChange: (v: string | null) => void;
  onSelectOrder: (id: string) => void;
  loadError?: boolean;
  onRetry: () => void;
};

const MAX_LANES = 3;

function shiftMonth(month: CalMonth, delta: number): CalMonth {
  const total = month.y * 12 + month.m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

export function OrdersCalendar({
  orders,
  t,
  locale,
  todayKey,
  calProp,
  onCalPropChange,
  calMonth,
  onCalMonthChange,
  calSel,
  onCalSelChange,
  onSelectOrder,
  loadError,
  onRetry,
}: CalendarProps) {
  const buildingOptions = buildingOptionsOf(orders);
  const buildingBar = (
    <div className="ctoolbar filterbar" style={{ marginBottom: 14 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 7 }}>
        <MapPin className="ic" aria-hidden="true" />
        {t.calBuilding}
      </span>
      <AdmDropdown
        size="sm"
        value={calProp}
        onChange={onCalPropChange}
        ariaLabel={t.calBuilding}
        options={[{ value: "all", label: t.allProp }, ...buildingOptions.map((b) => ({ value: b.key, label: b.label }))]}
      />
      <span className="ctoolbar__spacer" />
      <span className="robadge">
        <Truck className="ic" aria-hidden="true" />
        {t.subtitle.split("·").pop()?.trim() ?? ""}
      </span>
    </div>
  );

  if (loadError) {
    return (
      <>
        {buildingBar}
        <ErrorState t={t} onRetry={onRetry} />
      </>
    );
  }

  const { y, m } = calMonth;
  const { evs, dayMap } = calEvents(orders, calProp);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDow = new Date(y, m, 1).getDay();
  const monthFirst = dateToNum(iso(y, m, 1));
  const weeksCount = Math.ceil((firstDow + daysInMonth) / 7);

  const weeks = Array.from({ length: weeksCount }, (_, w) => {
    const wStart = monthFirst - firstDow + w * 7;
    const wEnd = wStart + 6;
    const cells = Array.from({ length: 7 }, (_, i) => {
      const n = wStart + i;
      const dt = new Date(n * 86400000);
      const val = iso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
      const inMonth = dt.getUTCMonth() === m;
      const hidden = evs.filter((ev) => ev.lane >= MAX_LANES && n >= ev.s && n <= ev.e).length;
      const cls = ["oday-cell", i === 0 ? "sun" : "", !inMonth ? "oomonth" : "", val === todayKey ? "today" : "", calSel === val ? "sel" : ""]
        .filter(Boolean)
        .join(" ");
      return (
        <button type="button" key={val} className={cls} onClick={() => onCalSelChange(val)}>
          <span className="oday-cell__d">{dt.getUTCDate()}</span>
          {hidden ? <span className="oday-cell__more">+{hidden}</span> : null}
        </button>
      );
    });

    const wkEvs = evs.filter((ev) => ev.e >= wStart && ev.s <= wEnd && ev.lane < MAX_LANES);
    const bars = wkEvs.map((ev) => {
      const segS = Math.max(ev.s, wStart);
      const segE = Math.min(ev.e, wEnd);
      const c0 = segS - wStart + 1;
      const c1 = segE - wStart + 2;
      const contL = segS !== ev.s;
      const contR = segE !== ev.e;
      const cl = ["evbar", ev.urgent ? "urg" : "", contL ? "contL" : "", contR ? "contR" : ""].filter(Boolean).join(" ");
      return (
        <span
          key={ev.o.id}
          className={cl}
          style={{ gridColumn: `${c0}/${c1}`, gridRow: ev.lane + 1 }}
          title={ev.o.title}
          onClick={() => onSelectOrder(ev.o.id)}
          role="button"
          tabIndex={0}
        >
          <span className="dotm" />
          <span className="evbar__t">{ev.o.title}</span>
        </span>
      );
    });

    return (
      <div className="owk" key={wStart}>
        <div className="owk-cells">{cells}</div>
        <div className="owk-ev">{bars}</div>
      </div>
    );
  });

  const wd = WD[locale].map((w, i) => (
    <span key={w} className={i === 0 ? "sun" : ""}>
      {w}
    </span>
  ));

  const grid = (
    <div className="ocal">
      <div className="ocal__head">
        <div className="ocal__nav">
          <button type="button" className="ocal__navb" onClick={() => onCalMonthChange(shiftMonth(calMonth, -1))}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="ocal__navb" onClick={() => onCalMonthChange(shiftMonth(calMonth, 1))}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="ocal__title">{fmtMonth(y, m, locale)}</div>
        <button
          type="button"
          className="ocal__today"
          onClick={() => onCalMonthChange({ y: +todayKey.slice(0, 4), m: +todayKey.slice(5, 7) - 1 })}
        >
          {t.calToday}
        </button>
        <div className="ocal__legend">
          <span className="ocal__lg">
            <span className="ocal__lgdot d" />
            {t.calLegendDeliv}
          </span>
          <span className="ocal__lg">
            <span className="ocal__lgdot u" />
            {t.calLegendUrgent}
          </span>
        </div>
      </div>
      <div className="ocal__wd">{wd}</div>
      <div className="ocal__grid">{weeks}</div>
    </div>
  );

  const dayList = calSel ? dayMap[calSel] : null;
  const dayPanel = (
    <div className="oday">
      <div className="oday__h">
        <Truck className="ic" aria-hidden="true" />
        {calSel ? (
          <>
            <span className="oday__dt">{fmtDate(calSel, locale)}</span>
            {dayList ? <span className="oday__cnt">{dayList.length}{t.calCount}</span> : null}
          </>
        ) : null}
      </div>
      {!calSel ? (
        <div className="oday__empty">
          <OrderIcon name="caldays" className="ic" />
          <div className="t">{t.calPickDay}</div>
        </div>
      ) : !dayList || !dayList.length ? (
        <div className="oday__empty">
          <OrderIcon name="package" className="ic" />
          <div className="t">{t.calNoDeliv}</div>
        </div>
      ) : (
        <div className="oday__list">
          {sortForBoard(dayList).map((o) => (
            <div
              key={o.id}
              className={`odrow${o.urgency === "high" ? " is-urgent" : ""}`}
              onClick={() => onSelectOrder(o.id)}
              role="button"
              tabIndex={0}
            >
              <div className="odrow__top">
                <span className="odrow__bldg">
                  {o.buildingLabel}
                  {o.room ? ` · ${o.room}` : ""}
                </span>
                {o.urgency === "high" ? <UrgBadge t={t} /> : null}
                {o.deliv?.mode === "range" ? (
                  <span className="rng">
                    {t.calRangeTo} {fmtDate(o.deliv.end, locale)}
                  </span>
                ) : null}
              </div>
              <div className="odrow__title">{o.title}</div>
              <div className="odrow__meta">
                <ReporterAvatar id={o.reporterId} name={o.reporterName} className="who__av" />
                <span>{o.reporterName}</span>
                <span className="mcard__sp" />
                <StatusPill status={o.status} t={t} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {buildingBar}
      <div className="ocalwrap">
        {grid}
        {dayPanel}
      </div>
    </>
  );
}
