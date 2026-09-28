"use client";

import { useEffect, useState, useTransition } from "react";
import {
  submitReservationCancel,
  type CancelReservationResult,
} from "@/app/admin/ops/calendar/actions";
import type { OpsCalendarBar } from "@/lib/ops-calendar";

/**
 * 예약 상세 — 막대를 누르면 뜬다. **취소는 여기서만** 한다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「예약 취소」
 * 원본: `BuildingCalendar.jsx` 의 예약 상세 패널 + `window.confirm`
 *
 * ## 되돌릴 수 없다
 *
 * 취소는 **채널에도 그대로 나가고**, Beds24 에서 다시 `confirmed` 로 돌려도 손님에게 간
 * 취소 통지는 취소되지 않는다. 저쪽은 `window.confirm` 으로 한 번 물었다. 우리도 한 번 묻되
 * **무엇이 취소되는지**(손님·날짜)를 그 자리에 적는다 — 브라우저 기본 창에는 그게 안 들어간다.
 *
 * ## 사유는 선택이다
 *
 * 저쪽은 사유를 아예 안 받는다. 우리는 받되 **비워도 된다** — 필수로 만들면 급할 때
 * 아무 글자나 넣게 되고, 그러면 사유 칸이 쓸모없어진다. 적으면 Beds24 주석에 남는다.
 *
 * ## 이미 취소된 예약에는 버튼이 없다
 *
 * 다시 눌러 봐야 주석만 덧씌워진다. 「취소만 보기」에서 열면 상세만 보인다.
 */

export type ReservationCardCopy = {
  rcTitle: string;
  rcNights: string;
  rcChannel: string;
  rcCancelled: string;
  rcCancel: string;
  rcCancelConfirm: string;
  rcCancelWarning: string;
  rcReason: string;
  rcReasonPlaceholder: string;
  rcKeep: string;
  rcClose: string;
  rcPending: string;
  rcDone: string;
  rcErrForbidden: string;
  rcErrNotFound: string;
  rcErrAlreadyCancelled: string;
  rcErrNoBookingId: string;
  rcErrBeds24: string;
  rcErrCooldown: string;
};

const CHANNEL_LABEL: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  manual: "Direct",
};

function errorText(copy: ReservationCardCopy, result: Extract<CancelReservationResult, { ok: false }>) {
  switch (result.error) {
    case "forbidden":
      return copy.rcErrForbidden;
    case "not_found":
      return copy.rcErrNotFound;
    case "already_cancelled":
      return copy.rcErrAlreadyCancelled;
    case "no_booking_id":
      return copy.rcErrNoBookingId;
    case "cooldown":
      return copy.rcErrCooldown;
    default:
      return copy.rcErrBeds24;
  }
}

export function OpsReservationCard({
  bar,
  copy,
  nights,
  onClose,
  roomLabel,
}: {
  bar: OpsCalendarBar;
  copy: ReservationCardCopy;
  nights: number;
  onClose: () => void;
  roomLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cancel = () => {
    setMessage(copy.rcPending);
    startTransition(async () => {
      const result = await submitReservationCancel({ reason, reservationId: bar.id });
      if (result.ok) {
        setMessage(copy.rcDone);
        onClose();
        return;
      }
      setMessage(errorText(copy, result));
      setConfirming(false);
    });
  };

  return (
    <div aria-label={copy.rcTitle} aria-modal className="opsmb" onClick={onClose} role="dialog">
      <div className="opsmb__card opsrc" onClick={(event) => event.stopPropagation()} role="presentation">
        <div className="opsmb__head">
          <div className="opsmb__title">{bar.guestName}</div>
          {bar.isCancelled && <span className="opsrc__tag">{copy.rcCancelled}</span>}
          <button className="opsmb__x" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="opsmb__body">
          <dl className="opsrc__rows">
            <div>
              <dt>{copy.rcTitle}</dt>
              <dd>{roomLabel}</dd>
            </div>
            <div>
              <dt>{copy.rcChannel}</dt>
              <dd>{CHANNEL_LABEL[bar.channel] ?? bar.channel}</dd>
            </div>
            <div>
              <dt>{copy.rcNights.replace("{n}", String(nights))}</dt>
              <dd className="num">
                {bar.checkIn} → {bar.checkOut}
              </dd>
            </div>
          </dl>

          {/* 무엇이 취소되는지 그 자리에 적는다 — 브라우저 기본 확인창에는 안 들어간다. */}
          {confirming && (
            <>
              <div className="opsrc__warn">{copy.rcCancelWarning}</div>
              <label className="opsmb__field">
                <span className="opsmb__lbl">{copy.rcReason}</span>
                <input
                  className="opsmb__input"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={copy.rcReasonPlaceholder}
                  type="text"
                  value={reason}
                />
              </label>
            </>
          )}

          {message && <div className="opsmb__msg">{message}</div>}
        </div>

        <div className="opsmb__foot">
          {confirming ? (
            <>
              <button className="opsp__btn" onClick={() => setConfirming(false)} type="button">
                {copy.rcKeep}
              </button>
              <button
                className="opsp__btn go danger"
                disabled={pending}
                onClick={cancel}
                type="button"
              >
                {copy.rcCancelConfirm}
              </button>
            </>
          ) : (
            <>
              <button className="opsp__btn" onClick={onClose} type="button">
                {copy.rcClose}
              </button>
              {/* 이미 취소된 예약에는 버튼이 없다 — 다시 눌러야 주석만 덧씌워진다. */}
              {!bar.isCancelled && (
                <button
                  className="opsp__btn go danger"
                  onClick={() => setConfirming(true)}
                  type="button"
                >
                  {copy.rcCancel}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
