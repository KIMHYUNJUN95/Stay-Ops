"use client";

/**
 * Attendance correction request — form (frame F of "Attendance Correction Request.html"), wired to the
 * real backend in Step 6. Same design: reason chips · desired in/out time · desired site · memo ·
 * photos (≤5) · fixed submit bar. Now functional: the desired-site box opens a shared drag-dismiss
 * picker sheet, photos use the app's compress + `request-images` upload, and submit calls
 * `createAttendanceCorrectionRequest` (self-scoped + current/previous-month only, server-enforced).
 * Supports session-linked requests (`sessionId` + context) and session-less EXCEPTION requests.
 */

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import {
  TimePickerSheet,
  formatTimeDisplay,
} from "./time-picker-sheet";
import {
  compressImageFile,
  type PreviewItem,
} from "@/components/announcements/announcement-image-uploader";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import {
  createAttendanceCorrectionRequest,
  type CreateCorrectionInput,
} from "@/app/mobile/attendance/actions";
import type { AttendanceCorrectionReason } from "@/lib/attendance";
import { getDictionary, type Dictionary } from "@/lib/i18n";

type AttendanceCopy = Dictionary["attendance"];

type SessionContext = {
  dateLabel: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  siteName: string | null;
};

const MAX_PHOTOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const REASON_VALUES: AttendanceCorrectionReason[] = [
  "missing_clock_in",
  "missing_clock_out",
  "wrong_time",
  "wrong_site",
  "auth_failed",
  "other",
];

export function AttendanceCorrectionForm({
  organizationId,
  sessionId,
  sessionContext,
  sites,
  locale,
}: {
  organizationId: string;
  sessionId: string | null;
  sessionContext: SessionContext | null;
  sites: { id: string; name: string }[];
  locale: string;
}) {
  const copy = getDictionary(locale).attendance;
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [reason, setReason] = useState<AttendanceCorrectionReason>("missing_clock_out");
  const [inTime, setInTime] = useState<string>(sessionContext?.clockInTime ?? "");
  const [outTime, setOutTime] = useState<string>(sessionContext?.clockOutTime ?? "");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [memo, setMemo] = useState<string>("");
  const [photos, setPhotos] = useState<PreviewItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inPickerOpen, setInPickerOpen] = useState(false);
  const [outPickerOpen, setOutPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const siteName = useMemo(
    () => (siteId ? (sites.find((s) => s.id === siteId)?.name ?? null) : null),
    [siteId, sites],
  );

  const reasonLabels: Record<AttendanceCorrectionReason, string> = {
    missing_clock_in: copy.reasonMissingIn,
    missing_clock_out: copy.reasonMissingOut,
    wrong_time: copy.reasonWrongTime,
    wrong_site: copy.reasonWrongSite,
    auth_failed: copy.reasonAuthFailed,
    other: copy.reasonOther,
  };

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    if (selected.some((f) => !ALLOWED_TYPES.includes(f.type))) return;
    if (selected.some((f) => f.size > MAX_BYTES)) return;
    if (photos.length + selected.length > MAX_PHOTOS) {
      setError(copy.corrErrPhotoLimit(MAX_PHOTOS));
      return;
    }
    setError(null);
    const items = await Promise.all(
      selected.map(async (file) => {
        const compressed = await compressImageFile(file);
        return {
          id: `${Date.now()}-${Math.random()}`,
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
        } satisfies PreviewItem;
      }),
    );
    setPhotos((prev) => [...prev, ...items]);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function submit() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      let imageUrls: string[] = [];
      if (photos.length > 0) {
        try {
          const uploaded = await uploadRequestImages({
            items: photos.slice(0, MAX_PHOTOS),
            organizationId,
            requestId: crypto.randomUUID(),
            requestType: "attendance-corrections",
          });
          imageUrls = uploaded.imageUrls;
        } catch {
          setError(copy.corrErrPhotoUpload);
          return;
        }
      }

      const input: CreateCorrectionInput = {
        sessionId,
        reasonType: reason,
        memo: memo.trim() ? memo.trim() : null,
        desiredInTime: inTime || null,
        desiredOutTime: outTime || null,
        desiredSiteId: siteId,
        imageUrls,
      };
      const res = await createAttendanceCorrectionRequest(input);
      if (res.ok) {
        router.push(`/mobile/attendance/correction/status?id=${res.id}`);
        return;
      }
      setError(
        res.reason === "out_of_range"
          ? copy.corrErrOutOfRange
          : res.reason === "forbidden"
            ? copy.corrErrForbidden
            : res.reason === "invalid"
              ? copy.corrErrInvalid
              : resultGenericSub(copy),
      );
    });
  }

  return (
    <div className="att">
      <div className="scroll-pad" style={{ paddingBottom: "96px" }}>
        <div className="caphead">
          <div>
            <div className="capttl">{copy.corrFormTitle}</div>
            <div className="capsub">
              {sessionContext
                ? copy.corrSubWithSession(sessionContext.dateLabel)
                : copy.corrSubException}
            </div>
          </div>
        </div>

        <div className="srcsess">
          <span className="srcsess__ic">{AttIcon.clock}</span>
          <div className="srcsess__b">
            <div className="srcsess__d">
              {sessionContext ? copy.corrSessLabel(sessionContext.dateLabel) : copy.corrSessNoSession}
            </div>
            <div className="srcsess__m">
              <AIc>{AttIcon.pin}</AIc>
              {sessionContext
                ? copy.corrSessMeta(
                    sessionContext.siteName ?? copy.corrSessNoSite,
                    sessionContext.clockInTime ?? copy.corrSessNoRecord,
                    sessionContext.clockOutTime ?? copy.corrSessNoRecord,
                  )
                : copy.corrSessExceptionNote}
            </div>
          </div>
        </div>

        <div className="field">
          <div className="field__l">
            {copy.corrFieldReason} <span className="req">*</span>
          </div>
          <div className="rchips">
            {REASON_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                className={`rchip${reason === v ? " on" : ""}`}
                onClick={() => setReason(v)}
              >
                {reasonLabels[v]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field__l">
            {copy.corrFieldTime} <span className="opt">{copy.corrFieldTimeOpt}</span>
          </div>
          <div className="duo">
            <button
              type="button"
              className="ibox"
              onClick={() => setInPickerOpen(true)}
            >
              <div className="ibox__k">{copy.corrFieldClockIn}</div>
              <div className="ibox__v mono">
                <AIc>{AttIcon.clock}</AIc>
                <span className={inTime ? "" : "ibox__ph"}>
                  {formatTimeDisplay(inTime, locale)}
                </span>
              </div>
            </button>
            <button
              type="button"
              className="ibox"
              onClick={() => setOutPickerOpen(true)}
            >
              <div className="ibox__k">{copy.corrFieldClockOut}</div>
              <div className="ibox__v mono">
                <AIc>{AttIcon.clock}</AIc>
                <span className={outTime ? "" : "ibox__ph"}>
                  {formatTimeDisplay(outTime, locale)}
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="field">
          <div className="field__l">
            {copy.corrFieldSite} <span className="opt">{copy.corrFieldSiteOpt}</span>
          </div>
          <button type="button" className="sitebox" onClick={() => setPickerOpen(true)}>
            <AIc>{AttIcon.pin}</AIc>
            <div className="sitebox__b">
              <b>{siteName ?? copy.corrSiteNone}</b>
              <span>{siteName ? copy.corrFieldSiteChange : copy.corrFieldSiteSelect}</span>
            </div>
            <span className="chev">{AttIcon.chevR}</span>
          </button>
        </div>

        <div className="field">
          <div className="field__l">
            {copy.corrFieldMemo} <span className="opt">{copy.corrFieldMemoOpt}</span>
          </div>
          <textarea
            className="memo"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={copy.corrFieldMemoPlaceholder}
          />
        </div>

        <div className="field">
          <div className="field__l">
            {copy.corrFieldPhoto} <span className="opt">{copy.corrFieldPhotoOpt}</span>
          </div>
          <div className="photos">
            {photos.map((p) => (
              <div
                key={p.id}
                className="photo-thumb"
                style={{ backgroundImage: `url(${p.previewUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
              >
                <button
                  type="button"
                  className="x"
                  onClick={() => removePhoto(p.id)}
                  aria-label={copy.corrFieldPhotoDelete}
                >
                  {AttIcon.x}
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
                <AIc>{AttIcon.image}</AIc>
                <span>{copy.corrFieldPhotoAdd}</span>
              </button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onPickFiles}
          />
          <div className="helper">
            <AIc>{AttIcon.info}</AIc>
            <span>{copy.corrFieldHelper}</span>
          </div>
          {error ? (
            <div className="helper" style={{ color: "var(--danger)" }}>
              <AIc>{AttIcon.warn}</AIc>
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* clock-in time picker */}
      {inPickerOpen && (
        <TimePickerSheet
          value={inTime}
          label={copy.corrFieldClockIn}
          confirmLabel={copy.corrTimeConfirm}
          locale={locale}
          onConfirm={(v) => setInTime(v)}
          onClose={() => setInPickerOpen(false)}
        />
      )}

      {/* clock-out time picker */}
      {outPickerOpen && (
        <TimePickerSheet
          value={outTime}
          label={copy.corrFieldClockOut}
          confirmLabel={copy.corrTimeConfirm}
          locale={locale}
          onConfirm={(v) => setOutTime(v)}
          onClose={() => setOutPickerOpen(false)}
        />
      )}

      {/* desired-site picker — canonical BottomSheet */}
      {pickerOpen && (
        <BottomSheet onClose={() => setPickerOpen(false)} ariaLabel={copy.corrPickerAriaLabel}>
          {({ close }) => (
            <div className="att">
              <h3 className="rsheet__t">{copy.corrPickerTitle}</h3>
              <div className="cpick">
                <button
                  type="button"
                  className={`cpick__item${siteId === null ? " on" : ""}`}
                  onClick={() => {
                    setSiteId(null);
                    close();
                  }}
                >
                  {copy.corrSiteNone}
                </button>
                {sites.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`cpick__item${siteId === s.id ? " on" : ""}`}
                    onClick={() => {
                      setSiteId(s.id);
                      close();
                    }}
                  >
                    <AIc>{AttIcon.pin}</AIc>
                    {s.name}
                  </button>
                ))}
                {sites.length === 0 ? (
                  <div className="cpick__empty">{copy.corrPickerEmpty}</div>
                ) : null}
              </div>
            </div>
          )}
        </BottomSheet>
      )}

      {/* fixed submit bar — portaled to <body> (shell scroll transform traps `position: fixed`). */}
      {hydrated
        ? createPortal(
            <div className="att">
              <div className="submitbar">
                <button type="button" className="submitbtn" onClick={submit} disabled={isPending}>
                  <AIc>{AttIcon.send}</AIc>
                  {isPending ? copy.corrSubmitting : copy.corrSubmit}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function resultGenericSub(copy: AttendanceCopy): string {
  return copy.resultGenericSub;
}
