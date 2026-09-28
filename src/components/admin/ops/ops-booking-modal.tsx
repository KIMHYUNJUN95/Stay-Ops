"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { submitManualBooking, type ManualBookingResult } from "@/app/admin/ops/calendar/actions";
import { AdminDatePicker } from "@/components/admin/shared/admin-date-picker";
import { MAX_STAY_NIGHTS, stayNights, validateManualBooking } from "@/lib/ops-manual-booking";

/**
 * 수동 예약 생성 모달.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「수동 예약 생성」
 * 원본: STAY ARI Manager `BuildingCalendar.jsx` → `ManualBookingModal`
 *
 * ## 금액은 **총액**이다
 *
 * 1박 단가가 아니다. Beds24 예약 한 건에 붙는 값이 총액이라 그대로 맞춘다(저쪽 라벨도
 * `Total Price`). 그래서 숙박 일수가 바뀌면 금액을 **다시 정해야 한다** — 숙박이 바뀌면
 * 고른 기준가를 지워 「전에 넣은 값이 아직 맞나?」를 묻지 않게 한다.
 *
 * ## 가격을 찾아 주지 않으면 아무도 안 쓴다
 *
 * 총액을 손으로 계산하려면 날짜별 요금을 따로 봐야 한다. 그래서 **그 방·그 기간의 밤별
 * 요금과 합계**를 바로 보여주고, 누르면 채워 넣는다. 저쪽이 이 화면에서 제일 공들인 부분이다.
 *
 * 요금을 모르는 밤이 하나라도 있으면 합계는 **추정치**다(`~¥`). 그때는 자동 채우기를 막는다 —
 * 모르는 값을 더한 숫자를 「제안」으로 내밀면 그게 그대로 청구된다.
 *
 * ## 차단은 여기서 안 만든다
 *
 * 저쪽은 손님 이름에 `blackout` / `room block` 이 들어가면 차단을 만들었다. 화면 어디에도
 * 안 적힌 매직 문자열이라 **뺐다**(2026-09-28 사용자 확인). 차단은 전용 모드에서 한다.
 */

export type BookingModalCopy = {
  mbTitle: string;
  mbRoom: string;
  mbCheckIn: string;
  mbCheckOut: string;
  mbNights: string;
  mbGuest: string;
  mbGuestPlaceholder: string;
  mbTotal: string;
  mbTotalPlaceholder: string;
  mbTotalHint: string;
  mbAdults: string;
  mbChildren: string;
  mbEmail: string;
  mbPhone: string;
  mbComments: string;
  mbCommentsPlaceholder: string;
  mbRates: string;
  mbRatesEmpty: string;
  mbRatesPartial: string;
  mbUseAirbnb: string;
  mbUseBooking: string;
  mbAdjust: string;
  mbCancel: string;
  mbSubmit: string;
  mbPending: string;
  mbDone: string;
  /** 「{dates} 는 다른 유닛이 판매 중입니다」 — 날짜를 반드시 같이 적는다. */
  mbErrUnitChanges: string;
  mbErrNoActiveUnit: string;
  mbErrNoRoom: string;
  mbErrNoGuestName: string;
  mbErrBadDates: string;
  mbErrPastArrival: string;
  mbErrBadPrice: string;
  mbErrBadOccupancy: string;
  mbErrStayTooLong: string;
  mbErrForbidden: string;
  mbErrBeds24: string;
  mbErrCooldown: string;
  datePrev: string;
  dateNext: string;
  dateToday: string;
};

export type BookingModalRoom = {
  key: string;
  label: string;
  propertyName: string;
  roomIds: string[];
};

/** 밤별 요금. `null` 이면 **모르는 것**이지 0원이 아니다. */
export type BookingModalRate = { airbnb: number | null; booking: number | null };

const PERCENT_PRESETS = [-10, -5, 0, 5, 10];

function errorText(copy: BookingModalCopy, result: Extract<ManualBookingResult, { ok: false }>) {
  const dates = (result.conflictDates ?? []).map((date) => date.slice(5)).join(", ");
  switch (result.error) {
    case "unit_changes":
      return copy.mbErrUnitChanges.replace("{dates}", dates);
    case "no_active_unit":
      return copy.mbErrNoActiveUnit.replace("{dates}", dates);
    case "no_room":
      return copy.mbErrNoRoom;
    case "no_guest_name":
      return copy.mbErrNoGuestName;
    case "bad_dates":
      return copy.mbErrBadDates;
    case "past_arrival":
      return copy.mbErrPastArrival;
    case "bad_price":
      return copy.mbErrBadPrice;
    case "bad_occupancy":
      return copy.mbErrBadOccupancy;
    case "stay_too_long":
      return copy.mbErrStayTooLong.replace("{max}", String(MAX_STAY_NIGHTS));
    case "forbidden":
      return copy.mbErrForbidden;
    case "cooldown":
      return copy.mbErrCooldown;
    default:
      return copy.mbErrBeds24;
  }
}

export function OpsBookingModal({
  copy,
  localeTag,
  onClose,
  rateAt,
  room,
  startDate,
  today,
}: {
  copy: BookingModalCopy;
  localeTag: string;
  onClose: () => void;
  /** 그 방 그 밤의 요금. 격자가 이미 들고 있는 값을 그대로 넘긴다. */
  rateAt: (date: string) => BookingModalRate;
  room: BookingModalRoom;
  startDate: string;
  today: string;
}) {
  const [arrival, setArrival] = useState(startDate);
  const [departure, setDeparture] = useState(() => nextDay(startDate));
  const [guestName, setGuestName] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [numAdult, setNumAdult] = useState(1);
  const [numChild, setNumChild] = useState(0);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [comments, setComments] = useState("");
  const [basePrice, setBasePrice] = useState<{ value: number; label: "airbnb" | "booking" } | null>(
    null,
  );
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nights = useMemo(() => stayNights(arrival, departure), [arrival, departure]);

  const rates = useMemo(() => {
    const rows = nights.map((night) => ({ night, ...rateAt(night) }));
    const knownAirbnb = rows.filter((row) => row.airbnb !== null);
    const knownBooking = rows.filter((row) => row.booking !== null);
    return {
      // 모르는 밤이 하나라도 있으면 **추정치**다. 자동 채우기를 막는 근거가 된다.
      partial: knownAirbnb.length !== rows.length,
      rows,
      totalAirbnb: knownAirbnb.reduce((sum, row) => sum + (row.airbnb ?? 0), 0),
      totalBooking: knownBooking.reduce((sum, row) => sum + (row.booking ?? 0), 0),
    };
  }, [nights, rateAt]);

  /**
   * 숙박이 바뀌면 기준가를 버린다. 총액이라 **일수가 달라지면 그 값은 더 이상 그 숙박의
   * 값이 아니다.** 효과로 지우지 않고 날짜를 바꾸는 자리에서 지운다 — 무엇이 언제 지워지는지가
   * 코드에 그대로 보인다.
   */
  const dropBase = () => {
    setBasePrice(null);
    setPercent(0);
  };

  const changeArrival = (next: string) => {
    setArrival(next);
    // 체크인이 체크아웃을 넘어서면 체크아웃을 끌고 간다 — 사람이 두 번 고치게 하지 않는다.
    if (departure <= next) setDeparture(nextDay(next));
    dropBase();
  };

  const changeDeparture = (next: string) => {
    setDeparture(next);
    dropBase();
  };

  const applyBase = (value: number, label: "airbnb" | "booking") => {
    setBasePrice({ label, value });
    setPercent(0);
    setTotalPrice(String(value));
  };

  const applyPercent = (next: number) => {
    setPercent(next);
    if (basePrice) setTotalPrice(String(Math.round(basePrice.value * (1 + next / 100))));
  };

  const parsedPrice = totalPrice.trim() === "" ? null : Number(totalPrice);
  const input = {
    arrival,
    departure,
    guestName,
    numAdult,
    numChild,
    roomKey: room.key,
    totalPrice: parsedPrice,
  };
  const localInvalid = validateManualBooking(input, today);

  const submit = () => {
    setMessage(copy.mbPending);
    startTransition(async () => {
      const result = await submitManualBooking({
        comments,
        guestEmail,
        guestPhone,
        input,
        roomIds: room.roomIds,
      });
      if (result.ok) {
        setMessage(copy.mbDone);
        onClose();
        return;
      }
      setMessage(errorText(copy, result));
    });
  };

  const money = (value: number) => `¥${value.toLocaleString()}`;

  return (
    <div aria-label={copy.mbTitle} aria-modal className="opsmb" onClick={onClose} role="dialog">
      <div className="opsmb__card" onClick={(event) => event.stopPropagation()} role="presentation">
        <div className="opsmb__head">
          <div className="opsmb__title">{copy.mbTitle}</div>
          <div className="opsmb__room">
            {room.propertyName} · {room.label}
          </div>
          <button className="opsmb__x" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="opsmb__body">
          <div className="opsmb__grid2">
            <label className="opsmb__field">
              <span className="opsmb__lbl">{copy.mbCheckIn}</span>
              <AdminDatePicker
                ariaLabel={copy.mbCheckIn}
                labels={{ nextMonth: copy.dateNext, prevMonth: copy.datePrev, today: copy.dateToday }}
                localeTag={localeTag}
                min={today}
                onChange={changeArrival}
                value={arrival}
              />
            </label>
            <label className="opsmb__field">
              <span className="opsmb__lbl">{copy.mbCheckOut}</span>
              <AdminDatePicker
                ariaLabel={copy.mbCheckOut}
                labels={{ nextMonth: copy.dateNext, prevMonth: copy.datePrev, today: copy.dateToday }}
                localeTag={localeTag}
                min={nextDay(arrival)}
                onChange={changeDeparture}
                value={departure}
              />
            </label>
          </div>
          <div className="opsmb__nights">{copy.mbNights.replace("{n}", String(nights.length))}</div>

          {/* 그 방·그 기간의 밤별 요금. 총액을 손으로 계산하게 하면 아무도 안 쓴다. */}
          <div className="opsmb__rates">
            <div className="opsmb__ratehead">{copy.mbRates}</div>
            {rates.rows.length === 0 ? (
              <div className="opsmb__rateempty">{copy.mbRatesEmpty}</div>
            ) : (
              <>
                <ul className="opsmb__ratelist">
                  {rates.rows.map((row) => (
                    <li key={row.night}>
                      <span className="opsmb__rdate">{row.night.slice(5)}</span>
                      <span className="opsmb__rval">
                        {row.airbnb === null ? "—" : money(row.airbnb)}
                      </span>
                      <span className="opsmb__rval alt">
                        {row.booking === null ? "—" : money(row.booking)}
                      </span>
                    </li>
                  ))}
                </ul>
                {rates.partial && <div className="opsmb__warn">{copy.mbRatesPartial}</div>}
                <div className="opsmb__usebtns">
                  <button
                    className={`opsmb__use${basePrice?.label === "airbnb" ? " on" : ""}`}
                    disabled={rates.partial || rates.totalAirbnb <= 0}
                    onClick={() => applyBase(rates.totalAirbnb, "airbnb")}
                    type="button"
                  >
                    {copy.mbUseAirbnb.replace("{amount}", money(rates.totalAirbnb))}
                  </button>
                  <button
                    className={`opsmb__use${basePrice?.label === "booking" ? " on" : ""}`}
                    disabled={rates.partial || rates.totalBooking <= 0}
                    onClick={() => applyBase(rates.totalBooking, "booking")}
                    type="button"
                  >
                    {copy.mbUseBooking.replace("{amount}", money(rates.totalBooking))}
                  </button>
                </div>
                {basePrice && (
                  <div className="opsmb__pct">
                    <span className="opsmb__lbl">{copy.mbAdjust}</span>
                    {PERCENT_PRESETS.map((preset) => (
                      <button
                        className={`opsmb__pctbtn${percent === preset ? " on" : ""}`}
                        key={preset}
                        onClick={() => applyPercent(preset)}
                        type="button"
                      >
                        {preset > 0 ? `+${preset}` : preset}%
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <label className="opsmb__field">
            <span className="opsmb__lbl">{copy.mbGuest}</span>
            <input
              className="opsmb__input"
              onChange={(event) => setGuestName(event.target.value)}
              placeholder={copy.mbGuestPlaceholder}
              type="text"
              value={guestName}
            />
          </label>

          <label className="opsmb__field">
            <span className="opsmb__lbl">{copy.mbTotal}</span>
            <input
              className="opsmb__input"
              inputMode="numeric"
              onChange={(event) => {
                setTotalPrice(event.target.value);
                setBasePrice(null);
              }}
              placeholder={copy.mbTotalPlaceholder}
              type="number"
              value={totalPrice}
            />
            <span className="opsmb__hint">{copy.mbTotalHint}</span>
          </label>

          <div className="opsmb__grid2">
            <label className="opsmb__field">
              <span className="opsmb__lbl">{copy.mbAdults}</span>
              <input
                className="opsmb__input"
                min={1}
                onChange={(event) => setNumAdult(Number(event.target.value))}
                type="number"
                value={numAdult}
              />
            </label>
            <label className="opsmb__field">
              <span className="opsmb__lbl">{copy.mbChildren}</span>
              <input
                className="opsmb__input"
                min={0}
                onChange={(event) => setNumChild(Number(event.target.value))}
                type="number"
                value={numChild}
              />
            </label>
          </div>

          <div className="opsmb__grid2">
            <label className="opsmb__field">
              <span className="opsmb__lbl">{copy.mbEmail}</span>
              <input
                className="opsmb__input"
                onChange={(event) => setGuestEmail(event.target.value)}
                type="email"
                value={guestEmail}
              />
            </label>
            <label className="opsmb__field">
              <span className="opsmb__lbl">{copy.mbPhone}</span>
              <input
                className="opsmb__input"
                onChange={(event) => setGuestPhone(event.target.value)}
                type="tel"
                value={guestPhone}
              />
            </label>
          </div>

          <label className="opsmb__field">
            <span className="opsmb__lbl">{copy.mbComments}</span>
            <textarea
              className="opsmb__input opsmb__ta"
              onChange={(event) => setComments(event.target.value)}
              placeholder={copy.mbCommentsPlaceholder}
              rows={2}
              value={comments}
            />
          </label>

          {message && <div className="opsmb__msg">{message}</div>}
        </div>

        <div className="opsmb__foot">
          <button className="opsp__btn" onClick={onClose} type="button">
            {copy.mbCancel}
          </button>
          <button
            className="opsp__btn go"
            disabled={!!localInvalid || pending}
            onClick={submit}
            type="button"
          >
            {copy.mbSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}

/** `YYYY-MM-DD` 다음 날. 시간대에 안 흔들리도록 UTC 정오로 고정한다. */
function nextDay(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}
