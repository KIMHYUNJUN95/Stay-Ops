"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Receipt, X } from "lucide-react";
import type { AdminReceiptItem, AdminTransportReceiptsView } from "@/lib/admin-attendance";
import { getDictionary, type Locale } from "@/lib/i18n";
import { adminTransportStatusPill } from "../shared/admin-format";
import "@/components/admin/admin-console.css";

// Desktop receipt reviewer — a CONTACT-SHEET grid of the month's receipts (all thumbnails at once,
// each captioned with date/amount/building) so a whole month is scannable in one screen without the
// wasted whitespace of a one-photo-at-a-time layout. Clicking a thumbnail opens a focused overlay
// (large image, click-to-zoom, ←/→ across every receipt, "open original", Esc/backdrop to close).

type PhotoCell = { url: string; item: AdminReceiptItem; photoNo: number; photoCount: number };

function fmtDate(usageDate: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${usageDate}T00:00:00+09:00`));
}

export function TransportReceiptView({
  data,
  locale,
  localeTag,
}: {
  data: AdminTransportReceiptsView;
  locale: Locale;
  localeTag: string;
}) {
  const c = getDictionary(locale).admin.attendanceConsole;
  const nf = useMemo(() => new Intl.NumberFormat(localeTag), [localeTag]);
  const yen = useCallback((n: number) => `${c.yenSym}${nf.format(n)}`, [c.yenSym, nf]);
  const pill = adminTransportStatusPill(data.reportStatus, c);

  // Flatten every receipt photo into one ordered sequence for the grid + focus navigation.
  const photos = useMemo<PhotoCell[]>(
    () =>
      data.items.flatMap((item) =>
        item.imageUrls.map((url, k) => ({
          url,
          item,
          photoNo: k + 1,
          photoCount: item.imageUrls.length,
        })),
      ),
    [data.items],
  );
  const missingItems = useMemo(
    () => data.items.filter((it) => it.imageUrls.length === 0),
    [data.items],
  );

  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);

  const move = useCallback(
    (delta: number) => {
      setZoom(false);
      setFocusIdx((i) => {
        if (i === null) return i;
        return Math.min(photos.length - 1, Math.max(0, i + delta));
      });
    },
    [photos.length],
  );

  useEffect(() => {
    if (focusIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocusIdx(null);
      else if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIdx, move]);

  const focus = focusIdx !== null ? photos[focusIdx] : null;

  return (
    <div className="adm" style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 22px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        <span className="ic" style={{ color: "var(--primary)" }}>
          <Receipt />
        </span>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ink)" }}>{data.staffName}</div>
        <span className={`pill ${pill.cls}`}>
          <span className="d" />
          {pill.label}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{data.monthLabel}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
          {c.trReceiptCount(data.items.length)} · {c.trReceiptPhotoCount(photos.length)}
        </span>
        <span className="mono" style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
          {yen(data.totalAmount)}
        </span>
      </div>

      {data.items.length === 0 ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <div className="state">
            <span className="state__ic empty">
              <span className="ic">
                <ImageOff />
              </span>
            </span>
            <div className="state__s">{c.trReceiptNoImages}</div>
          </div>
        </div>
      ) : (
        <div style={{ padding: "20px 22px 40px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
              gap: 16,
            }}
          >
            {photos.map((cell, i) => (
              <button
                key={`${cell.item.itemId}-${cell.photoNo}`}
                type="button"
                onClick={() => {
                  setZoom(false);
                  setFocusIdx(i);
                }}
                style={{
                  padding: 0,
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--surface)",
                  cursor: "zoom-in",
                  textAlign: "left",
                  boxShadow: "0 4px 14px -10px rgba(31,42,68,.4)",
                }}
              >
                <div style={{ position: "relative", aspectRatio: "3 / 4", background: "var(--surface2)" }}>
                  <img
                    src={cell.url}
                    alt=""
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  {cell.photoCount > 1 ? (
                    <span
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#fff",
                        background: "rgba(0,0,0,.55)",
                        borderRadius: 6,
                        padding: "1px 6px",
                      }}
                    >
                      {cell.photoNo}/{cell.photoCount}
                    </span>
                  ) : null}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ink)" }}>
                      {fmtDate(cell.item.usageDate, localeTag)}
                    </span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
                      {yen(cell.item.amountYen)}
                    </span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cell.item.buildingLabel || cell.item.contextLabel || "—"}
                  </div>
                </div>
              </button>
            ))}

            {/* Items with no receipt — shown so a missing day isn't invisible to accounting. */}
            {missingItems.map((item) => (
              <div
                key={`empty-${item.itemId}`}
                style={{
                  border: "1px dashed var(--line)",
                  borderRadius: 12,
                  background: "var(--surface)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ aspectRatio: "3 / 4", display: "grid", placeItems: "center", color: "var(--warn)" }}>
                  <span style={{ display: "grid", placeItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                    <span className="ic">
                      <ImageOff />
                    </span>
                    {c.trReceiptMissing}
                  </span>
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ink)" }}>
                      {fmtDate(item.usageDate, localeTag)}
                    </span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
                      {yen(item.amountYen)}
                    </span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "var(--muted)" }}>
                    {item.buildingLabel || item.contextLabel || "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Focus overlay */}
      {focus ? (
        <div
          onClick={() => setFocusIdx(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15,20,34,.82)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Focus top bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", color: "#fff" }}
          >
            <span style={{ fontSize: 14, fontWeight: 800 }}>{fmtDate(focus.item.usageDate, localeTag)}</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{yen(focus.item.amountYen)}</span>
            {focus.item.buildingLabel ? (
              <span style={{ fontSize: 13, opacity: 0.8 }}>· {focus.item.buildingLabel}</span>
            ) : null}
            <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
              {focusIdx! + 1} / {photos.length}
            </span>
            <a
              href={focus.url}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", opacity: 0.9 }}
            >
              <span className="ic"><ExternalLink /></span>
              {c.trReceiptOpenOriginal}
            </a>
            <button type="button" onClick={() => setFocusIdx(null)} aria-label={c.panelClose} style={FOCUS_ICON_BTN}>
              <span className="ic"><X /></span>
            </button>
          </div>

          {/* Focus image area */}
          <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 64px 24px" }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); move(-1); }}
              disabled={focusIdx === 0}
              aria-label={c.panelPrev}
              style={{ ...FOCUS_NAV_BTN, left: 12 }}
            >
              <span className="ic"><ChevronLeft /></span>
            </button>

            <div
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "100%", maxHeight: "100%", overflow: zoom ? "auto" : "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <img
                src={focus.url}
                alt=""
                onClick={() => setZoom((z) => !z)}
                title={c.trReceiptOpenHint}
                style={{
                  display: "block",
                  width: zoom ? "auto" : "auto",
                  height: zoom ? "auto" : "auto",
                  maxWidth: zoom ? "none" : "min(90vw, 1100px)",
                  maxHeight: zoom ? "none" : "82vh",
                  objectFit: "contain",
                  borderRadius: 8,
                  background: "#fff",
                  cursor: zoom ? "zoom-out" : "zoom-in",
                  boxShadow: "0 20px 60px -20px rgba(0,0,0,.7)",
                }}
              />
            </div>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); move(1); }}
              disabled={focusIdx === photos.length - 1}
              aria-label={c.panelNext}
              style={{ ...FOCUS_NAV_BTN, right: 12 }}
            >
              <span className="ic"><ChevronRight /></span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const FOCUS_ICON_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.25)",
  background: "rgba(255,255,255,.1)",
  color: "#fff",
  cursor: "pointer",
};

const FOCUS_NAV_BTN: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,.25)",
  background: "rgba(255,255,255,.12)",
  color: "#fff",
  cursor: "pointer",
};
