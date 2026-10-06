"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Copy, ExternalLink, MapPin, Search } from "lucide-react";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { useIsTablet } from "@/components/shell/split-list";
import type { Dictionary } from "@/lib/i18n";
import type { RoomLinkBuildingView, RoomLinkRowView, RoomLinksPageData, RoomLinkUnitView } from "@/lib/room-links";
import "./mobile-room-links.css";

/**
 * 모바일 룸 링크 — 건물 칩 + 객실 목록 → 바텀시트 (2026-10-05, 시안 1a).
 *
 * 도메인 계약: docs/product/35-room-links.md → 「모바일」
 *
 * 대시보드(1b)를 폰에 접은 모양이다. 위에서 건물을 고르면 건물 카드(주소 · 지도 · Booking.com — 건물 단위)가 한 번,
 * 아래는 객실 목록. 객실을 누르면 표준 바텀시트에 계정별 「호스트 열기 · 게스트 링크 복사」. 지금 판매 중인 계정이 맨
 * 위, 그 계정의 복사 버튼만 채운다. 고치기는 대시보드에서 한다(여기엔 편집이 없다).
 *
 * **넓은 화면**(셸의 폭 구간과 같다 — `globals.css` `fold:` · `tablet:`):
 * - 펼친 폴드 · 태블릿 세로(≥ 600): 가운데 760px, 객실은 두 줄 카드. 상세는 그대로 바텀시트(셸이 560px 로 띄운다).
 * - 태블릿 가로(≥ 1000 · 높이 ≥ 600): 대시보드 1b 처럼 **왼쪽 건물 목록 · 가운데 객실 · 오른쪽 상세 칸** — 시트를 쓰지 않는다.
 */
type Copy = Dictionary["roomLinks"];

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);

const shortUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "");

type Selected = { building: RoomLinkBuildingView; row: RoomLinkRowView };

export function MobileRoomLinks({ data, copy }: { data: RoomLinksPageData; copy: Copy }) {
  const isTablet = useIsTablet();
  const [buildingIndex, setBuildingIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
      setCopiedKey(null);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const copyLink = async (key: string, url: string | null) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setToast(copy.copied);
    } catch {
      // 복사가 막힌 브라우저 — 열기로 대신한다.
    }
  };

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return [];
    return data.buildings.flatMap((building) =>
      building.rows
        .filter((row) =>
          [
            building.name,
            row.label,
            ...row.units.flatMap((unit) => [unit.unitLabel, unit.airbnb?.listingId, unit.airbnb?.guestUrl]),
          ].some((value) => value && value.toLowerCase().includes(needle)),
        )
        .map((row) => ({ building, row })),
    );
  }, [data.buildings, needle]);

  if (data.buildings.length === 0) {
    return <div className="mrl mrl-empty">{copy.noRooms}</div>;
  }

  const building = data.buildings[Math.min(buildingIndex, data.buildings.length - 1)];
  // 태블릿 가로는 오른쪽 칸이 늘 무언가를 보인다 — 고른 객실, 없으면 지금 건물의 첫 객실(대시보드 1b 와 같다).
  const paneSelection: Selected | null =
    selected ?? (building.rows[0] ? { building, row: building.rows[0] } : null);
  const isOn = (row: RoomLinkRowView) => isTablet && paneSelection?.row.key === row.key;
  const pickBuilding = (index: number) => {
    setBuildingIndex(index);
    setSelected(null);
  };

  const detail = (target: Selected) => (
    <RoomDetail
      copiedKey={copiedKey}
      copy={copy}
      onCopy={(unit) => copyLink(`unit:${unit.roomId}`, unit.airbnb?.guestUrl ?? null)}
      selection={target}
    />
  );

  return (
    <div className="mrl">
      <label className="mrl-search">
        <Search aria-hidden="true" />
        <input
          aria-label={copy.searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.searchPlaceholder}
          type="search"
          value={query}
        />
      </label>

      <div className="mrl-body">
        <div aria-label={copy.buildings} className="mrl-chips" role="tablist">
          {data.buildings.map((item, index) => (
            <button
              aria-selected={!needle && index === buildingIndex}
              className={`mrl-chip${!needle && index === buildingIndex ? " on" : ""}`}
              key={item.name}
              onClick={() => {
                setQuery("");
                pickBuilding(index);
              }}
              role="tab"
              type="button"
            >
              <span>{item.name}</span>
              <span className="mrl-chip__n">{item.rows.length}</span>
            </button>
          ))}
        </div>

        <div className="mrl-main">
          {needle ? (
            <>
              <div className="mrl-sec">
                {copy.searchResults} · {fill(copy.resultCount, { n: results.length })}
              </div>
              <div className="mrl-list">
                {results.map(({ building: owner, row }) => (
                  <RoomRow
                    building={owner.name}
                    key={row.key}
                    on={isOn(row)}
                    onOpen={() => setSelected({ building: owner, row })}
                    row={row}
                  />
                ))}
                {results.length === 0 && <div className="mrl-empty">{copy.noResults}</div>}
              </div>
            </>
          ) : (
            <>
              <BuildingCard building={building} copiedKey={copiedKey} copy={copy} onCopy={copyLink} />
              <div className="mrl-list">
                {building.rows.map((row) => (
                  <RoomRow key={row.key} on={isOn(row)} onOpen={() => setSelected({ building, row })} row={row} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 태블릿 가로 — 시트 대신 오른쪽 칸(대시보드 1b 처럼 목록과 나란히). */}
        {isTablet && paneSelection && <aside className="mrl-pane">{detail(paneSelection)}</aside>}
      </div>

      {!isTablet && selected && (
        <BottomSheet
          ariaLabel={`${selected.building.name} ${selected.row.label}`}
          className="flex max-h-[86dvh] flex-col"
          onClose={() => setSelected(null)}
        >
          {detail(selected)}
        </BottomSheet>
      )}

      {toast && (
        <div className="mrl-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/** 객실 상세 — 폰 · 폴드는 바텀시트 안, 태블릿 가로는 오른쪽 칸. 판매 중 계정이 맨 위. */
function RoomDetail({
  selection,
  copy,
  copiedKey,
  onCopy,
}: {
  selection: Selected;
  copy: Copy;
  copiedKey: string | null;
  onCopy: (unit: RoomLinkUnitView) => void;
}) {
  return (
    <div className="mrl-sheet">
      <div className="mrl-sheet__head">
        <span className="mrl-kick">{selection.building.name}</span>
        <span className="mrl-sheet__title">
          <b>{selection.row.label}</b>
          <span className="mrl-mono">
            {fill(copy.units, { list: selection.row.units.map((unit) => unit.unitLabel).join(" · ") })}
          </span>
        </span>
      </div>
      <div className="mrl-sheet__body">
        {[...selection.row.units]
          .sort((a, b) => Number(b.selling) - Number(a.selling))
          .map((unit) => (
            <UnitCard
              copied={copiedKey === `unit:${unit.roomId}`}
              copy={copy}
              key={unit.roomId}
              onCopy={() => onCopy(unit)}
              unit={unit}
            />
          ))}
        <p className="mrl-note">{copy.mBookingNote}</p>
      </div>
    </div>
  );
}

function unitChipClass(unit: RoomLinkUnitView) {
  if (!unit.airbnb?.guestUrl) return "miss";
  return unit.selling ? "now" : "";
}

function RoomRow({
  row,
  building,
  on,
  onOpen,
}: {
  row: RoomLinkRowView;
  building?: string;
  on?: boolean;
  onOpen: () => void;
}) {
  return (
    <button aria-pressed={on} className={`mrl-row${on ? " on" : ""}`} onClick={onOpen} type="button">
      <span className="mrl-row__n">{row.label}</span>
      <span className="mrl-row__mid">
        {building && <span className="mrl-dim">{building}</span>}
        <span className="mrl-units">
          {row.units.map((unit) => (
            <span className={`mrl-u ${unitChipClass(unit)}`} key={unit.roomId}>
              <i aria-hidden="true" />
              {unit.unitLabel}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="mrl-chev" />
    </button>
  );
}

function BuildingCard({
  building,
  copy,
  copiedKey,
  onCopy,
}: {
  building: RoomLinkBuildingView;
  copy: Copy;
  copiedKey: string | null;
  onCopy: (key: string, url: string | null) => void;
}) {
  const booking = building.booking;
  const key = `booking:${building.name}`;
  const parts = [
    booking?.listingId ? fill(copy.hotelId, { id: booking.listingId }) : null,
    booking?.guestUrl ? copy.mGuestPage : null,
  ].filter(Boolean);
  return (
    <div className="mrl-card mrl-bcard">
      {building.address && (
        <div className="mrl-addr">
          <MapPin aria-hidden="true" />
          <span>{building.address}</span>
          {building.mapUrl && (
            <a href={building.mapUrl} rel="noopener noreferrer" target="_blank">
              {copy.openMap}
            </a>
          )}
        </div>
      )}
      <div className={`mrl-bk${building.address ? "" : " first"}`}>
        <span className="mrl-ch b">
          <i aria-hidden="true" />
          Booking.com
        </span>
        <span className="mrl-dim mrl-grow">{parts.length > 0 ? parts.join(" · ") : copy.bookingEmpty}</span>
        {booking?.hostUrl && (
          <a className="mrl-sm pri" href={booking.hostUrl} rel="noopener noreferrer" target="_blank">
            {copy.extranet}
            <ExternalLink aria-hidden="true" />
          </a>
        )}
        {booking?.guestUrl && (
          <button
            aria-label={copy.copy}
            className={`mrl-sm${copiedKey === key ? " done" : ""}`}
            onClick={() => onCopy(key, booking.guestUrl)}
            type="button"
          >
            <Copy aria-hidden="true" />
          </button>
        )}
        {booking?.guestUrl && (
          <a
            aria-label={`${copy.guest} ${copy.open}`}
            className="mrl-sm"
            href={booking.guestUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

function UnitCard({
  unit,
  copy,
  copied,
  onCopy,
}: {
  unit: RoomLinkUnitView;
  copy: Copy;
  copied: boolean;
  onCopy: () => void;
}) {
  const link = unit.airbnb;
  const guest = link?.guestUrl ?? null;
  return (
    <div className={`mrl-ucard${unit.selling ? " now" : ""}`}>
      <div className="mrl-ucard__head">
        <span className="mrl-ch a">
          <i aria-hidden="true" />
          Airbnb
        </span>
        <b className="mrl-mono">{unit.unitLabel}</b>
        <span className={`mrl-pill${unit.selling ? " ok" : ""}`}>{unit.selling ? copy.sellingNow : copy.resting}</span>
        <span className="mrl-grow" />
        {link?.listingId && <span className="mrl-id mrl-mono">…{link.listingId.slice(-6)}</span>}
      </div>
      <div className="mrl-acts">
        {link?.hostUrl ? (
          <a className="mrl-btn ghost" href={link.hostUrl} rel="noopener noreferrer" target="_blank">
            {copy.mOpenHost}
            <ExternalLink aria-hidden="true" />
          </a>
        ) : (
          <span className="mrl-btn off">{copy.mNoLink}</span>
        )}
        <button
          className={`mrl-btn${copied ? " done" : guest ? (unit.selling ? " pri" : "") : " off"}`}
          disabled={!guest}
          onClick={onCopy}
          type="button"
        >
          <Copy aria-hidden="true" />
          {copied ? copy.mCopied : guest ? copy.copy : copy.mNoLink}
        </button>
      </div>
      {/* 게스트 링크 줄 — 주소 + 「열기」(손님에게 보내기 전에 실제 페이지를 확인한다, 2026-10-06 사용자 지적). */}
      <div className="mrl-url">
        <span className="mrl-mono">{guest ? shortUrl(guest) : copy.guestMissing}</span>
        {guest && (
          <a className="mrl-sm" href={guest} rel="noopener noreferrer" target="_blank">
            {copy.open}
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>
      {link?.memo && <div className="mrl-memo">{link.memo}</div>}
    </div>
  );
}
