"use client";

import { useMemo, useState, useTransition } from "react";
import { submitManualBooking } from "@/app/admin/ops/calendar/actions";
import {
  bookingErrorText,
  type BookingPanelCopy,
  type BookingPanelRate,
  type BookingPanelRoom,
} from "@/components/admin/ops/ops-booking-panel";
import { useRoomAvailability } from "@/components/admin/ops/use-room-availability";
import { MobileStayDates, MobileStepper } from "@/components/mobile/ops/mobile-ops-form";
import { stayNights, validateManualBooking } from "@/lib/ops-manual-booking";

/**
 * 모바일 수기 예약 시트 — Claude Design 시안 `5a 예약 상세 · 수기 예약 시트 v3`(5e, 2026-10-02 사용자 확정).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「모바일 판매 캘린더」 → 예약 시트 v3
 *
 * **서버 경로 · 검사는 데스크톱 수기 예약 패널과 같다**(`submitManualBooking` · `validateManualBooking` · 빈방 읽기
 * `useRoomAvailability`). 모양만 모바일로: 격자에서 고른 객실 · 기간이 그대로 들어오고(날짜는 앱 날짜 시트로 바꿀 수 있다),
 * 빈방 확인 줄 · 인원 −/+ · 「요금으로 채우기」(채널별 합계 칩 — 누르면 총액에) · 전화 · 이메일 · 메모(선택).
 * 만들어지면 부모가 시트를 닫고 알림(「예약 만듦 · 이름 N박」 + 「열기」)을 띄운다.
 */

export type MobileBookingSheetCopy = BookingPanelCopy & {
  mbkAllFree: string;
  mOptional: string;
  today: string;
};

type Channel = "airbnb" | "booking";

export function MobileOpsBookingSheet({
  checkIn,
  checkOut,
  copy,
  localeTag,
  onCancel,
  onCreated,
  rateAt,
  room,
  today,
}: {
  checkIn: string;
  checkOut: string;
  copy: MobileBookingSheetCopy;
  localeTag: string;
  onCancel: () => void;
  /** 성공 — 부모가 시트를 닫고 알림. `reservationId` 가 있으면 알림의 「열기」로 상세를 연다. */
  onCreated: (created: { guestName: string; nights: number; reservationId: string | null }) => void;
  rateAt: (date: string) => BookingPanelRate;
  room: BookingPanelRoom;
  today: string;
}) {
  // 요청 키 — 패널을 연 동안 하나. 같은 키로는 서버가 예약을 한 번만 만든다(실패 뒤 다시 눌러도 중복 없음).
  const [requestKey] = useState(() => crypto.randomUUID());
  const [arrival, setArrival] = useState(checkIn);
  const [departure, setDeparture] = useState(checkOut);
  const [guestName, setGuestName] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [filledFrom, setFilledFrom] = useState<Channel | null>(null);
  const [numAdult, setNumAdult] = useState(1);
  const [numChild, setNumChild] = useState(0);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nights = useMemo(() => stayNights(arrival, departure), [arrival, departure]);
  const availability = useRoomAvailability({
    roomIds: room.roomIds,
    roomKey: room.key,
    seedMonths: [checkIn.slice(0, 7), checkOut.slice(0, 7)],
    today,
  });
  const taken = availability.takenIn(nights);

  const rates = useMemo(() => {
    const rows = nights.map((night) => ({ night, ...rateAt(night) }));
    const sum = (channel: Channel) => {
      const known = rows.filter((row) => row[channel] !== null);
      return { partial: known.length !== rows.length, total: known.reduce((acc, row) => acc + (row[channel] ?? 0), 0) };
    };
    return { airbnb: sum("airbnb"), booking: sum("booking") };
  }, [nights, rateAt]);

  const parsedPrice = totalPrice.trim() === "" ? null : Number(totalPrice);
  const input = { arrival, departure, guestName, numAdult, numChild, roomKey: room.key, totalPrice: parsedPrice };
  const localInvalid = validateManualBooking(input, today);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitManualBooking({
        comments,
        guestEmail,
        guestPhone,
        input,
        requestKey,
        roomIds: room.roomIds,
      });
      if (result.ok) {
        onCreated({ guestName: guestName.trim(), nights: nights.length, reservationId: result.reservationId });
        return;
      }
      setError(bookingErrorText(copy, result));
    });
  };

  const fill = (channel: Channel) => {
    setFilledFrom(channel);
    setTotalPrice(String(rates[channel].total));
  };
  const chip = (channel: Channel) => {
    const rate = rates[channel];
    if (rate.total <= 0) return null;
    return (
      <button
        aria-pressed={filledFrom === channel}
        className={`mbs-fill${filledFrom === channel ? " on" : ""}`}
        key={channel}
        onClick={() => fill(channel)}
        type="button"
      >
        <i className={channel === "airbnb" ? "a" : "k"} aria-hidden="true" />
        {channel === "airbnb" ? copy.mbAirbnb : copy.mbBooking} ¥{rate.total.toLocaleString("ja-JP")}
        {rate.partial ? "*" : ""}
      </button>
    );
  };

  return (
    <div className="mps mops-vars">
      <div className="mps-body">
        <div className="mps-head">
          <div className="mps-head__t">
            <h3>{copy.mbTitle}</h3>
            <p>
              <b>{room.propertyName}</b> {room.label}
            </p>
          </div>
          <span className="mps-cnt">{copy.mbNights.replace("{n}", String(nights.length))}</span>
        </div>

        <MobileStayDates
          arrival={arrival}
          checkInLabel={copy.mbCheckIn}
          checkOutLabel={copy.mbCheckOut}
          departure={departure}
          labels={{ nextMonth: copy.dateNext, prevMonth: copy.datePrev, today: copy.today }}
          locale={localeTag}
          onChange={(from, to) => {
            setArrival(from);
            setDeparture(to);
            setFilledFrom(null);
          }}
          today={today}
        />
        {taken.length > 0 ? (
          <div className="mps-note danger" role="alert">
            <i aria-hidden="true" />
            {copy.mbErrNightsTaken.replace("{dates}", taken.map((night) => night.slice(5).replace("-", "/")).join(", "))}
          </div>
        ) : availability.failed ? (
          <div className="mps-note warn">
            <i aria-hidden="true" />
            {copy.mbAvailFailed}
          </div>
        ) : (
          <div className="mbs-ok">
            <i aria-hidden="true" />
            {copy.mbkAllFree.replace("{n}", String(nights.length))}
          </div>
        )}

        <label className="mfm-field">
          <span className="mfm-l">{copy.mbGuest}</span>
          <input
            className="mfm-in"
            enterKeyHint="next"
            onChange={(event) => setGuestName(event.target.value)}
            placeholder={copy.mbGuestPlaceholder}
            type="text"
            value={guestName}
          />
        </label>
        <div className="mfm-two">
          <MobileStepper label={copy.mbAdults} min={1} onChange={setNumAdult} value={numAdult} />
          <MobileStepper label={copy.mbChildren} min={0} onChange={setNumChild} value={numChild} />
        </div>

        <div className="mfm-field">
          <span className="mfm-l">
            {copy.mbTotal} — {copy.mbFillFrom}
          </span>
          {(rates.airbnb.total > 0 || rates.booking.total > 0) && (
            <div className="mbs-fills">
              {chip("airbnb")}
              {chip("booking")}
            </div>
          )}
          <span className="mfm-money">
            <span aria-hidden="true">¥</span>
            <input
              inputMode="numeric"
              onChange={(event) => {
                setTotalPrice(event.target.value);
                setFilledFrom(null);
              }}
              placeholder={copy.mbTotalPlaceholder}
              type="number"
              value={totalPrice}
            />
          </span>
          <span className="mfm-hint">
            {copy.mbTotalHint}
            {rates.airbnb.partial || rates.booking.partial ? ` ${copy.mbRatesPartial}` : ""}
          </span>
        </div>

        <div className="mfm-two">
          <label className="mfm-field">
            <span className="mfm-l">{copy.mbPhone}</span>
            <input className="mfm-in" onChange={(event) => setGuestPhone(event.target.value)} placeholder={copy.mOptional} type="tel" value={guestPhone} />
          </label>
          <label className="mfm-field">
            <span className="mfm-l">{copy.mbEmail}</span>
            <input className="mfm-in" onChange={(event) => setGuestEmail(event.target.value)} placeholder={copy.mOptional} type="email" value={guestEmail} />
          </label>
        </div>
        <label className="mfm-field">
          <span className="mfm-l">{copy.mbComments}</span>
          <textarea
            className="mfm-in area"
            onChange={(event) => setComments(event.target.value)}
            placeholder={copy.mbCommentsPlaceholder}
            rows={2}
            value={comments}
          />
        </label>

        {error && (
          <div className="mps-note danger" role="alert">
            <i aria-hidden="true" />
            {error}
          </div>
        )}
      </div>
      <div className="mps-foot">
        <button className="mps-btn ghost" disabled={pending} onClick={onCancel} type="button">
          {copy.mbCancel}
        </button>
        <button
          className="mps-btn main"
          disabled={pending || localInvalid !== null || taken.length > 0}
          onClick={submit}
          type="button"
        >
          {copy.mbSubmit}
        </button>
      </div>
    </div>
  );
}
