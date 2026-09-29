"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import {
  loadReservationDetail,
  submitReservationCancel,
  type CancelReservationResult,
} from "@/app/admin/ops/calendar/actions";
import { useRouter } from "next/navigation";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import {
  OpsReservationEditForm,
  type ReservationEditCopy,
} from "@/components/admin/ops/ops-reservation-edit";
import type { OpsCalendarBar } from "@/lib/ops-calendar";
import type { OpsReservationDetail } from "@/lib/ops-reservation-detail";

/**
 * 예약 상세 — 막대를 누르면 **오른쪽 사이드 패널**로 뜬다. **취소는 여기서만** 한다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「예약 상세」 · 「예약 취소」
 * 원본: `BuildingCalendar.jsx` 의 `ReservationDetailModal` + `window.confirm`
 *
 * ## 가져올 수 있는 것은 전부 보여준다 (2026-09-28)
 *
 * 처음에는 객실·채널·날짜 세 줄뿐인 가운데 카드였다. 콘솔의 상세는 전부 공용 `.panel` 이고,
 * 무엇보다 **손님에게 연락하거나 채널과 이야기하려면** 연락처·채널 예약번호·요청 사항이
 * 필요하다(사용자 지적). 막대를 누르면 그 한 건만 서버에서 읽어(`loadReservationDetail`)
 * 손님 · 금액 · 메시지 · 예약 이력을 섹션으로 나눠 보여준다. **빈 값은 줄째 숨긴다.**
 *
 * 머리글(손님·방·날짜·채널)은 격자가 이미 들고 있으므로 **읽기를 기다리지 않고** 바로 그린다.
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

export type ReservationCardCopy = ReservationEditCopy & {
  reEdit: string;
  reSaved: string;
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
  rpTitle: string;
  rpLoading: string;
  rpLoadFailed: string;
  rpSectionStay: string;
  rpCheckIn: string;
  rpCheckOut: string;
  rpArrivalTime: string;
  rpLeadTime: string;
  rpGuests: string;
  rpGuestsValue: string;
  rpSectionMoney: string;
  rpTotal: string;
  rpCommission: string;
  rpNet: string;
  rpPerNight: string;
  rpRate: string;
  rpMoneyCancelled: string;
  rpSectionGuest: string;
  rpEmail: string;
  rpPhone: string;
  rpMobile: string;
  rpCountry: string;
  rpCountryFromPhone: string;
  rpLanguage: string;
  rpAddress: string;
  rpSectionMessages: string;
  rpComments: string;
  rpNotes: string;
  rpChannelMessage: string;
  rpSectionBooking: string;
  rpChannelRef: string;
  rpBeds24Id: string;
  rpGroup: string;
  rpFlag: string;
  rpBookedAt: string;
  rpModifiedAt: string;
  rpCancelledAt: string;
  rpCopy: string;
  rpCopied: string;
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

/** `YYYY-MM-DD` → 「10월 11일 (일)」 — 도쿄 기준. */
function stayDate(date: string, localeTag: string): { day: string; weekday: string } {
  const at = new Date(`${date}T12:00:00+09:00`);
  return {
    day: new Intl.DateTimeFormat(localeTag, { day: "numeric", month: "short", timeZone: "Asia/Tokyo" }).format(at),
    weekday: new Intl.DateTimeFormat(localeTag, { timeZone: "Asia/Tokyo", weekday: "short" }).format(at),
  };
}

/** ISO 시각(UTC) → 도쿄 시각. Beds24 는 UTC 로 준다 — 그대로 보이면 9시간 틀린다. */
function stamp(iso: string, localeTag: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(at);
}

/** 도쿄 날짜 사이의 일수. 예약이 체크인 며칠 전에 들어왔는가. */
function daysBetween(fromIso: string, toDate: string): number | null {
  const booked = new Date(fromIso);
  if (Number.isNaN(booked.getTime())) return null;
  const bookedDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(booked);
  const diff = Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${bookedDay}T00:00:00Z`);
  return Number.isFinite(diff) ? Math.round(diff / 86_400_000) : null;
}

function regionName(code: string, localeTag: string): string {
  try {
    return new Intl.DisplayNames([localeTag], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function languageName(code: string, localeTag: string): string {
  try {
    return new Intl.DisplayNames([localeTag], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** `KR` → 🇰🇷. 국가를 글자보다 먼저 알아보게 한다. */
function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

const money = (value: number) => `¥${Math.round(value).toLocaleString()}`;

export function OpsReservationPanel({
  bar,
  copy,
  localeTag,
  nights,
  onClose,
  propertyName,
  roomIds,
  roomKey,
  roomLabel,
  today,
}: {
  bar: OpsCalendarBar;
  copy: ReservationCardCopy;
  localeTag: string;
  nights: number;
  onClose: () => void;
  propertyName: string;
  /** 예약 수정의 겹침 검사가 쓴다 — 그 행의 우리 `rooms.id`. */
  roomIds: string[];
  roomKey: string;
  roomLabel: string;
  today: string;
}) {
  const router = useRouter();
  /** 보기 / 고치기. 고치는 동안은 본문·하단을 편집 폼이 차지한다. */
  const [editing, setEditing] = useState(false);
  /** 고친 뒤 상세를 다시 읽게 하는 신호. */
  const [reloadKey, setReloadKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<OpsReservationDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const cancelBoxRef = useRef<HTMLElement | null>(null);

  // 확인 상자는 본문 맨 아래에 생긴다. 스크롤이 위에 있으면 눌러도 아무 일 없는 것처럼 보인다.
  useEffect(() => {
    if (confirming) cancelBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [confirming]);
  // Esc · 포커스 · 스크롤 잠금은 콘솔 패널 공용 훅이 한다. 취소를 보내는 중에는 닫히지 않는다.
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled: pending || editing });

  // 누른 한 건만 읽는다. 머리글은 격자 값으로 먼저 그려 두었으므로 기다리는 동안도 비지 않는다.
  useEffect(() => {
    let alive = true;
    void loadReservationDetail(bar.id).then((result) => {
      if (!alive) return;
      if (result.ok) setDetail(result.detail);
      else setLoadFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [bar.id, reloadKey]);

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

  const copyValue = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    });
  };

  /** 값이 있는 줄만. 복사가 필요한 값(연락처·번호)에는 복사 버튼을 붙인다. */
  const row = (key: string, label: string, value: ReactNode, copyText?: string | null) =>
    value === null || value === undefined || value === "" ? null : (
      <div className="opsrp__row" key={key}>
        <dt>{label}</dt>
        <dd>
          <span className="opsrp__val">{value}</span>
          {copyText && (
            <button
              aria-label={`${copy.rpCopy} ${label}`}
              className={`opsrp__copy${copied === key ? " on" : ""}`}
              onClick={() => copyValue(key, copyText)}
              title={copied === key ? copy.rpCopied : copy.rpCopy}
              type="button"
            >
              {copied === key ? <Check aria-hidden /> : <Copy aria-hidden />}
            </button>
          )}
        </dd>
      </div>
    );

  const checkIn = stayDate(bar.checkIn, localeTag);
  const checkOut = stayDate(bar.checkOut, localeTag);
  const channelName = detail?.channelName ?? CHANNEL_LABEL[bar.channel] ?? bar.channel;
  const guestCount =
    detail && detail.numAdult !== null
      ? copy.rpGuestsValue
          .replace("{adults}", String(detail.numAdult))
          .replace("{children}", String(detail.numChild ?? 0))
      : null;
  const net =
    detail && detail.price !== null && detail.commission !== null
      ? detail.price - detail.commission
      : null;
  const leadDays = detail?.bookedAt ? daysBetween(detail.bookedAt, bar.checkIn) : null;

  return (
    <>
      <div className="panel-scrim" onClick={pending ? undefined : onClose} />
      <aside
        aria-label={copy.rpTitle}
        aria-modal="true"
        className="panel opsrp"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{copy.rpTitle}</span>
            <button
              aria-label={copy.rcClose}
              className="panel__x"
              disabled={pending}
              onClick={onClose}
              type="button"
            >
              <X />
            </button>
          </div>
          <div className="opsrp__name">{bar.guestName}</div>
          <div className="opsrp__where">
            {propertyName} · {roomLabel}
          </div>
          <div className="panel__chips">
            <span className={`opsrp__chan ${bar.channel}`}>{channelName}</span>
            {bar.isCancelled && <span className="opsrp__tag cancelled">{copy.rcCancelled}</span>}
            <span className="opsrp__tag">{copy.rcNights.replace("{n}", String(nights))}</span>
            {guestCount && <span className="opsrp__tag">{guestCount}</span>}
          </div>
        </div>

        {editing && detail ? (
          <OpsReservationEditForm
            channel={bar.channel}
            copy={copy}
            detail={detail}
            localeTag={localeTag}
            onDiscard={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              setMessage(copy.reSaved);
              // 상세는 다시 읽고, 격자(막대 이름·날짜)는 서버 데이터만 다시 받는다.
              setReloadKey((key) => key + 1);
              router.refresh();
            }}
            reservationId={bar.id}
            roomIds={roomIds}
            roomKey={roomKey}
            today={today}
          />
        ) : (
        <>
        <div className="panel__body opsrp__body">
          {/* ── 숙박 ── 격자 값만으로 그린다. 읽기를 기다리지 않는다. */}
          <section className="opsrp__sec">
            <div className="opsrp__stay">
              <div className="opsrp__node">
                <span className="opsrp__nl">{copy.rpCheckIn}</span>
                <strong>{checkIn.day}</strong>
                <span className="opsrp__wd">{checkIn.weekday}</span>
              </div>
              <div className="opsrp__line">
                <span>{copy.rcNights.replace("{n}", String(nights))}</span>
              </div>
              <div className="opsrp__node">
                <span className="opsrp__nl">{copy.rpCheckOut}</span>
                <strong>{checkOut.day}</strong>
                <span className="opsrp__wd">{checkOut.weekday}</span>
              </div>
            </div>
            {detail && (
              <dl className="opsrp__kv">
                {row("arrival", copy.rpArrivalTime, detail.arrivalTime)}
                {row("guests", copy.rpGuests, guestCount)}
              </dl>
            )}
            {/* 며칠 전에 잡았나 — 막판 예약인지가 가격 판단에 바로 걸린다. */}
            {leadDays !== null && leadDays >= 0 && (
              <p className="opsrp__note">{copy.rpLeadTime.replace("{n}", String(leadDays))}</p>
            )}
          </section>

          {!detail && !loadFailed && (
            <div aria-busy className="opsrp__loading">
              <span className="opsrp__spin" aria-hidden />
              {copy.rpLoading}
            </div>
          )}
          {loadFailed && <p className="opsrp__err">{copy.rpLoadFailed}</p>}

          {detail && (
            <>
              {/* ── 금액 ── */}
              {(detail.price !== null || detail.rateDescription) && (
                <section className="opsrp__sec">
                  <h3 className="opsrp__h">{copy.rpSectionMoney}</h3>
                  {detail.price !== null && (
                    <div className="opsrp__money">
                      <div className="opsrp__total">
                        <span>{copy.rpTotal}</span>
                        <strong>{money(detail.price)}</strong>
                      </div>
                      <dl className="opsrp__kv">
                        {row(
                          "commission",
                          copy.rpCommission,
                          detail.commission !== null ? `− ${money(detail.commission)}` : null,
                        )}
                        {row("net", copy.rpNet, net !== null ? money(net) : null)}
                        {row(
                          "per",
                          copy.rpPerNight,
                          nights > 0 && detail.price > 0 ? money(detail.price / nights) : null,
                        )}
                      </dl>
                    </div>
                  )}
                  {/* 취소되면 Beds24 가 금액을 0 으로 바꾼다 — 0원 매출로 오해하지 않게 적는다. */}
                  {bar.isCancelled && detail.price === 0 && (
                    <p className="opsrp__note">{copy.rpMoneyCancelled}</p>
                  )}
                  {detail.rateDescription && (
                    <details className="opsrp__more">
                      <summary>{copy.rpRate}</summary>
                      <p className="opsrp__pre">{detail.rateDescription}</p>
                    </details>
                  )}
                </section>
              )}

              {/* ── 손님 ── */}
              <section className="opsrp__sec">
                <h3 className="opsrp__h">{copy.rpSectionGuest}</h3>
                <dl className="opsrp__kv">
                  {row("email", copy.rpEmail, detail.email, detail.email)}
                  {row("phone", copy.rpPhone, detail.phone, detail.phone)}
                  {row("mobile", copy.rpMobile, detail.mobile, detail.mobile)}
                  {row(
                    "country",
                    copy.rpCountry,
                    detail.countryCode ? (
                      <>
                        {flagEmoji(detail.countryCode)} {regionName(detail.countryCode, localeTag)}
                        {/* 채널이 안 준 국가는 전화번호로 추정한 것이다 — 국적과 다를 수 있다. */}
                        {detail.countrySource === "phone" && (
                          <span className="opsrp__est">{copy.rpCountryFromPhone}</span>
                        )}
                      </>
                    ) : (
                      detail.countryText
                    ),
                  )}
                  {row(
                    "lang",
                    copy.rpLanguage,
                    detail.language ? languageName(detail.language, localeTag) : null,
                  )}
                  {row("address", copy.rpAddress, detail.address, detail.address)}
                </dl>
              </section>

              {/* ── 메시지 ── 길다. 손님 요청이 제일 자주 쓰이므로 펼쳐 두고 나머지는 접는다. */}
              {(detail.guestComments || detail.internalNotes || detail.channelMessage) && (
                <section className="opsrp__sec">
                  <h3 className="opsrp__h">{copy.rpSectionMessages}</h3>
                  {detail.guestComments && (
                    <div className="opsrp__msgbox">
                      <span className="opsrp__ml">{copy.rpComments}</span>
                      <p className="opsrp__pre">{detail.guestComments}</p>
                    </div>
                  )}
                  {detail.internalNotes && (
                    <div className="opsrp__msgbox note">
                      <span className="opsrp__ml">{copy.rpNotes}</span>
                      <p className="opsrp__pre">{detail.internalNotes}</p>
                    </div>
                  )}
                  {detail.channelMessage && (
                    <details className="opsrp__more">
                      <summary>{copy.rpChannelMessage}</summary>
                      <p className="opsrp__pre">{detail.channelMessage}</p>
                    </details>
                  )}
                </section>
              )}

              {/* ── 예약 ── 채널·Beds24 와 이야기할 때 쓰는 번호들. */}
              <section className="opsrp__sec">
                <h3 className="opsrp__h">{copy.rpSectionBooking}</h3>
                <dl className="opsrp__kv">
                  {row("chan", copy.rcChannel, channelName)}
                  {row("ref", copy.rpChannelRef, detail.channelReference, detail.channelReference)}
                  {row("b24", copy.rpBeds24Id, detail.beds24Id, detail.beds24Id)}
                  {row("group", copy.rpGroup, detail.groupMasterId)}
                  {row("flag", copy.rpFlag, detail.flagText)}
                  {row("booked", copy.rpBookedAt, detail.bookedAt ? stamp(detail.bookedAt, localeTag) : null)}
                  {row(
                    "modified",
                    copy.rpModifiedAt,
                    detail.modifiedAt && detail.modifiedAt !== detail.bookedAt
                      ? stamp(detail.modifiedAt, localeTag)
                      : null,
                  )}
                  {row(
                    "cancelled",
                    copy.rpCancelledAt,
                    detail.cancelledAt ? stamp(detail.cancelledAt, localeTag) : null,
                  )}
                </dl>
              </section>
            </>
          )}

          {/* 무엇이 취소되는지 그 자리에 적는다 — 브라우저 기본 확인창에는 안 들어간다. */}
          {confirming && (
            <section className="opsrp__sec opsrp__cancelbox" ref={cancelBoxRef}>
              <div className="opsrp__warn">{copy.rcCancelWarning}</div>
              <div className="fld">
                <label className="fld__l" htmlFor="opsrp-reason">
                  {copy.rcReason}
                </label>
                <input
                  id="opsrp-reason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={copy.rcReasonPlaceholder}
                  type="text"
                  value={reason}
                />
              </div>
            </section>
          )}

          {message && (
            <p className={message === copy.reSaved ? "opsrp__ok" : "opsrp__err"}>{message}</p>
          )}
        </div>

        <div className="panel__foot">
          {confirming ? (
            <>
              <button className="btn btn--subtle" disabled={pending} onClick={() => setConfirming(false)} type="button">
                {copy.rcKeep}
              </button>
              <button className="btn opsrp__danger" disabled={pending} onClick={cancel} type="button">
                {copy.rcCancelConfirm}
              </button>
            </>
          ) : (
            <>
              {/* 취소된 예약은 고치지도, 다시 취소하지도 않는다 — 닫기만. */}
              {bar.isCancelled ? (
                <button className="btn btn--subtle" onClick={onClose} type="button">
                  {copy.rcClose}
                </button>
              ) : (
                <>
                  <button
                    className="btn btn--subtle"
                    // 원래 값이 있어야 무엇이 바뀌었는지 안다 — 상세를 읽은 뒤에만.
                    disabled={!detail}
                    onClick={() => {
                      setMessage(null);
                      setEditing(true);
                    }}
                    type="button"
                  >
                    {copy.reEdit}
                  </button>
                  <button className="btn btn--danger-ghost" onClick={() => setConfirming(true)} type="button">
                    {copy.rcCancel}
                  </button>
                </>
              )}
            </>
          )}
        </div>
        </>
        )}
      </aside>
    </>
  );
}
