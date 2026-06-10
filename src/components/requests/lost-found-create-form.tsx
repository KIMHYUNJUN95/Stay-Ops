"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Package, User } from "lucide-react";
import { createLostItem } from "@/app/mobile/lost-found/new/actions";
import {
  AnnouncementImageUploader,
  type AnnouncementImageUploaderHandle,
} from "@/components/announcements/announcement-image-uploader";
import { LostFoundConfirmModal } from "@/components/requests/lost-found-confirm-modal";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";
import type { ActiveRoomCatalogItem } from "@/lib/rooms";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { cn } from "@/lib/utils";

type LostFoundCreateFormProps = {
  buildingLabels: Record<string, string>;
  cleaningSessionId: string;
  copy: Dictionary["lostFound"];
  defaultRoom: string;
  imgCopy: Dictionary["requestImages"];
  organizationId: string;
  reporterName: string;
  roomCatalog: readonly ActiveRoomCatalogItem[];
};

const FIELD_CLASS =
  "flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 text-sm font-bold text-slate-900 outline-none shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60 disabled:opacity-50 cursor-pointer select-none text-left";

const PANEL_CLASS =
  "flex flex-col gap-4 rounded-[24px] border border-slate-200/80 bg-surface p-4 shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)] backdrop-blur-none";

function SectionLabel({ children, index }: { children: string; index: number }) {
  return (
    <h2 className="pl-1 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
      {index}. {children}
    </h2>
  );
}

export function LostFoundCreateForm({
  buildingLabels,
  cleaningSessionId,
  copy,
  imgCopy,
  organizationId,
  reporterName,
  roomCatalog,
}: LostFoundCreateFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const uploaderRef = useRef<AnnouncementImageUploaderHandle>(null);
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState({ item: "", building: "", room: "" });
  const [isPending, startTransition] = useTransition();

  // Custom select dropdown state
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const buildingDropdownRef = useRef<HTMLDivElement>(null);
  const roomDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        buildingDropdownRef.current &&
        !buildingDropdownRef.current.contains(event.target as Node)
      ) {
        setBuildingOpen(false);
      }
      if (
        roomDropdownRef.current &&
        !roomDropdownRef.current.contains(event.target as Node)
      ) {
        setRoomOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Deduplicate and sort active properties
  const buildings = Array.from(new Set(roomCatalog.map((item) => item.propertyName))).sort();

  // Canonical rooms for the selected building — deduped by canonicalRoomLabel (first entry wins),
  // matching the same deduplication policy used in the calendar room axis.
  const availableRooms = (() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of roomCatalog) {
      if (item.propertyName === selectedBuilding && !seen.has(item.canonicalRoomLabel)) {
        seen.add(item.canonicalRoomLabel);
        result.push(item.canonicalRoomLabel);
      }
    }
    return result.sort((a, b) => a.localeCompare(b));
  })();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    if (!selectedBuilding) {
      setValidationError(copy.errors.missing_building);
      return;
    }
    if (!selectedRoom) {
      setValidationError(copy.errors.invalid_room);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const itemName = String(formData.get("itemName") ?? "").trim();
    if (!itemName) {
      setValidationError(copy.errors.missing_item_name);
      return;
    }

    setSummary({
      item: itemName,
      building: selectedBuilding,
      room: selectedRoom,
    });
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    const form = formRef.current;
    if (!form) return;

    if (!selectedBuilding) {
      setConfirmOpen(false);
      setValidationError(copy.errors.missing_building);
      return;
    }
    if (!selectedRoom) {
      setConfirmOpen(false);
      setValidationError(copy.errors.invalid_room);
      return;
    }

    const formData = new FormData(form);
    const itemName = String(formData.get("itemName") ?? "").trim();
    if (!itemName) {
      setConfirmOpen(false);
      setValidationError(copy.errors.missing_item_name);
      return;
    }

    const requestId = crypto.randomUUID();
    formData.set("id", requestId);
    formData.set("propertyName", selectedBuilding);
    formData.set("roomLabel", selectedRoom);
    formData.set("itemName", itemName);

    try {
      const items = uploaderRef.current?.getItems() ?? [];
      const { imageUrls } = await uploadRequestImages({
        items,
        organizationId,
        requestId,
        requestType: "lost-items",
      });
      for (const url of imageUrls) {
        formData.append("imageUrls", url);
      }
    } catch {
      setConfirmOpen(false);
      setValidationError(copy.errors.save_failed);
      return;
    }

    startTransition(async () => {
      await createLostItem(formData);
    });
  }

  const isLocationDropdownOpen = buildingOpen || roomOpen;

  return (
    <>
      <form
        action={createLostItem}
        className="flex flex-col gap-6"
        onSubmit={handleSubmit}
        ref={formRef}
      >
        <input name="cleaningSessionId" type="hidden" value={cleaningSessionId} />

        {/* Hidden inputs to feed data to Server Action validation successfully */}
        <input name="propertyName" type="hidden" value={selectedBuilding} />
        <input name="roomLabel" type="hidden" value={selectedRoom} />

        {/* Section 1: Location */}
        {/* We dynamically raise the z-index (z-30) on this section when a dropdown is open, ensuring options display on top of the next card */}
        <section className={cn("flex flex-col gap-2 relative transition-all duration-150", isLocationDropdownOpen ? "z-30" : "z-10")}>
          <SectionLabel index={1}>{copy.form.sectionLocation}</SectionLabel>
          <div className={cn(PANEL_CLASS, "relative", isLocationDropdownOpen ? "z-30" : "z-10")}>
            {/* Step 1: Building (Property) Custom Selector */}
            <div className="flex flex-col gap-2" ref={buildingDropdownRef}>
              <span className="text-xs font-semibold text-muted-foreground">{copy.form.building}</span>
              <div className="relative">
                <button
                  className={cn(FIELD_CLASS, buildingOpen && "border-sky-300 ring-2 ring-sky-200/60")}
                  onClick={() => setBuildingOpen(!buildingOpen)}
                  type="button"
                >
                  <span className={cn("truncate text-sm font-semibold", !selectedBuilding && "text-muted-foreground/70")}>
                    {selectedBuilding
                      ? localizePropertyName(selectedBuilding, buildingLabels)
                      : copy.form.buildingPlaceholder}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
                    style={{ transform: buildingOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>

                {buildingOpen && (
                  <ul className="absolute left-0 z-50 mt-1.5 max-h-60 w-full overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-1 shadow-[0_18px_40px_-24px_rgba(31,58,95,0.55)] divide-y divide-slate-100">
                    {buildings.map((b) => (
                      <li
                        className={cn(
                          "flex items-center h-10 w-full px-3 text-sm font-semibold rounded-lg cursor-pointer transition-colors",
                          selectedBuilding === b
                            ? "bg-sky-50 text-sky-700"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                        key={b}
                        onClick={() => {
                          setSelectedBuilding(b);
                          setSelectedRoom("");
                          setBuildingOpen(false);
                          if (validationError) setValidationError(null);
                        }}
                      >
                        {localizePropertyName(b, buildingLabels)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Step 2: Room Custom Selector */}
            <div className="flex flex-col gap-2" ref={roomDropdownRef}>
              <span className="text-xs font-semibold text-muted-foreground">{copy.room}</span>
              <div className="relative">
                <button
                  className={cn(FIELD_CLASS, roomOpen && "border-sky-300 ring-2 ring-sky-200/60")}
                  disabled={!selectedBuilding}
                  onClick={() => setRoomOpen(!roomOpen)}
                  type="button"
                >
                  <span className={cn("truncate text-sm font-semibold", !selectedRoom && "text-muted-foreground/70")}>
                    {selectedRoom
                      ? selectedRoom
                      : selectedBuilding
                        ? copy.form.roomPlaceholderSelectRoom
                        : copy.form.roomPlaceholderSelectBuilding}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
                    style={{ transform: roomOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>

                {roomOpen && selectedBuilding && (
                  <ul className="absolute left-0 z-50 mt-1.5 max-h-60 w-full overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-1 shadow-[0_18px_40px_-24px_rgba(31,58,95,0.55)] divide-y divide-slate-100">
                    {availableRooms.map((canonicalLabel) => (
                      <li
                        className={cn(
                          "flex items-center h-10 w-full px-3 text-sm font-semibold rounded-lg cursor-pointer transition-colors",
                          selectedRoom === canonicalLabel
                            ? "bg-sky-50 text-sky-700"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                        key={canonicalLabel}
                        onClick={() => {
                          setSelectedRoom(canonicalLabel);
                          setRoomOpen(false);
                          if (validationError) setValidationError(null);
                        }}
                      >
                        {canonicalLabel}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selectedBuilding && availableRooms.length === 0 ? (
                <p className="pl-1 text-xs text-amber-500 font-semibold">
                  {copy.form.noRoomsInBuilding}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Section 2: Details */}
        {/* Keep Section 2 at standard z-10 layout so Section 1 easily paints over it when active */}
        <section className="flex flex-col gap-2 relative z-10">
          <SectionLabel index={2}>{copy.form.sectionDetails}</SectionLabel>
          <div className={PANEL_CLASS}>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{copy.itemName}</span>
              <input
                autoComplete="off"
                className="h-12 w-full rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 text-sm font-bold text-slate-900 outline-none shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60"
                name="itemName"
                onChange={() => {
                  if (validationError) setValidationError(null);
                }}
                placeholder={copy.itemNamePlaceholder}
                required
                type="text"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{copy.memo}</span>
              <textarea
                className="min-h-24 w-full resize-none rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60"
                name="memo"
                placeholder={copy.memoPlaceholder}
                rows={4}
              />
            </label>
          </div>
        </section>

        {/* Section 3: Photos */}
        <section className="flex flex-col gap-2 relative z-10">
          <SectionLabel index={3}>{copy.form.sectionPhotos}</SectionLabel>
          <div className={PANEL_CLASS}>
            <AnnouncementImageUploader
              addImagesLabel={imgCopy.addPhotos}
              errorCountExceeded={imgCopy.errorCount}
              errorSizeExceeded={imgCopy.errorSize}
              errorTypeInvalid={imgCopy.errorType}
              imageAttachmentsLabel={imgCopy.attachments}
              imageLimitLabel={imgCopy.limit}
              imageRemoveLabel={imgCopy.remove}
              ref={uploaderRef}
            />
          </div>
        </section>

        <section className="flex flex-col gap-2 relative z-10">
          <SectionLabel index={4}>{copy.form.sectionInfo}</SectionLabel>
          <div className={PANEL_CLASS}>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{copy.reporter}</span>
              <div className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
                <User className="size-4 text-[#1F3A5F]" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-foreground">
                  {reporterName}
                </span>
              </div>
            </div>
          </div>
        </section>

        {validationError ? (
          <p className="text-xs font-semibold text-destructive">{validationError}</p>
        ) : null}

        <Button
          className="h-14 w-full rounded-2xl bg-[#315F91] text-base font-black text-white shadow-[0_18px_34px_-22px_rgba(49,95,145,0.68)] hover:bg-[#274D76]"
          disabled={isPending}
          type="submit"
        >
          <Package className="mr-2 size-5" aria-hidden="true" />
          {copy.reportButton}
        </Button>
      </form>

      <LostFoundConfirmModal
        cancelLabel={copy.cancelConfirm}
        confirmLabel={copy.confirmSubmit}
        description={copy.form.confirmDescription}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        open={confirmOpen}
        pending={isPending}
        rows={[
          { label: copy.form.confirmType, value: copy.form.confirmTypeValue },
          {
            label: copy.form.confirmLocation,
            value: `${summary.room} (${summary.building})`,
          },
          { label: copy.form.confirmItem, value: summary.item },
        ]}
        title={copy.confirmationTitle}
      />
    </>
  );
}
