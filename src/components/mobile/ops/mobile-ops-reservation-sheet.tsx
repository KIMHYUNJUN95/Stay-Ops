"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Mail, Phone } from "lucide-react";
import {
  loadReservationDetail,
  submitReservationCancel,
  submitReservationEdit,
} from "@/app/admin/ops/calendar/actions";
import { useRoomAvailability } from "@/components/admin/ops/use-room-availability";
import { reservationCancelErrorText, type ReservationCardCopy } from "@/components/admin/ops/ops-reservation-panel";
import { CHANNEL_NAME, reservationEditErrorText } from "@/components/admin/ops/ops-reservation-edit";
import { MobileStayDates, MobileStepper } from "@/components/mobile/ops/mobile-ops-form";
import {
  canEditStay,
  diffBookingEdit,
  validateBookingEdit,
  type BookingEditDraft,
} from "@/lib/ops-booking-edit";
import type { OpsCalendarBar } from "@/lib/ops-calendar";
import { stayNights } from "@/lib/ops-manual-booking";
import type { OpsReservationDetail } from "@/lib/ops-reservation-detail";

/**
 * 모바일 예약 시트 — 상세 · 수정 · 취소. Claude Design 시안 `5a 예약 상세 · 수기 예약 시트 v3`(5a~5d, 2026-10-02 사용자 확정).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「모바일 판매 캘린더」 → 예약 시트 v3
 *
 * **데이터 · 서버 경로는 데스크톱 예약 패널과 같다**(`loadReservationDetail` · `submitReservationEdit` ·
 * `submitReservationCancel`, 수정 규칙 `ops-booking-edit` — 채널 예약은 날짜 잠김). 모양만 모바일로:
 *
 * - 위: 이름 · 객실 · 채널/박/인원 · 숙박(체크인 ─ N박 ─ 체크아웃 · 도착 예정) · 금액(총액 + 수수료 · 실수령 · 1박 평균) ·
 *   **빠른 연락**(전화 걸기 · 메일 쓰기 · 예약번호 복사) · 손님 요청.
 * - 접힌 묶음: 손님 정보 · 예약 정보(머리에 한 줄 요약) · 내부 메모 · 채널 메시지.
 * - 불러오는 동안은 최종 배치와 같은 자리표시(시트 높이 고정이라 다 와도 튀지 않는다).
 * - 수정: 인원 −/+ · 수기 예약만 날짜(앱 날짜 시트) · 채널 예약은 날짜 잠김 줄. 취소: 빨간 카드 + 사유.
 * - 저장 · 취소가 되면 부모가 시트를 닫고 알림을 띄운다.
 */

export type MobileReservationSheetCopy = ReservationCardCopy & {
  mrArrival: string;
  mrRefCopy: string;
  mrGuestInfo: string;
  mrBookingInfo: string;
  mrBookedSummary: string;
  mrDates: string;
  mrCancelHead: string;
  mrCancelBig: string;
  dateNext: string;
  datePrev: string;
  today: string;
};

const CHANNEL_LABEL: Record<string, string> = { airbnb: "Airbnb", booking: "Booking.com", manual: "Direct" };
const money = (value: number) => `¥${Math.round(value).toLocaleString("ja-JP")}`;
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function weekday(date: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, { timeZone: "Asia/Tokyo", weekday: "short" }).format(
    new Date(`${date}T12:00:00+09:00`),
  );
}
function stamp(iso: string, localeTag: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(localeTag, { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(at);
}
function daysBetween(fromIso: string, toDate: string): number | null {
  const booked = new Date(fromIso);
  if (Number.isNaN(booked.getTime())) return null;
  const bookedDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(booked);
  const diff = Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${bookedDay}T00:00:00Z`);
  return Number.isFinite(diff) ? Math.round(diff / 86_400_000) : null;
}
function displayName(code: string, localeTag: string, type: "region" | "language") {
  try {
    return new Intl.DisplayNames([localeTag], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function MobileOpsReservationSheet({
  bar,
  copy,
  localeTag,
  nights,
  onCancelled,
  onSaved,
  propertyName,
  roomIds,
  roomKey,
  roomLabel,
  today,
}: {
  bar: OpsCalendarBar;
  copy: MobileReservationSheetCopy;
  localeTag: string;
  nights: number;
  /** 취소 성공 — 부모가 시트를 닫고 알림. */
  onCancelled: () => void;
  /** 수정 저장 — 부모가 시트를 닫고 알림. */
  onSaved: () => void;
  propertyName: string;
  roomIds: string[];
  roomKey: string;
  roomLabel: string;
  today: string;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "cancel">("view");
  const [detail, setDetail] = useState<OpsReservationDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState<{ guest: boolean; booking: boolean }>({ booking: false, guest: false });
  const [copied, setCopied] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
  }, [bar.id]);

  const channelName = detail?.channelName ?? CHANNEL_LABEL[bar.channel] ?? bar.channel;
  const chClass = bar.channel === "airbnb" ? "abnb" : bar.channel === "booking" ? "bkng" : "dir";
  const guests =
    detail && detail.numAdult !== null
      ? copy.rpGuestsValue.replace("{adults}", String(detail.numAdult)).replace("{children}", String(detail.numChild ?? 0))
      : null;
  const net = detail && detail.price !== null && detail.commission !== null ? detail.price - detail.commission : null;
  const perNight = detail && detail.price !== null && nights > 0 ? detail.price / nights : null;
  const phone = detail?.phone || detail?.mobile || null;
  const reference = detail?.channelReference || detail?.beds24Id || null;
  const leadDays = detail?.bookedAt ? daysBetween(detail.bookedAt, bar.checkIn) : null;

  const copyValue = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    });
  };

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitReservationCancel({ reason, reservationId: bar.id });
      if (result.ok) {
        onCancelled();
        return;
      }
      setError(reservationCancelErrorText(copy, result));
      setMode("view");
    });
  };

  const head = (
    <div className="mrs-head">
      <h3>{bar.guestName}</h3>
      <p>
        {propertyName} {roomLabel}
      </p>
      <div className="mrs-tags">
        <span className={chClass}>{channelName}</span>
        {bar.isCancelled && <span className="cxl">{copy.rcCancelled}</span>}
        <span>{copy.rcNights.replace("{n}", String(nights))}</span>
        {guests && <span>{guests}</span>}
      </div>
    </div>
  );

  if (mode === "edit" && detail) {
    return (
      <MobileReservationEdit
        bar={bar}
        copy={copy}
        detail={detail}
        localeTag={localeTag}
        onDiscard={() => setMode("view")}
        onSaved={onSaved}
        propertyName={propertyName}
        roomIds={roomIds}
        roomKey={roomKey}
        roomLabel={roomLabel}
        today={today}
      />
    );
  }

  const row = (key: string, label: string, value: string | null, copyText?: string | null) =>
    value ? (
      <div className="mrs-kv" key={key}>
        <span className="k">{label}</span>
        <span className="v">{value}</span>
        {copyText && (
          <button className="cp" onClick={() => copyValue(key, copyText)} type="button">
            {copied === key ? copy.rpCopied : copy.rpCopy}
          </button>
        )}
      </div>
    ) : null;

  const countryText = detail?.countryCode ? displayName(detail.countryCode, localeTag, "region") : (detail?.countryText ?? null);
  const languageText = detail?.language ? displayName(detail.language, localeTag, "language") : null;

  return (
    <div className="mps mops-vars">
      <div className="mps-body">
        {head}

        {mode === "cancel" ? (
          <>
            <div className="mrs-warn" role="alert">
              <div className="k">{copy.mrCancelHead}</div>
              <div className="big">{copy.mrCancelBig.replace("{channel}", channelName)}</div>
              <p>{copy.rcCancelWarning}</p>
            </div>
            <label className="mfm-field">
              <span className="mfm-l">{copy.rcReason}</span>
              <input
                className="mfm-in"
                enterKeyHint="done"
                onChange={(event) => setReason(event.target.value)}
                placeholder={copy.rcReasonPlaceholder}
                type="text"
                value={reason}
              />
            </label>
          </>
        ) : (
          <>
            <div className="mrs-stay">
              <div className="node">
                <span className="l">{copy.rpCheckIn}</span>
                <span className="v">{md(bar.checkIn)}</span>
                <span className="w">
                  {weekday(bar.checkIn, localeTag)}
                  {detail?.arrivalTime ? ` · ${copy.mrArrival.replace("{time}", detail.arrivalTime)}` : ""}
                </span>
              </div>
              <div className="mid">
                {copy.rcNights.replace("{n}", String(nights))}
                <i aria-hidden="true" />
              </div>
              <div className="node end">
                <span className="l">{copy.rpCheckOut}</span>
                <span className="v">{md(bar.checkOut)}</span>
                <span className="w">{weekday(bar.checkOut, localeTag)}</span>
              </div>
            </div>

            {!detail && !loadFailed && (
              // 최종 배치와 같은 자리표시 — 다 와도 튀지 않는다.
              <>
                <div aria-busy="true" className="mrs-sk">
                  <span className="mrs-bone" style={{ height: 12, width: "30%" }} />
                  <span className="mrs-bone" style={{ height: 24, width: "55%" }} />
                  <span className="mrs-bone" style={{ height: 40 }} />
                </div>
                <div className="mrs-sk three">
                  <span className="mrs-bone" style={{ height: 42 }} />
                  <span className="mrs-bone" style={{ height: 42 }} />
                  <span className="mrs-bone" style={{ height: 42 }} />
                </div>
              </>
            )}
            {loadFailed && (
              <div className="mps-note danger" role="alert">
                <i aria-hidden="true" />
                {copy.rpLoadFailed}
              </div>
            )}

            {detail && (
              <>
                {detail.price !== null && (
                  <div className="mrs-money">
                    <div className="tot">
                      <span>{copy.rpTotal}</span>
                      <b>{money(detail.price)}</b>
                    </div>
                    <div className="row">
                      <div className="neg">
                        <span>{copy.rpCommission}</span>
                        <b>{detail.commission !== null ? `−${money(detail.commission)}` : "—"}</b>
                      </div>
                      <div>
                        <span>{copy.rpNet}</span>
                        <b>{net !== null ? money(net) : "—"}</b>
                      </div>
                      <div>
                        <span>{copy.rpPerNight}</span>
                        <b>{perNight !== null ? money(perNight) : "—"}</b>
                      </div>
                    </div>
                  </div>
                )}
                {bar.isCancelled && detail.price === 0 && <p className="mps-ch">{copy.rpMoneyCancelled}</p>}

                {/* 빠른 연락 — 없는 값은 흐리게(누를 수 없음). */}
                <div className="mrs-act">
                  {phone ? (
                    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                      <Phone aria-hidden="true" />
                      {copy.rpPhone}
                    </a>
                  ) : (
                    <span className="off">
                      <Phone aria-hidden="true" />
                      {copy.rpPhone}
                    </span>
                  )}
                  {detail.email ? (
                    <a href={`mailto:${detail.email}`}>
                      <Mail aria-hidden="true" />
                      {copy.rpEmail}
                    </a>
                  ) : (
                    <span className="off">
                      <Mail aria-hidden="true" />
                      {copy.rpEmail}
                    </span>
                  )}
                  <button disabled={!reference} onClick={() => reference && copyValue("ref", reference)} type="button">
                    <Copy aria-hidden="true" />
                    {copied === "ref" ? copy.rpCopied : copy.mrRefCopy}
                  </button>
                </div>

                {detail.guestComments && (
                  <div className="mrs-msg">
                    <span className="l">{copy.rpComments}</span>
                    <p>{detail.guestComments}</p>
                  </div>
                )}

                <div className="mrs-fold">
                  <button aria-expanded={open.guest} onClick={() => setOpen((o) => ({ ...o, guest: !o.guest }))} type="button">
                    <span>
                      {copy.mrGuestInfo}
                      <small>{[countryText, languageText].filter(Boolean).join(" · ")}</small>
                    </span>
                    <i aria-hidden="true">{open.guest ? "⌃" : "›"}</i>
                  </button>
                  {open.guest && (
                    <div className="b">
                      {row("email", copy.rpEmail, detail.email, detail.email)}
                      {row("phone", copy.rpPhone, detail.phone, detail.phone)}
                      {row("mobile", copy.rpMobile, detail.mobile, detail.mobile)}
                      {row(
                        "country",
                        copy.rpCountry,
                        countryText
                          ? `${countryText}${detail.countrySource === "phone" ? ` · ${copy.rpCountryFromPhone}` : ""}`
                          : null,
                      )}
                      {row("lang", copy.rpLanguage, languageText)}
                      {row("addr", copy.rpAddress, detail.address)}
                      {detail.internalNotes && (
                        <div className="mrs-msg note">
                          <span className="l">{copy.rpNotes}</span>
                          <p>{detail.internalNotes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mrs-fold">
                  <button aria-expanded={open.booking} onClick={() => setOpen((o) => ({ ...o, booking: !o.booking }))} type="button">
                    <span>
                      {copy.mrBookingInfo}
                      {detail.bookedAt && (
                        <small>
                          {leadDays !== null
                            ? copy.mrBookedSummary
                                .replace("{at}", stamp(detail.bookedAt, localeTag))
                                .replace("{n}", String(leadDays))
                            : stamp(detail.bookedAt, localeTag)}
                        </small>
                      )}
                    </span>
                    <i aria-hidden="true">{open.booking ? "⌃" : "›"}</i>
                  </button>
                  {open.booking && (
                    <div className="b">
                      {row("chan", copy.rcChannel, channelName)}
                      {row("ref", copy.rpChannelRef, detail.channelReference, detail.channelReference)}
                      {row("b24", copy.rpBeds24Id, detail.beds24Id, detail.beds24Id)}
                      {row("group", copy.rpGroup, detail.groupMasterId)}
                      {row("flag", copy.rpFlag, detail.flagText)}
                      {row("booked", copy.rpBookedAt, detail.bookedAt ? stamp(detail.bookedAt, localeTag) : null)}
                      {row("mod", copy.rpModifiedAt, detail.modifiedAt ? stamp(detail.modifiedAt, localeTag) : null)}
                      {row("cxl", copy.rpCancelledAt, detail.cancelledAt ? stamp(detail.cancelledAt, localeTag) : null)}
                      {detail.channelMessage && (
                        <div className="mrs-msg note">
                          <span className="l">{copy.rpChannelMessage}</span>
                          <p>{detail.channelMessage}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {error && (
          <div className="mps-note danger" role="alert">
            <i aria-hidden="true" />
            {error}
          </div>
        )}
      </div>

      {!bar.isCancelled && (
        <div className="mps-foot">
          {mode === "cancel" ? (
            <>
              <button className="mps-btn ghost" disabled={pending} onClick={() => setMode("view")} type="button">
                {copy.rcKeep}
              </button>
              <button className="mps-btn main danger" disabled={pending} onClick={cancel} type="button">
                {copy.rcCancelConfirm}
              </button>
            </>
          ) : (
            <div className="mrs-foot2">
              <button className="mps-btn ghost" disabled={!detail} onClick={() => setMode("edit")} type="button">
                {copy.reEdit}
              </button>
              <button className="mps-btn dg" onClick={() => setMode("cancel")} type="button">
                {copy.rcCancel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 수정 — 데스크톱 수정 폼(`OpsReservationEditForm`)과 같은 규칙 · 같은 서버 액션, 모바일 모양. */
function MobileReservationEdit({
  bar,
  copy,
  detail,
  localeTag,
  onDiscard,
  onSaved,
  propertyName,
  roomIds,
  roomKey,
  roomLabel,
  today,
}: {
  bar: OpsCalendarBar;
  copy: MobileReservationSheetCopy;
  detail: OpsReservationDetail;
  localeTag: string;
  onDiscard: () => void;
  onSaved: () => void;
  propertyName: string;
  roomIds: string[];
  roomKey: string;
  roomLabel: string;
  today: string;
}) {
  const channel = bar.channel;
  const original: BookingEditDraft = {
    arrival: detail.checkIn,
    departure: detail.checkOut,
    email: detail.email ?? "",
    guestName: detail.guestName,
    notes: detail.internalNotes ?? "",
    numAdult: detail.numAdult ?? 1,
    numChild: detail.numChild ?? 0,
    phone: detail.phone ?? "",
    totalPrice: detail.price,
  };
  const [draft, setDraft] = useState<BookingEditDraft>(original);
  const [priceText, setPriceText] = useState(original.totalPrice === null ? "" : String(original.totalPrice));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stayEditable = canEditStay(channel);
  const availability = useRoomAvailability({
    allowedStart: original.arrival < today ? original.arrival : undefined,
    excludeReservationId: bar.id,
    roomIds,
    roomKey,
    seedMonths: [original.arrival.slice(0, 7), original.departure.slice(0, 7)],
    today,
  });
  const set = <K extends keyof BookingEditDraft>(key: K, value: BookingEditDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const nights = stayNights(draft.arrival, draft.departure);
  const taken = stayEditable ? availability.takenIn(nights) : [];
  const changes = diffBookingEdit(original, draft);
  const localError = validateBookingEdit({ changes, channel, original, today });

  const save = () => {
    if (localError) {
      setError(reservationEditErrorText(copy, localError, [], channel));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitReservationEdit({ changes, reservationId: bar.id, roomIds, roomKey });
      if (result.ok) {
        onSaved();
        return;
      }
      setError(reservationEditErrorText(copy, result.error, result.conflictDates, channel));
    });
  };

  const field = (label: string, input: React.ReactNode, hint?: string | null) => (
    <label className="mfm-field">
      <span className="mfm-l">{label}</span>
      {input}
      {hint && <span className="mfm-hint">{hint}</span>}
    </label>
  );

  return (
    <div className="mps mops-vars">
      <div className="mps-body">
        <div className="mps-head">
          <div className="mps-head__t">
            <h3>{copy.reTitle}</h3>
            <p>
              <b>{bar.guestName}</b> · {propertyName} {roomLabel}
            </p>
          </div>
          <span className="mps-cnt">{CHANNEL_NAME[channel]}</span>
        </div>

        {stayEditable ? (
          <div className="mfm-field">
            <span className="mfm-l">
              {copy.mbCheckIn} → {copy.mbCheckOut} · {copy.mbNights.replace("{n}", String(nights.length))}
            </span>
            <MobileStayDates
              arrival={draft.arrival}
              checkInLabel={copy.mbCheckIn}
              checkOutLabel={copy.mbCheckOut}
              departure={draft.departure}
              labels={{ nextMonth: copy.dateNext, prevMonth: copy.datePrev, today: copy.today }}
              locale={localeTag}
              onChange={(arrival, departure) => setDraft((previous) => ({ ...previous, arrival, departure }))}
              today={today}
            />
            {taken.length > 0 && (
              <span className="mfm-hint bad">
                {copy.mbErrNightsTaken.replace("{dates}", taken.map((night) => night.slice(5).replace("-", "/")).join(", "))}
              </span>
            )}
          </div>
        ) : (
          <div className="mrs-lock">
            <b>{copy.mrDates}</b>
            <span>
              {md(detail.checkIn)} → {md(detail.checkOut)} · {copy.reChannelLocked.replaceAll("{channel}", CHANNEL_NAME[channel])}
            </span>
          </div>
        )}

        {field(
          copy.mbGuest,
          <input className="mfm-in" onChange={(event) => set("guestName", event.target.value)} type="text" value={draft.guestName} />,
        )}
        <div className="mfm-two">
          <MobileStepper label={copy.mbAdults} min={1} onChange={(value) => set("numAdult", value)} value={draft.numAdult} />
          <MobileStepper label={copy.mbChildren} min={0} onChange={(value) => set("numChild", value)} value={draft.numChild} />
        </div>
        {field(
          copy.mbTotal,
          <span className="mfm-money">
            <span aria-hidden="true">¥</span>
            <input
              inputMode="numeric"
              onChange={(event) => {
                setPriceText(event.target.value);
                const trimmed = event.target.value.trim();
                set("totalPrice", trimmed === "" ? null : Number(trimmed));
              }}
              type="number"
              value={priceText}
            />
          </span>,
          stayEditable ? null : copy.reChannelPriceNote.replaceAll("{channel}", CHANNEL_NAME[channel]),
        )}
        <div className="mfm-two">
          {field(copy.mbPhone, <input className="mfm-in" onChange={(event) => set("phone", event.target.value)} type="tel" value={draft.phone} />)}
          {field(copy.mbEmail, <input className="mfm-in" onChange={(event) => set("email", event.target.value)} type="email" value={draft.email} />)}
        </div>
        {field(
          copy.rpNotes,
          <textarea className="mfm-in area" onChange={(event) => set("notes", event.target.value)} rows={3} value={draft.notes} />,
          copy.reNotesHint,
        )}

        {error && (
          <div className="mps-note danger" role="alert">
            <i aria-hidden="true" />
            {error}
          </div>
        )}
      </div>
      <div className="mps-foot">
        <button className="mps-btn ghost" disabled={pending} onClick={onDiscard} type="button">
          {copy.reDiscard}
        </button>
        <button
          className="mps-btn main"
          disabled={pending || localError === "no_changes" || taken.length > 0}
          onClick={save}
          type="button"
        >
          {copy.reSave}
        </button>
      </div>
    </div>
  );
}
