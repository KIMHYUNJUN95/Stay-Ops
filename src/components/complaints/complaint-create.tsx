"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import {
  createComplaintAction,
  uploadComplaintImageAction,
} from "@/app/mobile/complaints/actions";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import type { ReservationPickRow } from "@/lib/complaint-reservations";
import { ImageLightbox } from "./image-lightbox";
import { type LinkTarget, type PlatformKey } from "./complaint-mock";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource, PLATFORMS, ratingMax } from "./cx-platform";
import "./complaints.css";

const MAX_IMAGES = 5;

function defaultRatingForPlatform(plat: PlatformKey | null) {
  if (!plat) return 0;
  const max = ratingMax(plat);
  if (!max) return 0;
  return max === 5 ? 2 : 4;
}

function RatingInput({
  plat,
  value,
  onChange,
  dict,
}: {
  plat: PlatformKey;
  value: number;
  onChange: (value: number) => void;
  dict: Dictionary;
}) {
  const max = ratingMax(plat);
  if (!max) return <div className="cx-rate-none">{dict.complaints.ratingNone}</div>;

  return (
    <>
      <div className={`cx-rstars${max > 5 ? " ten" : ""}`}>
        {Array.from({ length: max }).map((_, index) => (
          <button
            key={index}
            type="button"
            className={`cx-rstar${index < value ? " on" : ""}`}
            onClick={() => onChange(index + 1)}
            aria-label={`${index + 1}`}
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

export function ComplaintCreate({
  initialLinked = null,
  locale,
  pickRows,
}: {
  initialLinked?: LinkTarget | null;
  locale: string;
  pickRows: ReservationPickRow[];
}) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const router = useRouter();

  const [plat, setPlat] = useState<PlatformKey | null>(initialLinked?.plat ?? null);
  const [rating, setRating] = useState(defaultRatingForPlatform(initialLinked?.plat ?? null));
  const [linked, setLinked] = useState<LinkTarget | null>(initialLinked);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [pickerStep, setPickerStep] = useState<"buildings" | "rooms" | "guests">("buildings");
  const [pickerProperty, setPickerProperty] = useState<string | null>(null);
  const [pickerRoom, setPickerRoom] = useState<string | null>(null);
  const [guestName, setGuestName] = useState(
    initialLinked?.guestName ?? initialLinked?.guest ?? "",
  );
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const draftId = useRef(crypto.randomUUID()).current;
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetPickerState() {
    setSearch("");
    setPickerStep("buildings");
    setPickerProperty(null);
    setPickerRoom(null);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    event.target.value = "";

    startTransition(async () => {
      const result = await uploadComplaintImageAction(draftId, formData);
      if ("url" in result) {
        setUploadedImages((current) => [...current, result.url]);
      }
    });
  }

  function handleRemoveImage(index: number) {
    setUploadedImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleSubmit() {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("platform", plat ?? "other");
      formData.append("title", titleRef.current?.value ?? "");
      formData.append("description", bodyRef.current?.value ?? "");

      if (rating > 0) formData.append("rating", String(rating));
      uploadedImages.forEach((url, index) => formData.append(`image_${index}`, url));

      if (linked?.reservationId) formData.append("reservation_id", linked.reservationId);
      if (linked?.propertyName) formData.append("property_name", linked.propertyName);
      if (linked?.roomLabel) formData.append("room_label", linked.roomLabel);
      if (guestName.trim()) formData.append("guest_name", guestName.trim());

      const result = await createComplaintAction(formData);
      if ("id" in result) {
        router.push(`/mobile/complaints/${result.id}`);
      }
    });
  }

  return (
    <div className="cx cx-create">
      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldTitle} <span className="req">{t.required}</span>
        </div>
        <input ref={titleRef} className="cx-fld" placeholder={t.fieldTitle} />
      </div>

      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldBody} <span className="opt">{t.optional}</span>
        </div>
        <textarea ref={bodyRef} className="cx-fld" placeholder={t.fieldBodyPlaceholder} />
      </div>

      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldLink} <span className="opt">{t.optional}</span>
        </div>
        {linked ? (
          <div className="cx-linked">
            <span className="cx-linked__ic">{CxIcon.building}</span>
            <div className="cx-linked__b">
              <div className="cx-linked__n">{linked.place}</div>
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
              onClick={() => {
                setLinked(null);
                setPlat(null);
                setRating(0);
              }}
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

      {plat !== null && (
        <div className="cx-fsec">
          <div className="cx-fsec__h">
            {t.fieldRating} <span className="opt">{t.optional}</span>
          </div>
          <RatingInput plat={plat} value={rating} onChange={setRating} dict={dict} />
        </div>
      )}

      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldGuestName} <span className="opt">{t.optional}</span>
        </div>
        <input
          className="cx-fld"
          value={guestName}
          onChange={(event) => setGuestName(event.target.value)}
          placeholder={t.fieldGuestPlaceholder}
        />
      </div>

      <div className="cx-fsec">
        <div className="cx-fsec__h">
          {t.fieldImages} <span className="opt">{t.imagesMax}</span>
        </div>
        <div className="cx-upgrid">
          {uploadedImages.map((url, index) => (
            <div key={url} className="cx-upthumb">
              <img
                src={url}
                alt=""
                className="cx-upthumb__img"
                onClick={() => setLightboxIndex(index)}
              />
              <button
                type="button"
                className="cx-upthumb__x"
                onClick={() => handleRemoveImage(index)}
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

      {lightboxIndex !== null && uploadedImages.length > 0 && (
        <ImageLightbox
          images={uploadedImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          labels={{
            close: t.lightboxClose,
            photo: t.lightboxPhoto,
          }}
        />
      )}

      {showPicker && (
        <BottomSheet
          onClose={() => {
            setShowPicker(false);
            resetPickerState();
          }}
          className="max-h-[82dvh] flex flex-col"
        >
          {({ close }) => {
            const closePicker = () => {
              resetPickerState();
              close();
            };

            const goBack = () => {
              setSearch("");
              if (pickerStep === "guests") {
                setPickerStep("rooms");
                setPickerRoom(null);
                return;
              }
              setPickerStep("buildings");
              setPickerProperty(null);
            };

            const query = search.trim().toLowerCase();

            if (pickerStep === "buildings") {
              const seen = new Set<string>();
              const buildings: { canonical: string; display: string }[] = [];

              for (const row of pickRows) {
                if (seen.has(row.propertyName)) continue;
                seen.add(row.propertyName);
                buildings.push({
                  canonical: row.propertyName,
                  display: row.displayPropertyName,
                });
              }

              buildings.sort((left, right) => left.display.localeCompare(right.display));

              const filtered = query
                ? buildings.filter((building) => building.display.toLowerCase().includes(query))
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
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t.pickerTitle}
                      autoFocus
                    />
                  </div>
                  <div className="cx-picker-scroll">
                    {filtered.length === 0 ? (
                      <div className="cx-pick-empty">—</div>
                    ) : (
                      filtered.map(({ canonical, display }) => {
                        const hasLive = pickRows.some(
                          (row) => row.propertyName === canonical && row.live,
                        );

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
                            <span className="cx-bldrow__ic">
                              <CIc>{CxIcon.building}</CIc>
                            </span>
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

            if (pickerStep === "rooms" && pickerProperty) {
              const rowsInProperty = pickRows.filter(
                (row) => row.propertyName === pickerProperty,
              );
              const seen = new Set<string>();
              const rooms: { canonical: string; display: string }[] = [];

              for (const row of rowsInProperty) {
                if (seen.has(row.roomLabel)) continue;
                seen.add(row.roomLabel);
                rooms.push({
                  canonical: row.roomLabel,
                  display: row.displayRoomLabel,
                });
              }

              rooms.sort((left, right) => left.display.localeCompare(right.display));

              const filtered = query
                ? rooms.filter((room) => room.display.toLowerCase().includes(query))
                : rooms;

              const headerBuilding =
                rowsInProperty[0]?.displayPropertyName ?? pickerProperty;

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
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t.metaRoom}
                      autoFocus
                    />
                  </div>
                  <div className="cx-picker-scroll">
                    {filtered.length === 0 ? (
                      <div className="cx-pick-empty">—</div>
                    ) : (
                      filtered.map(({ canonical, display }) => {
                        const hasLive = rowsInProperty.some(
                          (row) => row.roomLabel === canonical && row.live,
                        );
                        const count = rowsInProperty.filter(
                          (row) => row.roomLabel === canonical,
                        ).length;

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
                            <span className="cx-bldrow__ic">
                              <CIc>{CxIcon.door}</CIc>
                            </span>
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

            if (pickerStep === "guests" && pickerProperty && pickerRoom) {
              const rowsInRoom = pickRows.filter(
                (row) => row.propertyName === pickerProperty && row.roomLabel === pickerRoom,
              );
              const stayingRows = rowsInRoom.filter((row) => row.group === "staying");
              const upcomingRows = rowsInRoom.filter((row) => row.group === "upcoming");
              const filtered = query
                ? rowsInRoom.filter((row) => row.guest.toLowerCase().includes(query))
                : rowsInRoom;
              const filteredStaying = filtered.filter((row) => row.group === "staying");
              const filteredUpcoming = filtered.filter((row) => row.group === "upcoming");
              const headerRoom = rowsInRoom[0]?.displayRoomLabel ?? pickerRoom;
              const headerBuilding = rowsInRoom[0]?.displayPropertyName ?? pickerProperty;

              const selectRow = (row: ReservationPickRow) => {
                setLinked({
                  plat: row.plat,
                  propertyName: row.propertyName,
                  roomLabel: row.roomLabel,
                  place: row.place,
                  guest: row.guest,
                  guestName: row.guest,
                  stay: row.stay,
                  reservationId: row.reservationId,
                });
                setPlat(row.plat);
                setGuestName(row.guest);
                setRating(defaultRatingForPlatform(row.plat));
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
                  {stayingRows.length + upcomingRows.length > 1 && (
                    <div className="cx-search">
                      <span className="ic cx-search__ic">{CxIcon.search}</span>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t.metaGuest}
                        autoFocus
                      />
                    </div>
                  )}
                  <div className="cx-picker-scroll">
                    {filteredStaying.length > 0 && (
                      <>
                        <p className="cx-glabel">{t.pickerStaying}</p>
                        {filteredStaying.map((row) => (
                          <PickRow
                            key={row.reservationId}
                            row={row}
                            liveLabel={t.pickerLiveTag}
                            onClick={() => selectRow(row)}
                          />
                        ))}
                      </>
                    )}
                    {filteredUpcoming.length > 0 && (
                      <>
                        <p className="cx-glabel">{t.pickerUpcoming}</p>
                        {filteredUpcoming.map((row, index) => (
                          <div key={row.reservationId}>
                            {index > 0 && <div className="cx-rsep" />}
                            <PickRow
                              row={row}
                              liveLabel={t.pickerLiveTag}
                              onClick={() => selectRow(row)}
                            />
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
  const platform = PLATFORMS[row.plat];

  return (
    <button type="button" className="cx-rrow" onClick={onClick}>
      <span className="cx-rrow__av" style={{ background: platform.avg }}>
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
