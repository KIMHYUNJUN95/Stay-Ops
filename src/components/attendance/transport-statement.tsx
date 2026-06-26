"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./transport.css";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { getDictionary, type Dictionary } from "@/lib/i18n";

type TransportItem = {
  id: number;
  date: string;
  building: string;
  context: string;
  amount: number;
  receiptCount: number;
  mode: "linked" | "manual";
  missingReceipt?: boolean;
  /** 객실 번호 (상세 시트용). 없으면 context로 폴백. */
  rooms?: string;
  /** 메모 (상세 시트용). 없으면 폴백 문구. */
  memo?: string;
};

type Props = {
  locale: string;
  userName: string;
  teamName: string;
  monthLabel: string;
};

// Mock data — 6월 1일부터 26일까지 임의 교통비 항목
const MOCK_ITEMS: TransportItem[] = [
  { id: 1,  date: "6/1",  building: "아라키초B", context: "201, 202, 301", amount: 860, receiptCount: 2, mode: "linked" },
  { id: 2,  date: "6/2",  building: "오쿠보C",   context: "302 청소",       amount: 420, receiptCount: 1, mode: "manual" },
  { id: 3,  date: "6/3",  building: "신주쿠A",   context: "청소 3건",       amount: 640, receiptCount: 1, mode: "linked" },
  { id: 4,  date: "6/4",  building: "아라키초B", context: "",              amount: 300, receiptCount: 1, mode: "manual" },
  { id: 5,  date: "6/5",  building: "오쿠보C",   context: "점검 동행",      amount: 520, receiptCount: 0, mode: "manual", missingReceipt: true },
  { id: 6,  date: "6/6",  building: "신주쿠A",   context: "201, 205",      amount: 580, receiptCount: 2, mode: "linked" },
  { id: 7,  date: "6/7",  building: "아라키초B", context: "301",           amount: 300, receiptCount: 1, mode: "linked" },
  { id: 8,  date: "6/8",  building: "오쿠보C",   context: "",              amount: 420, receiptCount: 1, mode: "manual" },
  { id: 9,  date: "6/9",  building: "신주쿠A",   context: "청소 2건",       amount: 480, receiptCount: 1, mode: "linked" },
  { id: 10, date: "6/10", building: "아라키초B", context: "201, 202",      amount: 700, receiptCount: 2, mode: "linked" },
  { id: 11, date: "6/11", building: "오쿠보C",   context: "303 점검",       amount: 420, receiptCount: 1, mode: "manual" },
  { id: 12, date: "6/12", building: "아라키초B", context: "201, 202, 301", amount: 860, receiptCount: 2, mode: "linked" },
  { id: 13, date: "6/13", building: "신주쿠A",   context: "",              amount: 300, receiptCount: 0, mode: "manual", missingReceipt: true },
  { id: 14, date: "6/14", building: "오쿠보C",   context: "302 청소",       amount: 420, receiptCount: 1, mode: "linked" },
  { id: 15, date: "6/15", building: "오쿠보C",   context: "점검 동행",      amount: 520, receiptCount: 1, mode: "manual" },
  { id: 16, date: "6/16", building: "아라키초B", context: "301, 302",      amount: 700, receiptCount: 2, mode: "linked" },
  { id: 17, date: "6/17", building: "신주쿠A",   context: "201 청소",       amount: 300, receiptCount: 1, mode: "linked" },
  { id: 18, date: "6/18", building: "오쿠보C",   context: "",              amount: 420, receiptCount: 1, mode: "manual" },
  { id: 19, date: "6/19", building: "아라키초B", context: "201, 202, 301", amount: 860, receiptCount: 2, mode: "linked" },
  { id: 20, date: "6/20", building: "신주쿠A",   context: "청소 3건",       amount: 640, receiptCount: 1, mode: "linked" },
  { id: 21, date: "6/21", building: "오쿠보C",   context: "303 점검",       amount: 420, receiptCount: 0, mode: "manual", missingReceipt: true },
  { id: 22, date: "6/22", building: "신주쿠A",   context: "202 청소",       amount: 300, receiptCount: 1, mode: "linked" },
  { id: 23, date: "6/23", building: "아라키초B", context: "201",           amount: 300, receiptCount: 1, mode: "manual" },
  { id: 24, date: "6/24", building: "오쿠보C",   context: "302, 303",      amount: 580, receiptCount: 2, mode: "linked" },
  { id: 25, date: "6/25", building: "아라키초B", context: "301",           amount: 300, receiptCount: 1, mode: "manual" },
  { id: 26, date: "6/26", building: "신주쿠A",   context: "205 청소",       amount: 480, receiptCount: 1, mode: "linked" },
];

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4v12M7 12l5 5 5-5M4 20h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5M12 16v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 3H15L17 5H21C21.6 5 22 5.4 22 6V19C22 19.6 21.6 20 21 20H3C2.4 20 2 19.6 2 19V6C2 5.4 2.4 5 3 5H7L9 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 11V8a2 2 0 00-4 0v3M14 11V7a2 2 0 00-4 0v4M10 11V9a2 2 0 00-4 0v7a6 6 0 006 6h2a6 6 0 006-6v-3a2 2 0 00-4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
// Detail-sheet row icons (ported from "05" mockup)
function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5.5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4 9.5h16M8 4v3M16 4v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function WonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 9l1.6 6 1.7-4.2L12.5 15l1.6-6M6.8 11.3h10.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="3.5" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2M10 20.5v-3h4v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function DoorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 20.5V4.5a1 1 0 011-1h10a1 1 0 011 1v16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 20.5h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="14.5" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 4.5h14v11l-4 4H5v-15z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15 19.5v-4h4M8.5 9h7M8.5 12.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20l.8-3.6L15.4 5.8a2 2 0 012.8 2.8L7.6 19.2 4 20z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0111 4h2a1.5 1.5 0 011.5 1.5V7M6.5 7l.8 12A1.5 1.5 0 008.8 20h6.4a1.5 1.5 0 001.5-1.4l.8-12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.2l2.6 2.6L16 9.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AlertTriangleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
}

function fmtYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

/** "6/2" → { full: "6월 2일", weekday: "월" } (Tokyo, 2026년 기준) */
function fmtDateParts(date: string, localeTag: string): { full: string; weekday: string } {
  const [m, d] = date.split("/").map((x) => parseInt(x, 10));
  const iso = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+09:00`;
  const dt = new Date(iso);
  const full = new Intl.DateTimeFormat(localeTag, {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(dt);
  const weekday = new Intl.DateTimeFormat(localeTag, {
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(dt);
  return { full, weekday };
}

/** context "201, 202, 301" → "201 · 202 · 301" */
function roomsLabel(item: TransportItem): string {
  const raw = item.rooms ?? item.context;
  if (!raw) return "-";
  return raw.replace(/\s*,\s*/g, " · ");
}

function ItemBadge({ item, dict }: { item: TransportItem; dict: Dictionary }) {
  const t = dict.transport;
  if (item.receiptCount === 0) {
    return <span className="trn-miss-badge">{t.badgeMissing}</span>;
  }
  if (item.mode === "linked") {
    return <span className="trn-lk">{t.badgeAuto(item.receiptCount)}</span>;
  }
  return <span className="trn-mn">{t.badgeManual(item.receiptCount)}</span>;
}

function AddItemSheet({ dict, onClose }: { dict: Dictionary; onClose: () => void }) {
  const t = dict.transport;
  const [inputMode, setInputMode] = useState<"linked" | "manual">("linked");

  return (
    <BottomSheet onClose={onClose} className="max-h-[88dvh] flex flex-col">
      <div className="trn trn-form">
        <div className="trn-sh-h">{t.addSheetTitle}</div>

        <div className="trn-row2">
          <div className="trn-tf">
            <div className="trn-tf-l">{t.fieldDate}</div>
            <div className="trn-tf-in">6월 15일 (월)</div>
          </div>
          <div className="trn-tf">
            <div className="trn-tf-l">{t.fieldAmount} <b>*</b></div>
            <div className="trn-tf-in trn-amt-in">
              520
              <span className="trn-un">{t.amountUnit}</span>
            </div>
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldBuilding}</div>
          <div className="trn-tf-in">
            오쿠보C <ChevDownIcon />
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldContext}</div>
          <div className="trn-tf-in">
            <span className="trn-ph">점검 동행</span>
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldReceipt}</div>
          <div className="trn-shots">
            <div className="trn-shot" />
            <button type="button" className="trn-shot-add" aria-label="사진 추가">
              <CameraIcon />
            </button>
          </div>
          <div className="trn-hint">
            <AlertIcon />
            {t.fieldReceiptHint}
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldMemo}</div>
          <div className="trn-tf-in">
            <span className="trn-ph" style={{ color: "var(--faint)" }}>예) 왕복 교통비</span>
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldInputMode}</div>
          <div className="trn-seg">
            <button
              type="button"
              className={inputMode === "linked" ? "trn-on" : ""}
              onClick={() => setInputMode("linked")}
            >
              <LinkIcon />
              {t.modeAutoLink}
            </button>
            <button
              type="button"
              className={inputMode === "manual" ? "trn-on" : ""}
              onClick={() => setInputMode("manual")}
            >
              <HandIcon />
              {t.modeManual}
            </button>
          </div>
        </div>

        <button type="button" className="trn-add-submit" onClick={onClose}>
          {t.addSheetSubmit}
        </button>
      </div>
    </BottomSheet>
  );
}

function DetailRow({
  icon,
  label,
  children,
  amount = false,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  amount?: boolean;
}) {
  return (
    <div className="trn-row">
      <span className="trn-ri">{icon}</span>
      <span className="trn-rk">{label}</span>
      <span className={`trn-rv${amount ? " trn-rv-amt" : ""}`}>{children}</span>
    </div>
  );
}

function DetailSheet({
  item,
  dict,
  localeTag,
  onClose,
  onEdit,
  onDelete,
}: {
  item: TransportItem;
  dict: Dictionary;
  localeTag: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = dict.transport;
  const { full, weekday } = fmtDateParts(item.date, localeTag);
  const isLinked = item.mode === "linked";
  const memo = item.memo ?? `${item.building} ${t.homeTransportSub}`;

  return (
    <BottomSheet onClose={onClose} className="max-h-[82dvh] flex flex-col">
      {({ close }) => (
        <div className="trn trn-detail">
          <div className="trn-detail-title">{t.detailTitle}</div>

          {/* Receipt photo strip */}
          {item.receiptCount > 0 ? (
            <div className="trn-dshots">
              {Array.from({ length: Math.min(item.receiptCount, 2) }).map((_, i) => (
                <div key={i} className="trn-dshot" style={{ width: "50%" }}>
                  <span className="trn-dshot__l">{t.receiptLabel(i + 1)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="trn-dshot-empty">{t.detailNoReceipt}</div>
          )}

          {/* Rows */}
          <DetailRow icon={<CalIcon />} label={t.fieldDate}>
            {full} ({weekday})
          </DetailRow>
          <DetailRow icon={<WonIcon />} label={t.fieldAmount} amount>
            {fmtYen(item.amount)}
          </DetailRow>
          <DetailRow icon={<BuildingIcon />} label={t.fieldBuilding}>
            {item.building}
          </DetailRow>
          <DetailRow icon={<DoorIcon />} label={t.detailRoom}>
            {roomsLabel(item)}
          </DetailRow>
          <DetailRow icon={<LinkIcon />} label={t.detailInput}>
            <span className={`trn-mode ${isLinked ? "trn-mode-link" : "trn-mode-manual"}`}>
              {isLinked ? <LinkIcon /> : <HandIcon />}
              {isLinked ? t.detailModeAuto : t.detailModeManual}
            </span>
          </DetailRow>
          <DetailRow icon={<NoteIcon />} label={t.detailMemoShort}>
            {memo}
          </DetailRow>

          {/* Actions — slide the detail out first, then open the next sheet */}
          <div className="trn-dacts">
            <button
              type="button"
              className="trn-a-edit"
              onClick={() => {
                onEdit();
                close();
              }}
            >
              <EditIcon />
              {t.detailEdit}
            </button>
            <button
              type="button"
              className="trn-a-del"
              onClick={() => {
                onDelete();
                close();
              }}
            >
              <TrashIcon />
              {t.detailDelete}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/** Edit sheet — controlled form pre-filled from the item; saves real changes. */
function EditItemSheet({
  item,
  dict,
  localeTag,
  onClose,
  onSave,
}: {
  item: TransportItem;
  dict: Dictionary;
  localeTag: string;
  onClose: () => void;
  onSave: (patch: Pick<TransportItem, "amount" | "context" | "memo" | "mode">) => void;
}) {
  const t = dict.transport;
  const { full, weekday } = fmtDateParts(item.date, localeTag);
  const [amount, setAmount] = useState(String(item.amount));
  const [context, setContext] = useState(item.context);
  const [memo, setMemo] = useState(item.memo ?? "");
  const [mode, setMode] = useState<"linked" | "manual">(item.mode);

  const buildPatch = () => ({
    amount: Math.max(0, parseInt(amount.replace(/[^\d]/g, ""), 10) || 0),
    context: context.trim(),
    memo: memo.trim(),
    mode,
  });

  return (
    <BottomSheet onClose={onClose} className="max-h-[88dvh] flex flex-col">
      {({ close }) => (
      <div className="trn trn-form">
        <div className="trn-sh-h">{t.editSheetTitle}</div>

        <div className="trn-row2">
          <div className="trn-tf">
            <div className="trn-tf-l">{t.fieldDate}</div>
            <div className="trn-tf-in">
              {full} ({weekday})
            </div>
          </div>
          <div className="trn-tf">
            <div className="trn-tf-l">{t.fieldAmount} <b>*</b></div>
            <div className="trn-tf-in trn-amt-in">
              <input
                className="trn-input trn-input-amt"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label={t.fieldAmount}
              />
              <span className="trn-un">{t.amountUnit}</span>
            </div>
          </div>
        </div>

        <div className="trn-row2">
          <div className="trn-tf">
            <div className="trn-tf-l">{t.fieldBuilding}</div>
            <div className="trn-tf-in">
              {item.building} <ChevDownIcon />
            </div>
          </div>
          <div className="trn-tf">
            <div className="trn-tf-l">{t.detailRoom}</div>
            <div className="trn-tf-in">
              <input
                className="trn-input"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="201, 202"
                aria-label={t.fieldContext}
              />
            </div>
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldReceipt}</div>
          <div className="trn-shots">
            {Array.from({ length: Math.max(1, Math.min(item.receiptCount, 2)) }).map((_, i) =>
              i < item.receiptCount ? (
                <div key={i} className="trn-shot" />
              ) : (
                <button key={i} type="button" className="trn-shot-add" aria-label="사진 추가">
                  <CameraIcon />
                </button>
              ),
            )}
            {item.receiptCount < 2 && (
              <button type="button" className="trn-shot-add" aria-label="사진 추가">
                <CameraIcon />
              </button>
            )}
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldMemo}</div>
          <div className="trn-tf-in">
            <input
              className="trn-input"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예) 왕복 교통비"
              aria-label={t.fieldMemo}
            />
          </div>
        </div>

        <div className="trn-tf">
          <div className="trn-tf-l">{t.fieldInputMode}</div>
          <div className="trn-seg">
            <button
              type="button"
              className={mode === "linked" ? "trn-on" : ""}
              onClick={() => setMode("linked")}
            >
              <LinkIcon />
              {t.modeAutoLink}
            </button>
            <button
              type="button"
              className={mode === "manual" ? "trn-on" : ""}
              onClick={() => setMode("manual")}
            >
              <HandIcon />
              {t.modeManual}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="trn-add-submit"
          onClick={() => {
            onSave(buildPatch());
            close();
          }}
        >
          {t.editSheetSubmit}
        </button>
      </div>
      )}
    </BottomSheet>
  );
}

/** Delete confirmation — center-aligned alert modal (intentional BottomSheet exception). */
function DeleteConfirmSheet({
  item,
  dict,
  onCancel,
  onConfirm,
}: {
  item: TransportItem;
  dict: Dictionary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = dict.transport;
  const [pending, setPending] = useState(false);

  return (
    <BottomSheet
      onClose={onCancel}
      ariaLabel={t.deleteTitle}
      header={
        <div className="trn">
          <div className="trn-confirm-head">
            <div className="trn-confirm-ic">
              <AlertTriangleIcon />
            </div>
            <div>
              <div className="trn-confirm-title">{t.deleteTitle}</div>
              <div className="trn-confirm-body">{t.deleteBody}</div>
            </div>
          </div>
        </div>
      }
    >
      {({ close }) => (
        <div className="trn">
          <div className="trn-confirm-card">
            <span className="k">
              {item.date} · {item.building}
            </span>
            <span className="v">{fmtYen(item.amount)}</span>
          </div>
          <div className="trn-confirm-acts">
            <button
              type="button"
              className="trn-confirm-cancel"
              disabled={pending}
              onClick={() => {
                if (pending) return;
                close();
              }}
            >
              {t.deleteCancel}
            </button>
            <button
              type="button"
              className="trn-confirm-delete"
              disabled={pending}
              onClick={() => {
                if (pending) return;
                setPending(true);
                close();
                onConfirm();
              }}
            >
              {pending ? <span className="trn-spin" /> : <TrashIcon />}
              {t.deleteConfirm}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/** Lightweight action-feedback toast (auto-dismiss). */
function Toast({
  message,
  tone,
  onDone,
}: {
  message: string;
  tone: "ok" | "del";
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2200);
    const t2 = setTimeout(onDone, 2200 + 260);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`trn-toast${leaving ? " trn-toast-out" : ""}`} role="status">
      <span className={tone === "ok" ? "trn-toast-ic-ok" : "trn-toast-ic-del"}>
        {tone === "ok" ? <CheckCircleIcon /> : <TrashIcon />}
      </span>
      {message}
    </div>,
    document.body,
  );
}

export function TransportStatement({ locale, userName, teamName, monthLabel }: Props) {
  const dict = getDictionary(locale);
  const t = dict.transport;
  const localeTag = locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "ko-KR";

  // Items live in state so add/edit/delete are real, verifiable interactions.
  const [items, setItems] = useState<TransportItem[]>(MOCK_ITEMS);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // One sheet at a time: detail slides OUT, then (per intent) edit/delete slides IN.
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const intentRef = useRef<"edit" | "delete" | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "del" } | null>(null);

  const total = items.reduce((s, x) => s + x.amount, 0);
  const selectedItem = items.find((x) => x.id === selectedId) ?? null;

  const dismissToast = useCallback(() => setToast(null), []);

  // Detail sheet finished its slide-out → open the next sheet (or clear selection).
  const handleDetailClosed = useCallback(() => {
    const intent = intentRef.current;
    intentRef.current = null;
    if (intent === "edit") setShowEdit(true);
    else if (intent === "delete") setShowDelete(true);
    else setSelectedId(null);
  }, []);

  const handleSave = useCallback(
    (patch: Pick<TransportItem, "amount" | "context" | "memo" | "mode">) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedId
            ? {
                ...it,
                ...patch,
                // 증빙이 있으면 누락 플래그 해제
                missingReceipt: it.receiptCount > 0 ? undefined : it.missingReceipt,
              }
            : it,
        ),
      );
      // showEdit는 시트의 슬라이드아웃(close) 후 onClose에서 false 처리됨.
      setToast({ message: t.toastSaved, tone: "ok" });
    },
    [selectedId, t.toastSaved],
  );

  const handleDelete = useCallback(() => {
    const id = selectedId;
    // 확인 모달의 슬라이드아웃(320ms)이 끝난 뒤 실제 제거 + 토스트
    setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id));
      setShowDelete(false);
      setSelectedId(null);
      setToast({ message: t.toastDeleted, tone: "del" });
    }, 340);
  }, [selectedId, t.toastDeleted]);

  return (
    <div className="trn">
      {/* Top action bar */}
      <div className="trn-top">
        <button type="button" className="trn-add" onClick={() => setShowAddSheet(true)}>
          <PlusIcon />
          {t.addBtn}
        </button>
        <button type="button" className="trn-xls">
          <DownloadIcon />
          {t.excelBtn}
        </button>
      </div>

      {/* Document card */}
      <div className="trn-doc">
        {/* Header */}
        <div className="trn-dh">
          <div className="trn-dt">{t.statementTitle}</div>
          <div className="trn-dm">
            <span>{userName} · {teamName}</span>
            <span>{monthLabel}</span>
          </div>
          <div className="trn-tot">
            <span className="trn-l">{t.claimTotal}</span>
            <span className="trn-v">{fmtYen(total)}</span>
          </div>
        </div>

        {/* Line items */}
        {items.map((item, idx) => (
          <button
            type="button"
            key={item.id}
            className={`trn-line${item.id === selectedId ? " trn-sel" : ""}`}
            onClick={() => {
              setSelectedId(item.id);
              setShowEdit(false);
              setShowDelete(false);
            }}
          >
            <span className="trn-no">{String(idx + 1).padStart(2, "0")}</span>
            <div className="trn-c">
              <div className="trn-c1">
                <span className="trn-dt-label">{item.date}</span>
                {item.building}
              </div>
              <div className="trn-c2">
                {item.context ? <>{item.context} · </> : null}
                <ItemBadge item={item} dict={dict} />
              </div>
            </div>
            <span className={`trn-amt${item.missingReceipt ? " trn-miss" : ""}`}>
              {fmtYen(item.amount)}
            </span>
          </button>
        ))}

        {/* Summary footer */}
        <div className="trn-sum">
          <span className="trn-sl">{t.sumLabel(items.length)}</span>
          <span className="trn-sv">{fmtYen(total)}</span>
        </div>
      </div>

      {/* Submit */}
      <div className="trn-acts">
        <button type="button" className="trn-submit">
          {t.submitBtn}
        </button>
      </div>

      {showAddSheet && (
        <AddItemSheet dict={dict} onClose={() => setShowAddSheet(false)} />
      )}

      {/* Detail sheet — only shows when neither edit nor delete is active (one sheet at a time) */}
      {selectedItem && !showEdit && !showDelete && (
        <DetailSheet
          item={selectedItem}
          dict={dict}
          localeTag={localeTag}
          onClose={handleDetailClosed}
          onEdit={() => {
            intentRef.current = "edit";
          }}
          onDelete={() => {
            intentRef.current = "delete";
          }}
        />
      )}

      {/* Edit sheet — opens after the detail finishes sliding out */}
      {selectedItem && showEdit && (
        <EditItemSheet
          item={selectedItem}
          dict={dict}
          localeTag={localeTag}
          onClose={() => {
            setShowEdit(false);
            setSelectedId(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Delete confirm — opens after the detail finishes sliding out */}
      {selectedItem && showDelete && (
        <DeleteConfirmSheet
          item={selectedItem}
          dict={dict}
          onCancel={() => {
            setShowDelete(false);
            setSelectedId(null);
          }}
          onConfirm={handleDelete}
        />
      )}

      {toast && (
        <Toast message={toast.message} tone={toast.tone} onDone={dismissToast} />
      )}
    </div>
  );
}
