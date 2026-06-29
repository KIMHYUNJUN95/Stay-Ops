"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource, PLATFORMS, ratingMax } from "./cx-platform";
import { type PlatformKey, type LinkTarget } from "./complaint-mock";
import type { ReservationPickRow } from "@/lib/complaint-reservations";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { ImageLightbox } from "./image-lightbox";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import {
  createComplaintAction,
  uploadComplaintImageAction,
} from "@/app/mobile/complaints/actions";

const MAX_IMAGES = 5;

function RatingInput({
  plat,
  value,
  onChange,
  dict,
}: {
  plat: PlatformKey;
  value: number;
  onChange: (v: number) => void;
  dict: Dictionary;
}) {
  const max = ratingMax(plat);
  if (!max) return <div className="cx-rate-none">{dict.complaints.ratingNone}</div>;
  return (
    <>
      <div className={`cx-rstars${max > 5 ? " ten" : ""}`}>
        {Array.from({ length: max }).map((_, i) => (
          <button
            key={i}
            type="button"
            className={`cx-rstar${i < value ? " on" : ""}`}
            onClick={() => onChange(i + 1)}
            aria-label={`${i + 1}`}
          >
            {CxIcon.star}
          </button>
        ))}
      </div>
      <div className="cx-rval">
        <b>{value.toFixed(1)}</b> / {max}
      </div>
    </>
  );
}

export function ComplaintCreate({ locale, pickRows }: { locale: string; pickRows: ReservationPickRow[] }) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const router = useRouter();

  const [plat, setPlat] = useState<PlatformKey | null>(null);
  const [rating, setRating] = useState(0);
  const [linked, setLinked] = useState<LinkTarget | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  // 3단계 드릴다운: buildings → rooms → guests
  const [pickerStep, setPickerStep] = useState<"buildings" | "rooms" | "guests">("buildings");
  const [pickerProperty, setPickerProperty] = useState<string | null>(null);
  const [pickerRoom, setPickerRoom] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  // 이미지 업로드용 draft ID — 업로드 전 서버에서 경로 확정에 필요
  const draftId = useRef(crypto.randomUUID()).current;
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    // 파일 input 초기화 (같은 파일 재선택 허용)
    e.target.value = "";
    startTransition(async () => {
      const result = await uploadComplaintImageAction(draftId, fd);
      if ("url" in result) {
        setUploadedImages((prev) => [...prev, result.url]);
      }
    });
  }

  function handleRemoveImage(idx: number) {
    setUploadedImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("platform", plat ?? "other");
      fd.append("title", titleRef.current?.value ?? "");
      fd.append("description", bodyRef.current?.value ?? "");
      if (rating > 0) fd.append("rating", String(rating));
      uploadedImages.forEach((url, i) => fd.append(`image_${i}`, url));
      if (linked?.reservationId) fd.append("reservation_id", linked.reservationId);
      if (guestName.trim()) fd.append("guest_name", guestName.trim());

      const result = await createComplaintAction(fd);
      if ("id" in result) {
        router.push(`/mobile/complaints/${result.id}`);
      }
    });
  }

  return (
    <div className="cx cx-create">
      {/* Title */}
      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldTitle} <span className="req">{t.required}</span>
        </div>
        <input ref={titleRef} className="cx-fld" placeholder={t.fieldTitle} />
      </div>

      {/* Body */}
      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldBody} <span className="opt">{t.optional}</span>
        </div>
        <textarea ref={bodyRef} className="cx-fld" placeholder={t.fieldBodyPlaceholder} />
      </div>

      {/* Link reservation/room — 연결하면 플랫폼 자동 확정 */}
      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldLink} <span className="opt">{t.optional}</span>
        </div>
        {linked ? (
          <div className="cx-linked">
            <span className="cx-linked__ic">{CxIcon.building}</span>
            <div className="cx-linked__b">
              <div className="cx-linked__n">{linked.place.replace(" · ", " ")}</div>
              <div className="cx-linked__s">
                <PlatformSource plat={linked.plat} dict={dict} />
                <span>
                  {linked.guest} · {linked.stay}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="cx-linked__x"
              onClick={() => { setLinked(null); setPlat(null); setRating(0); }}
            >
              {CxIcon.x}
            </button>
          </div>
        ) : (
          <button type="button" className="cx-linkrow" onClick={() => setShowPicker(true)}>
            <span className="cx-linkrow__ic">{CxIcon.link}</span>
            <span className="cx-linkrow__t">{t.linkAdd}</span>
            <span className="cx-linkrow__chev">{CxIcon.chevR}</span>
          </button>
        )}
      </div>

      {/* Rating — 예약 연결 후 플랫폼이 확정된 경우에만 표시 */}
      {plat !== null && (
        <div className="cx-fsec">
          <div className="cx-fsec__h">
            {t.fieldRating} <span className="opt">{t.optional}</span>
          </div>
          <RatingInput plat={plat} value={rating} onChange={setRating} dict={dict} />
        </div>
      )}

      {/* Guest name */}
      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldGuestName} <span className="opt">{t.optional}</span>
        </div>
        <input
          className="cx-fld"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder={t.fieldGuestPlaceholder}
        />
      </div>

      {/* Images */}
      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldImages} <span className="opt">{t.imagesMax}</span>
        </div>
        <div className="cx-upgrid">
          {uploadedImages.map((url, idx) => (
            <div key={url} className="cx-upthumb">
              <img
                src={url}
                alt=""
                className="cx-upthumb__img"
                onClick={() => setLightboxIndex(idx)}
              />
              <button
                type="button"
                className="cx-upthumb__x"
                onClick={() => handleRemoveImage(idx)}
              >
                {CxIcon.x}
              </button>
            </div>
          ))}
          {uploadedImages.length < MAX_IMAGES && (
            <button
              type="button"
              className="cx-upadd"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              <CIc>{CxIcon.plus}</CIc>
              <span>
                {uploadedImages.length} / {MAX_IMAGES}
              </span>
            </button>
          )}
        </div>
        {/* hidden file input — 클라이언트 압축은 추후 추가 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageChange}
        />
      </div>

      <button type="button" className="cx-submit" onClick={handleSubmit} disabled={isPending}>
        <CIc>{CxIcon.check}</CIc>
        {t.submit}
      </button>

      {/* 이미지 라이트박스 */}
      {lightboxIndex !== null && uploadedImages.length > 0 && (
        <ImageLightbox
          images={uploadedImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Picker sheet — 건물 → 객실 → 예약자 3단계 드릴다운 */}
      {showPicker && (
        <BottomSheet
          onClose={() => {
            setShowPicker(false);
            setSearch("");
            setPickerStep("buildings");
            setPickerProperty(null);
            setPickerRoom(null);
          }}
          className="max-h-[82dvh] flex flex-col"
        >
          {({ close }) => {
            const closePicker = () => {
              setSearch("");
              setPickerStep("buildings");
              setPickerProperty(null);
              setPickerRoom(null);
              close();
            };

            const goBack = () => {
              setSearch("");
              if (pickerStep === "guests") {
                setPickerStep("rooms");
                setPickerRoom(null);
              } else {
                setPickerStep("buildings");
                setPickerProperty(null);
              }
            };

            const q = search.trim().toLowerCase();

            // ── 1단계: 건물 목록 ──────────────────────────────
            if (pickerStep === "buildings") {
              // canonical 이름(propertyName)으로 중복 제거 후 표시명(displayPropertyName)으로 렌더
              const seen = new Set<string>();
              const buildings: { canonical: string; display: string }[] = [];
              for (const r of pickRows) {
                if (!seen.has(r.propertyName)) {
                  seen.add(r.propertyName);
                  buildings.push({ canonical: r.propertyName, display: r.displayPropertyName });
                }
              }
              buildings.sort((a, b) => a.display.localeCompare(b.display));
              const filtered = q
                ? buildings.filter((b) => b.display.toLowerCase().includes(q))
                : buildings;
              return (
                <div className="cx cx-sheet">
                  <div className="cx-sheet__head">
                    <p className="cx-sheet__title">{t.pickerTitle}</p>
                    <p className="cx-sheet__sub">{t.pickerSub}</p>
                  </div>
                  <div className="cx-search">
                    <span className="ic cx-search__ic">{CxIcon.search}</span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t.pickerTitle}
                      autoFocus
                    />
                  </div>
                  <div className="cx-picker-scroll">
                    {filtered.length === 0 ? (
                      <div className="cx-pick-empty">—</div>
                    ) : (
                      filtered.map(({ canonical, display }) => {
                        const hasLive = pickRows.some((r) => r.propertyName === canonical && r.live);
                        return (
                          <button
                            key={canonical}
                            type="button"
                            className="cx-bldrow"
                            onClick={() => {
                              setPickerProperty(canonical);
                              setPickerStep("rooms");
                              setSearch("");
                            }}
                          >
                            <span className="cx-bldrow__ic"><CIc>{CxIcon.building}</CIc></span>
                            <span className="cx-bldrow__n">{display}</span>
                            {hasLive && <span className="cx-rrow__live">{t.pickerLiveTag}</span>}
                            <span className="cx-bldrow__chev">{CxIcon.chevR}</span>
                          </button>
                        );
                      })
                    )}
                    <button type="button" className="cx-roomonly" onClick={closePicker}>
                      <CIc>{CxIcon.door}</CIc>
                      {t.pickerRoomOnly}
                    </button>
                  </div>
                </div>
              );
            }

            // ── 2단계: 객실 목록 ──────────────────────────────
            if (pickerStep === "rooms" && pickerProperty) {
              const inProperty = pickRows.filter((r) => r.propertyName === pickerProperty);
              // canonical roomLabel로 중복 제거 후 displayRoomLabel로 렌더
              const seenR = new Set<string>();
              const rooms: { canonical: string; display: string }[] = [];
              for (const r of inProperty) {
                if (!seenR.has(r.roomLabel)) {
                  seenR.add(r.roomLabel);
                  rooms.push({ canonical: r.roomLabel, display: r.displayRoomLabel });
                }
              }
              rooms.sort((a, b) => a.display.localeCompare(b.display));
              const filtered = q
                ? rooms.filter((rm) => rm.display.toLowerCase().includes(q))
                : rooms;
              // 헤더: pickerProperty(canonical)에 해당하는 displayPropertyName
              const headerBuilding = inProperty[0]?.displayPropertyName ?? pickerProperty;
              return (
                <div className="cx cx-sheet">
                  <div className="cx-sheet__head cx-sheet__head--nav">
                    <button type="button" className="cx-back" onClick={goBack}>
                      <CIc>{CxIcon.chevR}</CIc>
                    </button>
                    <p className="cx-sheet__title">{headerBuilding}</p>
                  </div>
                  <div className="cx-search">
                    <span className="ic cx-search__ic">{CxIcon.search}</span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t.metaRoom}
                      autoFocus
                    />
                  </div>
                  <div className="cx-picker-scroll">
                    {filtered.length === 0 ? (
                      <div className="cx-pick-empty">—</div>
                    ) : (
                      filtered.map(({ canonical, display }) => {
                        const hasLive = inProperty.some((r) => r.roomLabel === canonical && r.live);
                        const count = inProperty.filter((r) => r.roomLabel === canonical).length;
                        return (
                          <button
                            key={canonical}
                            type="button"
                            className="cx-bldrow"
                            onClick={() => {
                              setPickerRoom(canonical);
                              setPickerStep("guests");
                              setSearch("");
                            }}
                          >
                            <span className="cx-bldrow__ic"><CIc>{CxIcon.door}</CIc></span>
                            <span className="cx-bldrow__n">{display}</span>
                            {hasLive && <span className="cx-rrow__live">{t.pickerLiveTag}</span>}
                            <span className="cx-bldrow__cnt">{count}</span>
                            <span className="cx-bldrow__chev">{CxIcon.chevR}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            }

            // ── 3단계: 예약자(고객) 목록 ─────────────────────
            if (pickerStep === "guests" && pickerProperty && pickerRoom) {
              const inRoom = pickRows.filter(
                (r) => r.propertyName === pickerProperty && r.roomLabel === pickerRoom,
              );
              const staying = inRoom.filter((r) => r.group === "staying");
              const upcoming = inRoom.filter((r) => r.group === "upcoming");
              const filtered = q
                ? inRoom.filter((r) => r.guest.toLowerCase().includes(q))
                : inRoom;
              const fStaying = filtered.filter((r) => r.group === "staying");
              const fUpcoming = filtered.filter((r) => r.group === "upcoming");
              // 헤더 표시명: 첫 번째 매칭 행에서 추출
              const headerRoom = inRoom[0]?.displayRoomLabel ?? pickerRoom;
              const headerBuilding = inRoom[0]?.displayPropertyName ?? pickerProperty;

              const selectRow = (r: ReservationPickRow) => {
                setLinked({ plat: r.plat, place: r.place, guest: r.guest, stay: r.stay, reservationId: r.reservationId });
                setPlat(r.plat);
                // 플랫폼에 맞는 초기 별점 세팅 (direct는 별점 없음)
                const mx = ratingMax(r.plat);
                setRating(mx ? (mx === 5 ? 2 : 4) : 0);
                closePicker();
              };

              return (
                <div className="cx cx-sheet">
                  <div className="cx-sheet__head cx-sheet__head--nav">
                    <button type="button" className="cx-back" onClick={goBack}>
                      <CIc>{CxIcon.chevR}</CIc>
                    </button>
                    <div>
                      <p className="cx-sheet__title">{headerRoom}</p>
                      <p className="cx-sheet__sub">{headerBuilding}</p>
                    </div>
                  </div>
                  {(staying.length + upcoming.length) > 1 && (
                    <div className="cx-search">
                      <span className="ic cx-search__ic">{CxIcon.search}</span>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.metaGuest}
                        autoFocus
                      />
                    </div>
                  )}
                  <div className="cx-picker-scroll">
                    {fStaying.length > 0 && (
                      <>
                        <p className="cx-glabel">{t.pickerStaying}</p>
                        {fStaying.map((r) => (
                          <PickRow key={r.reservationId} row={r} liveLabel={t.pickerLiveTag} onClick={() => selectRow(r)} />
                        ))}
                      </>
                    )}
                    {fUpcoming.length > 0 && (
                      <>
                        <p className="cx-glabel">{t.pickerUpcoming}</p>
                        {fUpcoming.map((r, i) => (
                          <div key={r.reservationId}>
                            {i > 0 && <div className="cx-rsep" />}
                            <PickRow row={r} liveLabel={t.pickerLiveTag} onClick={() => selectRow(r)} />
                          </div>
                        ))}
                      </>
                    )}
                    {filtered.length === 0 && <div className="cx-pick-empty">—</div>}
                  </div>
                </div>
              );
            }

            return null;
          }}
        </BottomSheet>
      )}
    </div>
  );
}

function PickRow({
  row,
  liveLabel,
  onClick,
}: {
  row: ReservationPickRow;
  liveLabel: string;
  onClick: () => void;
}) {
  const p = PLATFORMS[row.plat];
  return (
    <button type="button" className="cx-rrow" onClick={onClick}>
      <span className="cx-rrow__av" style={{ background: p.avg }}>
        {row.guest.slice(0, 1)}
      </span>
      <div className="cx-rrow__b">
        <div className="cx-rrow__n">
          {row.place}
          {row.live && <span className="cx-rrow__live">{liveLabel}</span>}
        </div>
        <div className="cx-rrow__meta">
          {row.guest} · {row.meta}
        </div>
      </div>
      <span className="cx-rrow__chev">{CxIcon.chevR}</span>
    </button>
  );
}
