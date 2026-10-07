"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import type { OpsRecentBooking } from "@/lib/ops-calendar";
import { RECENT_BOOKINGS_MAX_SPAN_DAYS, tokyoDateOf, tokyoMs, tokyoParts } from "@/lib/ops-recent-bookings-range";

/**
 * 최근 예약 목록 — 오른쪽 사이드 패널(모바일은 같은 것을 하단 시트에 담는다). 2026-10-05.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「최근 예약」
 *
 * 가격 개입 성공 목록(`ops-price-wins-panel.tsx`)과 같은 뼈대 — 머리(건수 · 시간대) · 한 줄 = 예약 하나(방 · 숙박 ·
 * 채널 · 손님 · 금액 · 몇 시간 전) · 누르면 예약 상세. 머리의 「기간 바꾸기」로 시작 · 끝(도쿄 날짜 + 시각)을 정한다
 * — **날짜만**(콘솔 공용 범위 달력 `AdminDateRangePicker`): 시작일 0시부터 끝날 24시까지, 끝이 오늘이면 지금까지
 * (2026-10-05 사용자 결정 「시각은 자정으로 통일」).
 */

export type RecentBookingsCopy = {
  rbTitle: string;
  rbCount: string;
  rbNow: string;
  rbEdit: string;
  rbReset: string;
  rbDefaultNote: string;
  rbCustomNote: string;
  rbInvalid: string;
  rbEmpty: string;
  rbAgo: string;
  rbScopeNote: string;
  pwAllProperties: string;
  pwLoading: string;
  pwBookedAt: string;
  rcClose: string;
  datePrev: string;
  dateNext: string;
  dateThisMonth: string;
  dateReset: string;
  dateApply: string;
};

const CHANNEL_LABEL: Record<string, string> = { airbnb: "Airbnb", booking: "Booking.com", manual: "Direct" };
const money = (value: number) => `¥${Math.round(value).toLocaleString()}`;
const shortDate = (date: string) => date.slice(5).replace("-", "/");

function stamp(iso: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

/** 시간대 라벨 — 기본 「10/05 11:20 – 지금」(48시간이라 시각까지), 직접 지정 「10/03 – 지금」 · 「10/03 – 10/04」(끝날 포함). */
export type RecentRange = { from: string; to: string; isDefault: boolean; endsNow: boolean };

export function recentRangeLabel(range: RecentRange, nowLabel: string): string {
  const fromMs = Date.parse(range.from);
  const start = range.isDefault ? `${shortDate(tokyoDateOf(fromMs))} ${tokyoParts(fromMs).time}` : shortDate(tokyoDateOf(fromMs));
  // 끝이 「지금」인지는 서버가 알려 준다(기본이거나, 끝날이 오늘이라 지금으로 잘렸을 때).
  return `${start} – ${range.endsNow ? nowLabel : shortDate(lastDayOf(range))}`;
}

/** 끝(배타 — 다음 날 0시)의 하루 전 = 끝날. */
function lastDayOf(range: RecentRange): string {
  return tokyoDateOf(Date.parse(range.to) - 1);
}

export function OpsRecentBookingsPanel({
  bookings,
  copy,
  localeTag,
  onApplyRange,
  onClose,
  onOpenReservation,
  onResetRange,
  propertyName,
  range,
}: {
  /** `null` = 받는 중. */
  bookings: OpsRecentBooking[] | null;
  copy: RecentBookingsCopy;
  localeTag: string;
  onApplyRange: (from: string, to: string) => void;
  onClose: () => void;
  onOpenReservation: (booking: OpsRecentBooking) => void;
  onResetRange: () => void;
  propertyName: string | null;
  range: RecentRange | null;
}) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { quietRestore: true });
  const list = bookings ?? [];
  const [invalid, setInvalid] = useState(false);
  const [nowMsForRange] = useState(() => Date.now());
  const today = tokyoDateOf(nowMsForRange);

  /** 범위 달력에서 고른 날짜 → 시작일 0시 ~ 끝날 다음 날 0시(서버가 지금 이후를 지금으로 자른다). */
  const applyDates = (fromDate: string, toDate: string) => {
    if (!fromDate || !toDate) {
      onResetRange();
      return;
    }
    const fromMs = tokyoMs(fromDate);
    const toMs = tokyoMs(toDate) + 86_400_000;
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs - fromMs > RECENT_BOOKINGS_MAX_SPAN_DAYS * 86_400_000) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onApplyRange(new Date(fromMs).toISOString(), new Date(toMs).toISOString());
  };
  const pickerFrom = range ? tokyoDateOf(Date.parse(range.from)) : "";
  const pickerTo = range ? (range.endsNow ? today : lastDayOf(range)) : "";
  // 「N시간 전」의 기준 — 패널을 연 순간(렌더마다 시계를 읽지 않는다).
  const [nowMs] = useState(() => Date.now());

  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <aside aria-label={copy.rbTitle} aria-modal="true" className="panel opspw opsrb" ref={panelRef} role="dialog" tabIndex={-1}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{copy.rbTitle}</span>
            <button aria-label={copy.rcClose} className="panel__x" onClick={onClose} type="button">
              <X />
            </button>
          </div>
          <div className="opspw__head">
            <strong>{bookings ? copy.rbCount.replace("{n}", String(list.length)) : copy.pwLoading}</strong>
          </div>
          <div className="opspw__sub">
            {propertyName ?? copy.pwAllProperties} · {range ? recentRangeLabel(range, copy.rbNow) : "…"}
          </div>
          <div className="opsrb__rangebar">
            <AdminDateRangePicker
              ariaLabel={copy.rbEdit}
              from={pickerFrom}
              isDateDisabled={(dateKey) => dateKey > today}
              labels={{
                apply: copy.dateApply,
                nextMonth: copy.dateNext,
                prevMonth: copy.datePrev,
                reset: copy.dateReset,
                thisMonth: copy.dateThisMonth,
              }}
              localeTag={localeTag}
              onChange={applyDates}
              to={pickerTo}
            />
            {range && !range.isDefault && (
              <button className="opsrb__btn" onClick={onResetRange} type="button">
                {copy.rbReset}
              </button>
            )}
          </div>
          {invalid && (
            <p className="opsrb__err" role="alert">
              {copy.rbInvalid}
            </p>
          )}
        </div>

        <div className="panel__body opspw__body">
          {bookings === null ? (
            <p aria-live="polite" className="opspw__empty">
              {copy.pwLoading}
            </p>
          ) : list.length === 0 ? (
            <p className="opspw__empty">{copy.rbEmpty}</p>
          ) : (
            <ul className="opspw__list">
              {list.map((row) => {
                const hours = Math.max(0, Math.round(((nowMs - Date.parse(row.bookedAt)) / 3_600_000) * 10) / 10);
                return (
                  <li key={row.reservationId}>
                    <button className="opspw__row" onClick={() => onOpenReservation(row)} type="button">
                      <span className="opspw__main">
                        <span className="opspw__room">
                          {row.propertyName} {row.roomLabel}
                          <span className="opspw__dates">
                            {shortDate(row.checkIn)}–{shortDate(row.checkOut)}
                          </span>
                        </span>
                        <span className="opspw__guest">
                          <span className={`opspw__chan ${row.channel}`}>{CHANNEL_LABEL[row.channel] ?? row.channel}</span>
                          {row.guestName}
                        </span>
                      </span>
                      <span className="opspw__price">
                        <span className="opspw__delta">{row.amount > 0 ? money(row.amount) : "—"}</span>
                      </span>
                      <span className="opspw__time">
                        <strong>{copy.rbAgo.replace("{h}", String(hours))}</strong>
                        <span className="opspw__meta">{copy.pwBookedAt.replace("{time}", stamp(row.bookedAt, localeTag))}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="opspw__note">
            {range && !range.isDefault ? copy.rbCustomNote : copy.rbDefaultNote} {copy.rbScopeNote}
          </p>
        </div>
      </aside>
    </>
  );
}
