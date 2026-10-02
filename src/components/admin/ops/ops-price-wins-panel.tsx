"use client";

import { X } from "lucide-react";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import type { OpsPriceConversion } from "@/lib/ops-calendar";
import {
  PRICE_ATTRIBUTION_WINDOW_HOURS,
} from "@/lib/ops-price-attribution";

/**
 * 가격 개입 성공 목록 — 오른쪽 사이드 패널.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「가격 개입 전환」
 * 원본: 저쪽 캘린더 「Price-Driven Bookings」 모달
 *
 * 한 줄 = 예약 하나: 어느 방·어느 숙박 · 누가 · **그 예약의 방·날짜에서 얼마를 바꿨나(±%)** ·
 * **몇 시간 만에 들어왔나**. 누르면 예약 상세가 열린다.
 *
 * 저쪽 목록은 캘린더에 보이는 기간의 숙박만 담아 나머지는 다른 화면에 있었다. 여기는 **가격을 바꾼
 * 시각 기준 최근 90일 전체**다(창과 무관).
 */

export type PriceWinsCopy = {
  pwTitle: string;
  pwSubtitle: string;
  pwAllProperties: string;
  pwCount: string;
  pwAverage: string;
  pwNights: string;
  pwHours: string;
  pwBookedAt: string;
  pwEmpty: string;
  pwLoading: string;
  pwScopeNote: string;
  rcClose: string;
};

const CHANNEL_LABEL: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  manual: "Direct",
};

const money = (value: number) => `¥${Math.round(value).toLocaleString()}`;

function stamp(iso: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

const shortDate = (date: string) => date.slice(5).replace("-", "/");

export function OpsPriceWinsPanel({
  conversions,
  copy,
  localeTag,
  onClose,
  onOpenReservation,
  propertyName,
  windowLabel,
}: {
  /**
   * **`null` 이면 아직 받는 중이다** — 가격 개입 판정은 격자가 그린 뒤 서버 액션으로 따로 온다
   * (2026-09-30 속도).
   */
  conversions: OpsPriceConversion[] | null;
  copy: PriceWinsCopy;
  localeTag: string;
  onClose: () => void;
  onOpenReservation: (conversion: OpsPriceConversion) => void;
  /** 건물 필터. 없으면 전체. */
  propertyName: string | null;
  /** 보고 있는 창(「9/28–10/27」) — 목록은 이 창 안 숙박만이다(2026-10-02). */
  windowLabel: string;
}) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { quietRestore: true });
  const list = conversions ?? [];
  const averageHours =
    list.length > 0
      ? Math.round((list.reduce((sum, row) => sum + row.hoursToBooking, 0) / list.length) * 10) / 10
      : null;

  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <aside
        aria-label={copy.pwTitle}
        aria-modal="true"
        className="panel opspw"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{copy.pwTitle}</span>
            <button aria-label={copy.rcClose} className="panel__x" onClick={onClose} type="button">
              <X />
            </button>
          </div>
          <div className="opspw__head">
            <strong>{conversions ? copy.pwCount.replace("{n}", String(list.length)) : copy.pwLoading}</strong>
            {averageHours !== null && (
              <span className="opspw__avg">{copy.pwAverage.replace("{h}", String(averageHours))}</span>
            )}
          </div>
          <div className="opspw__sub">
            {propertyName ?? copy.pwAllProperties} ·{" "}
            {copy.pwSubtitle
              .replace("{h}", String(PRICE_ATTRIBUTION_WINDOW_HOURS))
              .replace("{range}", windowLabel)}
          </div>
        </div>

        <div className="panel__body opspw__body">
          {conversions === null ? (
            <p aria-live="polite" className="opspw__empty">
              {copy.pwLoading}
            </p>
          ) : list.length === 0 ? (
            <p className="opspw__empty">{copy.pwEmpty}</p>
          ) : (
            <ul className="opspw__list">
              {list.map((row) => {
                const down = row.delta !== null && row.delta < 0;
                const up = row.delta !== null && row.delta > 0;
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
                      {/* 얼마를 바꿨나 — 그 예약의 방·날짜에서만 뽑은 값이다(추정 아님). */}
                      <span className="opspw__price">
                        <span className={`opspw__delta${down ? " down" : up ? " up" : ""}`}>
                          {row.oldAverage !== null ? money(row.oldAverage) : "—"} →{" "}
                          {row.newAverage !== null ? money(row.newAverage) : "—"}
                          {row.percent !== null && (
                            <em>
                              {" "}
                              ({row.percent > 0 ? "+" : ""}
                              {row.percent}%)
                            </em>
                          )}
                        </span>
                        <span className="opspw__meta">
                          {copy.pwNights.replace("{n}", String(row.nights))} · {row.changedBy ?? "—"}
                        </span>
                      </span>
                      {/* 몇 시간 만에 들어왔나 */}
                      <span className="opspw__time">
                        <strong>{copy.pwHours.replace("{h}", String(row.hoursToBooking))}</strong>
                        <span className="opspw__meta">
                          {copy.pwBookedAt.replace("{time}", stamp(row.bookedAt, localeTag))}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 무엇이 안 잡히는지 적어 둔다 — 「왜 이 예약은 없지?」가 반드시 나온다. */}
          <p className="opspw__note">
            {copy.pwScopeNote.replace("{h}", String(PRICE_ATTRIBUTION_WINDOW_HOURS))}
          </p>
        </div>
      </aside>
    </>
  );
}
