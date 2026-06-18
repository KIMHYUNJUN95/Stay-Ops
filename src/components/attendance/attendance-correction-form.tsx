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
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
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

type SessionContext = {
  dateLabel: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  siteName: string | null;
};

const REASONS: { value: AttendanceCorrectionReason; label: string }[] = [
  { value: "missing_clock_in", label: "출근 누락" },
  { value: "missing_clock_out", label: "퇴근 누락" },
  { value: "wrong_time", label: "시각 오류" },
  { value: "wrong_site", label: "장소 오류" },
  { value: "auth_failed", label: "인증 실패" },
  { value: "other", label: "기타" },
];

const MAX_PHOTOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function AttendanceCorrectionForm({
  organizationId,
  sessionId,
  sessionContext,
  sites,
}: {
  organizationId: string;
  sessionId: string | null;
  sessionContext: SessionContext | null;
  sites: { id: string; name: string }[];
}) {
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const siteName = useMemo(
    () => (siteId ? (sites.find((s) => s.id === siteId)?.name ?? null) : null),
    [siteId, sites],
  );

  const drag = useSheetDragDismiss({ shown: pickerOpen, onDismiss: () => setPickerOpen(false) });

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    if (selected.some((f) => !ALLOWED_TYPES.includes(f.type))) return;
    if (selected.some((f) => f.size > MAX_BYTES)) return;
    if (photos.length + selected.length > MAX_PHOTOS) {
      setError("사진은 최대 5장까지 첨부할 수 있어요");
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
          setError("사진 업로드에 실패했어요. 다시 시도해 주세요.");
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
          ? "당월·전월 기록만 정정 요청할 수 있어요"
          : res.reason === "forbidden"
            ? "본인 기록에 대해서만 요청할 수 있어요"
            : res.reason === "invalid"
              ? "입력 내용을 확인해 주세요"
              : "잠시 후 다시 시도해 주세요",
      );
    });
  }

  return (
    <div className="att">
      <div className="scroll-pad" style={{ paddingBottom: "96px" }}>
        <div className="caphead">
          <div>
            <div className="capttl">정정 요청</div>
            <div className="capsub">
              {sessionContext ? `${sessionContext.dateLabel} 세션 · ` : "예외 요청 · "}당월·전월만 가능
            </div>
          </div>
        </div>

        <div className="srcsess">
          <span className="srcsess__ic">{AttIcon.clock}</span>
          <div className="srcsess__b">
            <div className="srcsess__d">
              {sessionContext ? `${sessionContext.dateLabel} 근무` : "세션 없는 예외 요청"}
            </div>
            <div className="srcsess__m">
              <AIc>{AttIcon.pin}</AIc>
              {sessionContext
                ? `${sessionContext.siteName ?? "장소 미확인"} · 출근 ${sessionContext.clockInTime ?? "기록 없음"} · 퇴근 ${sessionContext.clockOutTime ?? "기록 없음"}`
                : "오늘 날짜 기준으로 접수돼요"}
            </div>
          </div>
        </div>

        <div className="field">
          <div className="field__l">
            사유 유형 <span className="req">*</span>
          </div>
          <div className="rchips">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`rchip${reason === r.value ? " on" : ""}`}
                onClick={() => setReason(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field__l">
            희망 출 · 퇴근 시각 <span className="opt">선택</span>
          </div>
          <div className="duo">
            <div className="ibox">
              <div className="ibox__k">출근</div>
              <div className="ibox__v mono">
                <AIc>{AttIcon.clock}</AIc>
                <input
                  type="time"
                  className="timein"
                  value={inTime}
                  onChange={(e) => setInTime(e.target.value)}
                />
              </div>
            </div>
            <div className="ibox">
              <div className="ibox__k">퇴근</div>
              <div className="ibox__v mono">
                <AIc>{AttIcon.clock}</AIc>
                <input
                  type="time"
                  className="timein"
                  value={outTime}
                  onChange={(e) => setOutTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <div className="field__l">
            희망 장소 <span className="opt">출/퇴근 동일</span>
          </div>
          <button type="button" className="sitebox" onClick={() => setPickerOpen(true)}>
            <AIc>{AttIcon.pin}</AIc>
            <div className="sitebox__b">
              <b>{siteName ?? "선택 안 함"}</b>
              <span>{siteName ? "탭하여 변경" : "탭하여 현장 선택"}</span>
            </div>
            <span className="chev">{AttIcon.chevR}</span>
          </button>
        </div>

        <div className="field">
          <div className="field__l">
            메모 <span className="opt">선택</span>
          </div>
          <textarea
            className="memo"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="상황을 간단히 적어 주세요 (예: QR 인식이 안 돼 퇴근을 못 찍었어요)"
          />
        </div>

        <div className="field">
          <div className="field__l">
            사진 <span className="opt">선택 · 최대 5장</span>
          </div>
          <div className="photos">
            {photos.map((p) => (
              <div
                key={p.id}
                className="photo-thumb"
                style={{ backgroundImage: `url(${p.previewUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
              >
                <button type="button" className="x" onClick={() => removePhoto(p.id)} aria-label="삭제">
                  {AttIcon.x}
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
                <AIc>{AttIcon.image}</AIc>
                <span>추가</span>
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
            <span>관리자가 검토 후 최종 값을 확정합니다. 자동 반영되지 않아요.</span>
          </div>
          {error ? (
            <div className="helper" style={{ color: "var(--danger)" }}>
              <AIc>{AttIcon.warn}</AIc>
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* desired-site picker — shared drag-dismiss sheet */}
      {hydrated && pickerOpen
        ? createPortal(
            <div className="att">
              <div
                className="dim show"
                style={drag.scrimStyle}
                onClick={() => setPickerOpen(false)}
                aria-hidden="true"
              />
              <div className="rsheet" data-sheet role="dialog" aria-modal="true" style={drag.sheetStyle}>
                <div {...drag.handleProps}>
                  <div className="rsheet__handle" />
                </div>
                <h3 className="rsheet__t">희망 장소</h3>
                <div className="cpick">
                  <button
                    type="button"
                    className={`cpick__item${siteId === null ? " on" : ""}`}
                    onClick={() => {
                      setSiteId(null);
                      setPickerOpen(false);
                    }}
                  >
                    선택 안 함
                  </button>
                  {sites.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`cpick__item${siteId === s.id ? " on" : ""}`}
                      onClick={() => {
                        setSiteId(s.id);
                        setPickerOpen(false);
                      }}
                    >
                      <AIc>{AttIcon.pin}</AIc>
                      {s.name}
                    </button>
                  ))}
                  {sites.length === 0 ? (
                    <div className="cpick__empty">등록된 현장이 없어요</div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* fixed submit bar — portaled to <body> (shell scroll transform traps `position: fixed`). */}
      {hydrated
        ? createPortal(
            <div className="att">
              <div className="submitbar">
                <button type="button" className="submitbtn" onClick={submit} disabled={isPending}>
                  <AIc>{AttIcon.send}</AIc>
                  {isPending ? "보내는 중…" : "정정 요청 보내기"}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
