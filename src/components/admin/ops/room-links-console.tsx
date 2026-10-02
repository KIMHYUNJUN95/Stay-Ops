"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, MapPin, Pencil, Search } from "lucide-react";
import { saveRoomListingLink, type SaveRoomLinkResult } from "@/app/admin/ops/room-links/actions";
import type { Dictionary } from "@/lib/i18n";
import type { RoomLinksPageData, RoomLinkUnitView, RoomLinkView } from "@/lib/room-links";
import type { RoomLinkChannel } from "@/lib/room-links-model";
import "./room-links.css";

/**
 * 룸 링크 콘솔 — 건물 → 객실 카드 → 오른쪽 상세 패널 (2026-10-02, 시안 1b).
 *
 * 도메인 계약: docs/product/35-room-links.md
 *
 * 리스팅이 많고 숙소마다 달라 「이 방 리스팅이 어디지?」를 빨리 찾는 화면이다. 패널에서 호스트 화면을 열고, 손님용
 * 링크를 복사하고, 그 자리에서 고친다. 저장은 서버 액션이 권한 · 조직 · 입력을 다시 본다 — 여기 검사는 편의다.
 */
type Copy = Dictionary["roomLinks"];

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);

/** 주소에서 스킴 · www 를 떼어 짧게 보여 준다(원문은 열기 버튼이 쓴다). */
function shortUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

type Selection = { building: number; row: number };

export function RoomLinksConsole({ data, copy }: { data: RoomLinksPageData; copy: Copy }) {
  const [selection, setSelection] = useState<Selection>({ building: 0, row: 0 });
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const duplicates = useMemo(() => new Set(data.duplicateListingIds), [data.duplicateListingIds]);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 1800);
  };

  const all = useMemo(
    () =>
      data.buildings.flatMap((building, buildingIndex) =>
        building.rows.map((row, rowIndex) => ({ building, buildingIndex, row, rowIndex })),
      ),
    [data.buildings],
  );
  const totals = useMemo(() => {
    const units = all.flatMap((entry) => entry.row.units);
    return {
      listings: units.filter((unit) => unit.airbnb || unit.booking).length,
      noGuest: units.filter((unit) => !unit.airbnb?.guestUrl).length,
      rooms: all.length,
    };
  }, [all]);

  const needle = query.trim().toLowerCase();
  const results = needle
    ? all.filter(({ building, row }) =>
        [
          building.name,
          row.label,
          ...row.units.flatMap((unit) => [
            unit.unitLabel,
            unit.airbnb?.listingId,
            unit.airbnb?.guestUrl,
            unit.booking?.guestUrl,
          ]),
        ].some((value) => value && value.toLowerCase().includes(needle)),
      )
    : [];

  if (data.buildings.length === 0) {
    return (
      <div className="rl">
        <div className="rl__empty">{copy.noRooms}</div>
      </div>
    );
  }

  const building = data.buildings[Math.min(selection.building, data.buildings.length - 1)];
  const row = building.rows[Math.min(selection.row, building.rows.length - 1)];
  const multi = row.units.length > 1;

  const chip = (unit: RoomLinkUnitView, rowMulti: boolean) =>
    !unit.airbnb?.guestUrl ? "miss" : rowMulti && unit.selling ? "now" : "";

  return (
    <div className="rl">
      <div className="rl__top">
        <h1 className="rl__title">{copy.title}</h1>
        <div className="rl__stat">
          <span>{fill(copy.statRooms, { n: totals.rooms })}</span>
          <span>{fill(copy.statListings, { n: totals.listings })}</span>
          {totals.noGuest > 0 && <span className="is-warn">{fill(copy.statNoGuest, { n: totals.noGuest })}</span>}
          {duplicates.size > 0 && <span className="is-bad">{fill(copy.statDuplicate, { n: duplicates.size })}</span>}
        </div>
        <label className="rl__search">
          <Search aria-hidden="true" className="ic" />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="rl__body">
        <nav aria-label={copy.buildings} className="rl__buildings">
          <div className="rl__sec">{copy.buildings}</div>
          {data.buildings.map((item, index) => (
            <button
              className={`rl__bld${index === selection.building && !needle ? " on" : ""}`}
              key={item.name}
              onClick={() => {
                setSelection({ building: index, row: 0 });
                setQuery("");
              }}
              type="button"
            >
              <span>{item.name}</span>
              <span className="rl__count">{item.rows.reduce((sum, r) => sum + r.units.length, 0)}</span>
            </button>
          ))}
        </nav>

        <section className="rl__mid">
          {needle ? (
            <>
              <div className="rl__midh">
                <h2>{copy.searchResults}</h2>
                <span className="rl__muted">{fill(copy.resultCount, { n: results.length })}</span>
              </div>
              {results.length === 0 ? (
                <div className="rl__empty">{copy.noResults}</div>
              ) : (
                <div className="rl__results">
                  {results.map((entry) => (
                    <button
                      className={`rl__res${entry.buildingIndex === selection.building && entry.rowIndex === selection.row ? " on" : ""}`}
                      key={entry.row.key}
                      onClick={() => {
                        setSelection({ building: entry.buildingIndex, row: entry.rowIndex });
                        setQuery("");
                      }}
                      type="button"
                    >
                      <span className="rl__muted rl__resb">{entry.building.name}</span>
                      <span className="rl__rn">{entry.row.label}</span>
                      <span className="rl__units">
                        {entry.row.units.map((unit) => (
                          <span className={`rl__u ${chip(unit, entry.row.units.length > 1)}`} key={unit.roomId}>
                            {unit.unitLabel}
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rl__midh">
                <h2>{building.name}</h2>
                <span className="rl__muted">
                  {fill(copy.statRooms, { n: building.rows.length })} ·{" "}
                  {fill(copy.statListings, { n: building.rows.reduce((sum, r) => sum + r.units.length, 0) })}
                </span>
              </div>
              <div className="rl__grid">
                {building.rows.map((item, index) => (
                  <button
                    className={`rl__card${index === selection.row ? " on" : ""}`}
                    key={item.key}
                    onClick={() => setSelection({ building: selection.building, row: index })}
                    type="button"
                  >
                    <span className="rl__rn">{item.label}</span>
                    <span className="rl__units">
                      {item.units.map((unit) => (
                        <span className={`rl__u ${chip(unit, item.units.length > 1)}`} key={unit.roomId}>
                          {unit.unitLabel}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="rl__panel" key={row.key}>
          <div className="rl__ph">
            <div className="rl__muted">{building.name}</div>
            <div className="rl__phrow">
              <h2 className="rl__room">{row.label}</h2>
              <span className="rl__mono rl__muted">
                {fill(copy.units, { list: row.units.map((unit) => unit.unitLabel).join(" · ") })}
              </span>
            </div>
            {building.address ? (
              <div className="rl__addr">
                <MapPin aria-hidden="true" className="ic" />
                <span>{building.address}</span>
                {building.mapUrl && (
                  <a href={building.mapUrl} rel="noopener noreferrer" target="_blank">
                    {copy.openMap}
                  </a>
                )}
              </div>
            ) : (
              <div className="rl__addr is-warn">
                <MapPin aria-hidden="true" className="ic" />
                <span>{copy.addressMissing}</span>
              </div>
            )}
          </div>
          <div className="rl__pb">
            {row.units.map((unit) => (
              <div className={`rl__unit${multi && unit.selling ? " now" : ""}`} key={unit.roomId}>
                <div className="rl__unith">
                  <span className="rl__mono rl__unitl">{unit.unitLabel}</span>
                  {multi && (
                    <span className={`rl__pill ${unit.selling ? "ok" : ""}`}>
                      {unit.selling ? copy.sellingNow : copy.resting}
                    </span>
                  )}
                </div>
                <ChannelBlock
                  channel="airbnb"
                  copy={copy}
                  duplicate={!!unit.airbnb?.listingId && duplicates.has(unit.airbnb.listingId)}
                  link={unit.airbnb}
                  onCopied={() => flash(copy.copied)}
                  onSaved={flash}
                  roomId={unit.roomId}
                />
                <ChannelBlock
                  channel="booking"
                  copy={copy}
                  duplicate={false}
                  link={unit.booking}
                  onCopied={() => flash(copy.copied)}
                  onSaved={flash}
                  roomId={unit.roomId}
                />
              </div>
            ))}
            <p className="rl__note">{copy.note}</p>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="rl__toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function errorText(copy: Copy, error: Extract<SaveRoomLinkResult, { ok: false }>["error"]) {
  switch (error) {
    case "forbidden":
      return copy.errForbidden;
    case "not_found":
      return copy.errNotFound;
    case "host_invalid":
      return copy.errHostInvalid;
    case "guest_invalid":
      return copy.errGuestInvalid;
    case "host_channel":
      return copy.errHostChannel;
    case "guest_channel":
      return copy.errGuestChannel;
    case "memo_long":
      return copy.errMemoLong;
    default:
      return copy.errSaveFailed;
  }
}

function ChannelBlock({
  channel,
  link,
  roomId,
  duplicate,
  copy,
  onCopied,
  onSaved,
}: {
  channel: RoomLinkChannel;
  link: RoomLinkView | null;
  roomId: string;
  duplicate: boolean;
  copy: Copy;
  onCopied: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ guest: "", host: "", memo: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = channel === "airbnb" ? "Airbnb" : "Booking.com";
  const hostLabel = channel === "airbnb" ? copy.host : copy.extranet;

  const startEdit = () => {
    setForm({ guest: link?.guestUrl ?? "", host: link?.hostUrl ?? "", memo: link?.memo ?? "" });
    setError(null);
    setEditing(true);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveRoomListingLink({ channel, guest: form.guest, host: form.host, memo: form.memo, roomId });
      if (!result.ok) {
        setError(errorText(copy, result.error));
        return;
      }
      setEditing(false);
      onSaved(result.removed ? copy.removedToast : copy.savedToast);
      router.refresh();
    });
  };

  const copyGuest = async () => {
    if (!link?.guestUrl) return;
    try {
      await navigator.clipboard.writeText(link.guestUrl);
      onCopied();
    } catch {
      // 복사가 막힌 브라우저 — 열기 버튼으로 대신한다.
    }
  };

  if (editing) {
    return (
      <div className={`rl__ch ${channel}`}>
        <div className="rl__chh">
          <span className={`rl__chname ${channel}`}>{name}</span>
        </div>
        <div className="rl__form">
          <label className="rl__field">
            <span>{hostLabel}</span>
            <input
              className="rl__input rl__mono"
              onChange={(event) => setForm({ ...form, host: event.target.value })}
              placeholder={channel === "airbnb" ? copy.hostHintAirbnb : copy.hostHintBooking}
              value={form.host}
            />
          </label>
          <label className="rl__field">
            <span>{copy.guest}</span>
            <input
              className="rl__input rl__mono"
              onChange={(event) => setForm({ ...form, guest: event.target.value })}
              placeholder={channel === "airbnb" ? copy.guestHintAirbnb : copy.guestHintBooking}
              value={form.guest}
            />
          </label>
          <label className="rl__field">
            <span>
              {copy.memo} <em>({copy.optional})</em>
            </span>
            <input
              className="rl__input"
              maxLength={200}
              onChange={(event) => setForm({ ...form, memo: event.target.value })}
              placeholder={copy.memoPlaceholder}
              value={form.memo}
            />
          </label>
          {error && <p className="rl__err">{error}</p>}
          <div className="rl__formacts">
            {link && (
              <button
                className="chipbtn rl__clear"
                disabled={pending}
                onClick={() => setForm({ guest: "", host: "", memo: "" })}
                type="button"
              >
                {copy.remove}
              </button>
            )}
            <span className="rl__grow" />
            <button className="chipbtn" disabled={pending} onClick={() => setEditing(false)} type="button">
              {copy.cancel}
            </button>
            <button className="chipbtn rl__primary" disabled={pending} onClick={save} type="button">
              {pending ? copy.saving : copy.save}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!link) {
    return (
      <div className={`rl__ch ${channel} is-empty`}>
        <span className={`rl__chname ${channel}`}>{name}</span>
        <span className="rl__muted rl__grow">{copy.bookingEmpty}</span>
        <button className="rl__add" onClick={startEdit} type="button">
          + {channel === "booking" ? copy.addBooking : copy.add}
        </button>
      </div>
    );
  }

  return (
    <div className={`rl__ch ${channel}`}>
      <div className="rl__chh">
        <span className={`rl__chname ${channel}`}>{name}</span>
        {link.listingId && <span className="rl__mono rl__muted">{fill(copy.listingId, { id: link.listingId })}</span>}
        {duplicate && <span className="rl__pill bad">{copy.duplicateWarn}</span>}
        <span className="rl__grow" />
        <button aria-label={copy.edit} className="rl__icon" onClick={startEdit} title={copy.edit} type="button">
          <Pencil aria-hidden="true" />
        </button>
      </div>
      <div className="rl__line">
        <span className="rl__lab">{hostLabel}</span>
        {link.hostUrl ? (
          <>
            <span className="rl__url rl__mono">{shortUrl(link.hostUrl)}</span>
            <a className="rl__open is-host" href={link.hostUrl} rel="noopener noreferrer" target="_blank">
              {copy.open}
              <ExternalLink aria-hidden="true" />
            </a>
          </>
        ) : (
          <span className="rl__muted rl__grow">—</span>
        )}
      </div>
      <div className="rl__line">
        <span className="rl__lab">{copy.guest}</span>
        {link.guestUrl ? (
          <>
            <span className="rl__url rl__mono">{shortUrl(link.guestUrl)}</span>
            <button aria-label={copy.copy} className="rl__icon" onClick={copyGuest} title={copy.copy} type="button">
              <Copy aria-hidden="true" />
            </button>
            <a className="rl__open" href={link.guestUrl} rel="noopener noreferrer" target="_blank">
              {copy.open}
              <ExternalLink aria-hidden="true" />
            </a>
          </>
        ) : (
          <>
            <span className="rl__muted rl__grow is-warn">{copy.guestMissing}</span>
            <button className="rl__add" onClick={startEdit} type="button">
              + {copy.add}
            </button>
          </>
        )}
      </div>
      {link.memo && <div className="rl__memo">{link.memo}</div>}
    </div>
  );
}
