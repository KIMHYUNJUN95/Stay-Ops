"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  Filter,
  Link2,
  LogOut,
  MessageSquare,
  Pencil,
  Receipt,
  RotateCcw,
  Shield,
  Wallet,
  X,
} from "lucide-react";
import type { AdminTransportRow } from "@/lib/admin-attendance";
import type { TransportReportStatus } from "@/lib/transport-reimbursement";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import {
  exportMonthlyTransportReport,
  exportMonthlyTransportWorkbook,
  loadAdminTransportDetail,
  setTransportReportReview,
  type AdminTransportDetailResult,
  type AdminTransportItemView,
} from "@/app/admin/attendance/actions";
import { AdminReasonModal } from "../shared/admin-reason-modal";
import { ImageLightbox } from "@/components/shell/image-lightbox";
import { useAdminPanelA11y } from "../shared/use-admin-panel-a11y";
import {
  adminTransportStatusPill,
  downloadAdminWorkbook,
  formatAdminYen,
} from "../shared/admin-format";

type Att = Dictionary["admin"]["attendanceConsole"];

function Ic({ children }: { children: React.ReactNode }) {
  return <span className="ic">{children}</span>;
}
function initial(name: string): string {
  return name.trim().slice(0, 1) || "·";
}
function fmtUsageDate(iso: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${iso}T00:00:00+09:00`));
}
function fmtSubmitted(iso: string | null, localeTag: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function AttendanceTransportClient({
  ym,
  monthLabel,
  initialRows,
  initialUserId = null,
  locale,
  localeTag,
}: {
  ym: string;
  monthLabel: string;
  initialRows: AdminTransportRow[];
  initialUserId?: string | null;
  locale: Locale;
  localeTag: string;
}) {
  const c = getDictionary(locale).admin.attendanceConsole;
  const [rows, setRows] = useState(initialRows);
  const [panelUserId, setPanelUserId] = useState<string | null>(
    initialUserId && initialRows.some((r) => r.userId === initialUserId) ? initialUserId : null,
  );
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const showToast = (msg: string) => setToast({ id: Date.now(), msg });
  const [pendingMonthExport, startMonthExport] = useTransition();
  const [pendingPdfExport, startPdfExport] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const panelRow = panelUserId ? rows.find((r) => r.userId === panelUserId) ?? null : null;
  const liveKpi = useMemo(
    () => ({
      pendingReview: rows.filter((r) => r.status === "submitted" || r.status === "reviewing").length,
      submittedTotal: rows
        .filter((r) => r.status === "submitted" || r.status === "reviewing" || r.status === "approved")
        .reduce((sum, r) => sum + r.totalAmount, 0),
      approvedTotal: rows.filter((r) => r.status === "approved").length,
    }),
    [rows],
  );

  function applyStatus(userId: string, status: TransportReportStatus) {
    setRows((prev) => prev.map((r) => (r.userId === userId ? { ...r, status } : r)));
  }

  function doMonthlyExport() {
    startMonthExport(async () => {
      const res = await exportMonthlyTransportWorkbook(ym);
      if (res.ok) {
        downloadAdminWorkbook(res.base64, res.filename);
        showToast(c.payActionDoneExport);
      } else if (res.reason === "empty") {
        showToast(c.trExportEmpty);
      } else {
        showToast(c.payActionExportFailed);
      }
    });
  }

  function doPdfExport() {
    // Open the tab synchronously (on the click) so pop-up blockers don't kill it after the await.
    const win = window.open("", "_blank");
    startPdfExport(async () => {
      const res = await exportMonthlyTransportReport(ym);
      if (!res.ok) {
        win?.close();
        showToast(res.reason === "empty" ? c.trExportEmpty : c.payActionExportFailed);
        return;
      }
      if (!win) {
        showToast(c.payExportPdfBlocked);
        return;
      }
      win.document.open();
      win.document.write(res.html);
      win.document.close();
    });
  }

  return (
    <div style={{ position: "relative" }}>
      {/* KPI mini-row — 3 cells */}
      <div
        className="opsbar"
        style={{ marginBottom: 18, gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <Wallet />
            </Ic>
            {c.trKpiPending}
          </div>
          <div className="opscell__v">{liveKpi.pendingReview}</div>
          <div className="opscell__sub">{c.unitPeople}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <Wallet />
            </Ic>
            {c.trKpiSubmitted}
          </div>
          <div className="opscell__v mono">
            {c.yenSym}
            {formatAdminYen(liveKpi.submittedTotal, localeTag)}
          </div>
          <div className="opscell__sub">{monthLabel}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <Check />
            </Ic>
            {c.trKpiApproved}
          </div>
          <div className="opscell__v">{liveKpi.approvedTotal}</div>
          <div className="opscell__sub">{c.unitPeople}</div>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="chipbtn" disabled aria-disabled="true">
          <Ic>
            <Filter />
          </Ic>
          {c.trFilterStatus}
          <span className="ic chev">
            <ChevronDown />
          </span>
        </button>
        <span className="toolbar__spacer" />
        <button
          type="button"
          className="chipbtn"
          onClick={doPdfExport}
          disabled={pendingPdfExport}
        >
          <Ic>
            <FileText />
          </Ic>
          {pendingPdfExport ? c.payActionExporting : c.trExportPdf}
        </button>
        <button
          type="button"
          className="chipbtn"
          onClick={doMonthlyExport}
          disabled={pendingMonthExport}
        >
          <Ic>
            <Download />
          </Ic>
          {pendingMonthExport ? c.payActionExporting : c.trExportMonthly}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="state">
            <span className="state__ic empty">
              <Ic>
                <Wallet />
              </Ic>
            </span>
            <div className="state__t">{c.trEmptyTitle}</div>
            <div className="state__s">{c.trEmptyBody}</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="qtbl">
            <thead>
              <tr>
                <th style={{ paddingLeft: 16 }}>{c.trColStaff}</th>
                <th>{c.trColItems}</th>
                <th>{c.trColTotal}</th>
                <th>{c.trColStatus}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = adminTransportStatusPill(r.status, c);
                const sel = panelUserId === r.userId;
                const noReport = r.status === "none";
                return (
                  <tr
                    key={r.userId}
                    className={sel ? "sel" : ""}
                    onClick={() => setPanelUserId(r.userId)}
                  >
                    <td style={{ paddingLeft: 16 }}>
                      <div className="who">
                        <span
                          className="uhead__av"
                          style={{
                            background: "var(--primary)",
                            width: 34,
                            height: 34,
                            borderRadius: 9,
                            fontSize: 13,
                          }}
                        >
                          {initial(r.userName)}
                        </span>
                        <div>
                          <div className="who__nm">{r.userName}</div>
                          <div className="who__sub">
                            {noReport ? c.trStatusNone : `${r.itemCount}${c.unitCount}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{noReport ? "—" : r.itemCount}</td>
                    <td className="mono">
                      {noReport ? (
                        <span className="dim-cell">—</span>
                      ) : (
                        <>
                          <span style={{ color: "var(--muted)" }}>{c.yenSym}</span>
                          {formatAdminYen(r.totalAmount, localeTag)}
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${pill.cls}`}>
                        <span className="d" />
                        {pill.label}
                      </span>
                    </td>
                    <td className="colchev">
                      <Ic>
                        <ChevronRight />
                      </Ic>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panelRow ? (
        <TransportPanel
          ym={ym}
          monthLabel={monthLabel}
          row={panelRow}
          c={c}
          localeTag={localeTag}
          onClose={() => setPanelUserId(null)}
          onStatusChange={(userId, status, msg) => {
            applyStatus(userId, status);
            showToast(msg);
          }}
        />
      ) : null}

      {toast ? (
        <div key={toast.id} role="status" className="adm-toast" onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}

function TransportPanel({
  ym,
  monthLabel,
  row,
  c,
  localeTag,
  onClose,
  onStatusChange,
}: {
  ym: string;
  monthLabel: string;
  row: AdminTransportRow;
  c: Att;
  localeTag: string;
  onClose: () => void;
  onStatusChange: (userId: string, status: TransportReportStatus, toast: string) => void;
}) {
  const [detail, setDetail] = useState<AdminTransportDetailResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<"approve" | "reject" | "requestFix" | "reopen" | null>(null);
  const loading = detail === null && err === null;
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, {
    disabled: modal !== null || lightboxIndex !== null,
  });

  useEffect(() => {
    let cancelled = false;
    loadAdminTransportDetail(row.userId, ym)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        if (!res.ok && res.reason !== "not_found") {
          setErr(c.trActionLoadFailed);
        }
      })
      .catch(() => {
        if (!cancelled) setErr(c.trActionLoadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [row.userId, ym, c.trActionLoadFailed]);

  const pill = adminTransportStatusPill(row.status, c);
  const detailOk = detail && detail.ok ? detail : null;
  const report = detailOk?.report ?? null;
  const items = detailOk?.items ?? [];
  const missingCount = detailOk?.missingCount ?? 0;
  const linkedCount = detailOk?.linkedCount ?? 0;
  const resolved = row.status === "approved" || row.status === "rejected";
  const reviewable = row.status === "submitted" || row.status === "reviewing";

  // All receipt urls across items (flat) → shared ImageLightbox carousel; open by url index.
  const allReceiptUrls = items.flatMap((it) => it.imageUrls);
  const openImage = (url: string) => {
    const idx = allReceiptUrls.indexOf(url);
    if (idx >= 0) setLightboxIndex(idx);
  };

  const ITEMS_COLLAPSED = 6;
  const itemsCollapsible = items.length > ITEMS_COLLAPSED;
  const visibleItems =
    itemsExpanded || !itemsCollapsible ? items : items.slice(0, ITEMS_COLLAPSED);

  function doReview() {
    if (!report) return;
    setErr(null);
    startTransition(async () => {
      const res = await setTransportReportReview({ reportId: report.id, action: "reviewing" });
      if (res.ok) {
        onStatusChange(row.userId, "reviewing", c.trActionDoneReview);
      } else if (res.reason === "forbidden") {
        setErr(c.actionForbidden);
      } else {
        setErr(c.actionFailed);
      }
    });
  }
  function submitApprove(comment: string) {
    if (!report) return;
    setErr(null);
    startTransition(async () => {
      const res = await setTransportReportReview({
        reportId: report.id,
        action: "approved",
        note: comment.trim() ? comment.trim() : null,
      });
      if (res.ok) {
        setModal(null);
        onStatusChange(row.userId, "approved", c.trActionDoneApprove);
        onClose();
      } else if (res.reason === "forbidden") {
        setErr(c.actionForbidden);
      } else {
        setErr(c.actionFailed);
      }
    });
  }
  function submitReject(note: string) {
    if (!report) return;
    if (!note.trim()) {
      setErr(c.actionReasonRequired);
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await setTransportReportReview({
        reportId: report.id,
        action: "rejected",
        note: note.trim(),
      });
      if (res.ok) {
        setModal(null);
        onStatusChange(row.userId, "rejected", c.trActionDoneReject);
        onClose();
      } else if (res.reason === "forbidden") {
        setErr(c.actionForbidden);
      } else if (res.reason === "comment_required") {
        setErr(c.actionReasonRequired);
      } else {
        setErr(c.actionFailed);
      }
    });
  }
  function submitRequestFix(note: string) {
    if (!report) return;
    if (!note.trim()) {
      setErr(c.actionReasonRequired);
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await setTransportReportReview({
        reportId: report.id,
        action: "changes_requested",
        note: note.trim(),
      });
      if (res.ok) {
        setModal(null);
        onStatusChange(row.userId, "changes_requested", c.trActionDoneRequestFix);
        onClose();
      } else if (res.reason === "forbidden") {
        setErr(c.actionForbidden);
      } else if (res.reason === "comment_required") {
        setErr(c.actionReasonRequired);
      } else {
        setErr(c.actionFailed);
      }
    });
  }
  function submitReopen(reason: string) {
    if (!report) return;
    setErr(null);
    startTransition(async () => {
      const res = await setTransportReportReview({
        reportId: report.id,
        action: "reopen",
        note: reason.trim() ? reason.trim() : null,
      });
      if (res.ok) {
        setModal(null);
        // Reopen sends the report back to 'submitted' (pending review again).
        onStatusChange(row.userId, "submitted", c.trActionDoneReopen);
        onClose();
      } else if (res.reason === "forbidden") {
        setErr(c.actionForbidden);
      } else {
        setErr(c.actionFailed);
      }
    });
  }

  return (
    <>
      <div className="panel-scrim on" onClick={onClose} />
      <aside
        ref={panelRef}
        className="panel on"
        role="dialog"
        aria-label={c.trPanelKicker(monthLabel)}
        tabIndex={-1}
      >
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{c.trPanelKicker(monthLabel)}</span>
            <button type="button" className="panel__x" onClick={onClose} aria-label={c.panelClose}>
              <Ic>
                <X />
              </Ic>
            </button>
          </div>
          <div className="panel__title">
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="uhead__av" style={{ background: "var(--primary)" }}>
                {initial(row.userName)}
              </span>
              <span>
                <span
                  className="panel__sub"
                  style={{
                    display: "block",
                    color: "var(--ink)",
                    fontSize: 17,
                    fontWeight: 900,
                  }}
                >
                  {row.userName}
                </span>
                <span className="panel__sub">{monthLabel}</span>
              </span>
            </span>
          </div>
          <div className="panel__chips">
            <span className={`pill ${pill.cls}`}>
              <span className="d" />
              {pill.label}
            </span>
            <span className="pill pill--muted">
              {row.itemCount}
              {c.unitCount}
            </span>
            {missingCount > 0 ? (
              <span className="pill pill--warn">
                <span className="d" />
                {c.trEvidenceMissing} {missingCount}
              </span>
            ) : null}
          </div>
        </div>

        <div className="panel__body">
          {loading ? (
            <div className="pblock">
              <div className="state">
                <span className="state__ic empty">
                  <Ic>
                    <Wallet />
                  </Ic>
                </span>
                <div className="state__s">…</div>
              </div>
            </div>
          ) : !detailOk ? (
            <div className="pblock">
              <div className="errbar">
                <span className="errbar__ic">
                  <Ic>
                    <CircleAlert />
                  </Ic>
                </span>
                <div>
                  <div className="errbar__t">{c.trActionNoReport}</div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* total summary */}
              <div className="pblock">
                <div className="psum">
                  <span className="psum__amt">
                    <span className="yen">{c.yenSym}</span>
                    {formatAdminYen(row.totalAmount, localeTag)}
                  </span>
                  <span className="psum__lbl">{c.trPanelSummaryLabel(linkedCount)}</span>
                </div>
              </div>

              {/* items (with inline receipt thumbnails, collapsible) */}
              <div className="pblock">
                <div className="pblock__t">{c.trPanelItemsTitle(items.length)}</div>
                {items.length === 0 ? (
                  <div className="locknote">{c.trItemNoEvidence}</div>
                ) : (
                  <>
                    <div
                      className="ledger"
                      style={{ position: "relative", margin: "0 -6px" }}
                    >
                      {visibleItems.map((it) => (
                        <TransportItemRow
                          key={it.id}
                          item={it}
                          c={c}
                          localeTag={localeTag}
                          onOpenImage={openImage}
                        />
                      ))}
                      {itemsCollapsible && !itemsExpanded ? (
                        <div className="ledger__fade" aria-hidden="true" />
                      ) : null}
                    </div>
                    {itemsCollapsible ? (
                      <button
                        type="button"
                        className="ledger__toggle"
                        onClick={() => setItemsExpanded((v) => !v)}
                        aria-expanded={itemsExpanded}
                      >
                        {itemsExpanded
                          ? c.staffLedgerCollapse
                          : c.staffLedgerExpand(items.length)}
                        <span className={`ledger__toggle-chev${itemsExpanded ? " on" : ""}`}>
                          <Ic>
                            <ChevronDown />
                          </Ic>
                        </span>
                      </button>
                    ) : null}
                  </>
                )}
                {missingCount > 0 ? (
                  <div
                    className="locknote"
                    style={{
                      marginTop: 11,
                      color: "var(--warn)",
                      background: "var(--warn-bg)",
                    }}
                  >
                    <Ic>
                      <AlertTriangle />
                    </Ic>
                    {c.trPanelMissingNote(missingCount)}
                  </div>
                ) : null}
              </div>

              {/* permission zone OR resolved note */}
              {resolved ? (
                <div className="pblock">
                  <div className="locknote">
                    <Ic>
                      {row.status === "approved" ? <Check /> : <Ban />}
                    </Ic>
                    {c.trPanelResolvedNote(
                      pill.label,
                      report ? c.panelPermRole : c.panelPermRole,
                      fmtSubmitted(report?.reviewedAt ?? null, localeTag) ?? "—",
                    )}
                  </div>
                </div>
              ) : (
                <div className="pblock">
                  <div className="permzone">
                    <div className="permzone__h">
                      <span className="permzone__ic">
                        <Ic>
                          <Shield />
                        </Ic>
                      </span>
                      <div>
                        <div className="permzone__t">{c.trPanelPermTitle}</div>
                        <div className="permzone__s">{c.trPanelPermSub}</div>
                      </div>
                      <span className="permzone__role">
                        <Ic>
                          <Shield />
                        </Ic>
                        {c.panelPermRole}
                      </span>
                    </div>
                    {row.status === "submitted" ? (
                      <div className="permbtns">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          style={{ flex: 1 }}
                          onClick={doReview}
                          disabled={pending}
                        >
                          <Ic>
                            <Pencil />
                          </Ic>
                          {pending ? c.trActionReviewing : c.trPanelBtnReview}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}

          {err ? (
            <div className="pblock">
              <div className="errbar">
                <span className="errbar__ic">
                  <Ic>
                    <LogOut />
                  </Ic>
                </span>
                <div>
                  <div className="errbar__t">{err}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel__foot">
          {items.length > 0 ? (
            <a
              className="btn btn--subtle btn--sm"
              href={`/admin/attendance/transport/receipt?ym=${ym}&user=${row.userId}`}
              target="stayops_receipt"
              rel="noopener"
              style={{ flex: 1 }}
            >
              <Ic>
                <Receipt />
              </Ic>
              {c.trReceiptEntry}
            </a>
          ) : (
            <span style={{ flex: 1 }} />
          )}
          {resolved ? (
            <button
              type="button"
              className="btn btn--subtle"
              style={{ flex: 1 }}
              onClick={() => setModal("reopen")}
              disabled={pending || !report}
            >
              <Ic>
                <RotateCcw />
              </Ic>
              {pending ? c.trActionReopening : c.trPanelBtnReopen}
            </button>
          ) : reviewable ? (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ flex: 1 }}
                onClick={() => setModal("requestFix")}
                disabled={pending || !report}
              >
                <Ic>
                  <MessageSquare />
                </Ic>
                {pending ? c.trActionRequestingFix : c.trPanelBtnRequestFix}
              </button>
              <button
                type="button"
                className="btn btn--danger-ghost"
                style={{ flex: 1 }}
                onClick={() => setModal("reject")}
                disabled={pending || !report}
              >
                <Ic>
                  <Ban />
                </Ic>
                {pending ? c.trActionRejecting : c.trPanelBtnReject}
              </button>
              <button
                type="button"
                className="btn btn--ok"
                style={{ flex: 1.3 }}
                onClick={() => setModal("approve")}
                disabled={pending || !report}
              >
                <Ic>
                  <Check />
                </Ic>
                {pending ? c.trActionApproving : c.trPanelBtnApprove}
              </button>
            </>
          ) : (
            <span style={{ flex: 2.3 }} />
          )}
        </div>
      </aside>

      {modal === "approve" ? (
        <AdminReasonModal
          title={c.trPanelBtnApprove}
          description={c.trPromptApproveComment}
          placeholder={c.dialogReasonPlaceholder}
          confirmLabel={pending ? c.trActionApproving : c.trPanelBtnApprove}
          cancelLabel={c.dialogCancel}
          pending={pending}
          errorText={err}
          onConfirm={submitApprove}
          onCancel={() => setModal(null)}
        />
      ) : null}
      {modal === "reject" ? (
        <AdminReasonModal
          title={c.trPanelBtnReject}
          description={c.trPromptReject}
          placeholder={c.dialogReasonPlaceholder}
          confirmLabel={pending ? c.trActionRejecting : c.trPanelBtnReject}
          cancelLabel={c.dialogCancel}
          pending={pending}
          errorText={err}
          danger
          onConfirm={submitReject}
          onCancel={() => setModal(null)}
        />
      ) : null}
      {modal === "requestFix" ? (
        <AdminReasonModal
          title={c.trPanelBtnRequestFix}
          description={c.trPromptRequestFixComment}
          placeholder={c.dialogReasonPlaceholder}
          confirmLabel={pending ? c.trActionRequestingFix : c.trPanelBtnRequestFix}
          cancelLabel={c.dialogCancel}
          pending={pending}
          errorText={err}
          onConfirm={submitRequestFix}
          onCancel={() => setModal(null)}
        />
      ) : null}
      {modal === "reopen" ? (
        <AdminReasonModal
          title={c.trPanelBtnReopen}
          description={c.trPromptReopen}
          placeholder={c.dialogReasonPlaceholder}
          confirmLabel={pending ? c.trActionReopening : c.trPanelBtnReopen}
          cancelLabel={c.dialogCancel}
          pending={pending}
          errorText={err}
          onConfirm={submitReopen}
          onCancel={() => setModal(null)}
        />
      ) : null}

      <ImageLightbox
        urls={allReceiptUrls}
        openIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}

function TransportItemRow({
  item,
  c,
  localeTag,
  onOpenImage,
}: {
  item: AdminTransportItemView;
  c: Att;
  localeTag: string;
  onOpenImage: (url: string) => void;
}) {
  const isLinked = item.entryMode === "linked";
  const missing = item.imageCount === 0;
  const thumbs = item.imageUrls.slice(0, 2);
  const extra = item.imageUrls.length - thumbs.length;
  return (
    <div className="qrow" style={{ cursor: "default" }}>
      <span className={`qrow__ic ${isLinked ? "bg-info" : "bg-surf"}`}>
        <Ic>{isLinked ? <Link2 /> : <Pencil />}</Ic>
      </span>
      <div className="qrow__b">
        <div className="qrow__t">
          <span className="mono">{fmtUsageDate(item.usageDate, localeTag)}</span>
          {item.buildingLabel ? ` · ${item.buildingLabel}` : ""}
        </div>
        <div className="qrow__s">
          {item.contextSummary}
          <span className="sep" />
          {isLinked ? c.trPanelLinkedTag : c.trPanelManualTag}
          {missing ? (
            <>
              <span className="sep" />
              <span style={{ color: "var(--warn)", fontWeight: 800 }}>{c.trPanelMissingTag}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="qrow__meta" style={{ gap: 10 }}>
        {missing ? (
          <span className="trthumb trthumb--missing" title={c.trEvidenceMissing}>
            <Receipt />
          </span>
        ) : (
          <span className="trthumbs">
            {thumbs.map((u, i) => (
              <button
                key={i}
                type="button"
                className="trthumb"
                onClick={() => onOpenImage(u)}
                aria-label={c.trPanelEvidenceCount(item.imageCount)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" loading="lazy" />
              </button>
            ))}
            {extra > 0 ? (
              <button
                type="button"
                className="trthumb trthumb--more"
                onClick={() => onOpenImage(item.imageUrls[thumbs.length])}
              >
                +{extra}
              </button>
            ) : null}
          </span>
        )}
        <span className="amt">
          <span className="yen">{c.yenSym}</span>
          {formatAdminYen(item.amountYen, localeTag)}
        </span>
      </div>
    </div>
  );
}
