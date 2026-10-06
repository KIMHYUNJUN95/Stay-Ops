"use client";

// Admin 게시판 신고 콘솔 (2026-10-06). 공용 콘솔 부품(.ctoolbar · .qtbl · .panel · .modal · .state · .adm-toast)만 쓴다.
// docs/product/23-board-workflow.md §12-C
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Flag, ShieldCheck, Trash2, X } from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import { resolveBoardReport } from "@/app/mobile/board/moderation-actions";
import { boardReasonLabel } from "@/lib/board-report-reasons";
import type { PendingBoardReport } from "@/lib/board-moderation";
import type { Dictionary, Locale } from "@/lib/i18n";

type Copy = Dictionary["board"];

function useDateFmt(locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BoardReportsConsole({
  reports,
  copy,
  locale,
}: {
  reports: PendingBoardReport[];
  copy: Copy;
  locale: Locale;
}) {
  const router = useRouter();
  const fmt = useDateFmt(locale);
  const { toast, showToast, dismiss } = useAdminToast();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, setPending] = useState(false);
  const selected = reports.find((r) => r.key === selectedKey) ?? null;

  async function resolve(action: "remove" | "dismiss") {
    if (!selected || pending) return;
    setPending(true);
    try {
      const result = await resolveBoardReport({
        targetType: selected.targetType,
        postId: selected.postId,
        commentId: selected.commentId,
        action,
      });
      if ("error" in result) {
        showToast(copy.errSaveFailed);
        return;
      }
      showToast(action === "remove" ? copy.reportsRemoved : copy.reportsDismissed);
      setConfirmRemove(false);
      setSelectedKey(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="hmeta">
        <b style={{ color: "var(--ink-soft)" }}>{copy.reportsCount.replace("{count}", String(reports.length))}</b>
        <span className="sep" />
        {copy.reportsAdminSub}
      </div>

      {reports.length === 0 ? (
        <div className="card">
          <div className="state">
            <div className="state__ic empty">
              <Flag aria-hidden="true" />
            </div>
            <div className="state__t">{copy.reportsEmpty}</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "auto" }}>
          <table className="qtbl">
            <thead>
              <tr>
                <th style={{ paddingLeft: 16 }}>{copy.reportsColType}</th>
                <th>{copy.reportsColContent}</th>
                <th>{copy.reportsColAuthor}</th>
                <th>{copy.reportsColReasons}</th>
                <th>{copy.reportsColCount}</th>
                <th>{copy.reportsColLatest}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr className={selectedKey === r.key ? "sel" : ""} key={r.key} onClick={() => setSelectedKey(r.key)}>
                  <td style={{ paddingLeft: 16 }}>
                    <span className="pill pill--info">
                      {r.targetType === "post" ? copy.reportsTargetPost : copy.reportsTargetComment}
                    </span>
                  </td>
                  <td style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.preview}
                  </td>
                  <td>{r.authorName || copy.reportsAuthorUnknown}</td>
                  <td>{r.reasons.map((reason) => boardReasonLabel(copy, reason)).join(" · ")}</td>
                  <td>
                    <span className="pill pill--danger">{r.count}</span>
                  </td>
                  <td className="mono">{fmt.format(new Date(r.latestAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <ReportPanel
          copy={copy}
          fmt={fmt}
          onClose={() => setSelectedKey(null)}
          onDismiss={() => void resolve("dismiss")}
          onRemove={() => setConfirmRemove(true)}
          pending={pending}
          report={selected}
        />
      ) : null}

      {selected && confirmRemove ? (
        <>
          <div className="modal-scrim on" onClick={() => setConfirmRemove(false)} />
          <div className="modal on" role="dialog" aria-modal="true" style={{ width: 440 }}>
            <div className="modal__h">
              <div>
                <div className="modal__kicker">{copy.reportsPanelKicker}</div>
                <div className="modal__t">
                  {selected.targetType === "post" ? copy.reportsRemovePostTitle : copy.reportsRemoveCommentTitle}
                </div>
              </div>
              <button aria-label={copy.reportsClose} className="panel__x" onClick={() => setConfirmRemove(false)} type="button">
                <X />
              </button>
            </div>
            <div className="modal__body">{copy.reportsRemoveBody}</div>
            <div className="modal__foot">
              <span className="modal__foot-note is-danger">
                <ShieldCheck className="ic" aria-hidden="true" />
                {copy.reportsCount.replace("{count}", String(selected.count))}
              </span>
              <div style={{ display: "flex", gap: 9 }}>
                <button className="btn btn--ghost" disabled={pending} onClick={() => setConfirmRemove(false)} type="button">
                  {copy.actionCancel}
                </button>
                <button className="btn btn--danger-ghost" disabled={pending} onClick={() => void resolve("remove")} type="button">
                  <Trash2 className="ic" aria-hidden="true" />
                  {copy.reportsRemove}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {toast ? <AdminToast key={toast.id} message={toast.message} onDismiss={dismiss} /> : null}
    </>
  );
}

function ReportPanel({
  report,
  copy,
  fmt,
  pending,
  onClose,
  onDismiss,
  onRemove,
}: {
  report: PendingBoardReport;
  copy: Copy;
  fmt: Intl.DateTimeFormat;
  pending: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onRemove: () => void;
}) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled: pending });
  return (
    <>
      <div className="panel-scrim on" onClick={onClose} />
      <aside aria-label={copy.reportsPanelKicker} className="panel on" ref={panelRef} role="dialog" tabIndex={-1}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">
              {copy.reportsPanelKicker} · {report.targetType === "post" ? copy.reportsTargetPost : copy.reportsTargetComment}
            </span>
            <button aria-label={copy.reportsClose} className="panel__x" onClick={onClose} type="button">
              <X />
            </button>
          </div>
          <div className="panel__title" style={{ marginTop: 11 }}>
            {report.authorName || copy.reportsAuthorUnknown}
          </div>
          <div className="panel__chips">
            <span className="pill pill--danger">{copy.reportsCount.replace("{count}", String(report.count))}</span>
            {report.reasons.map((reason) => (
              <span className="pill pill--muted" key={reason}>
                {boardReasonLabel(copy, reason)}
              </span>
            ))}
          </div>
        </div>
        <div className="panel__body">
          <div className="pblock">
            <div className="pblock__t">{copy.reportsColContent}</div>
            <div style={{ whiteSpace: "pre-line", lineHeight: 1.6 }}>{report.preview}</div>
          </div>
          {report.notes.length > 0 ? (
            <div className="pblock">
              <div className="pblock__t">{copy.reportsNotesTitle}</div>
              {report.notes.map((note, i) => (
                <div key={i} style={{ marginTop: i ? 8 : 0, fontStyle: "italic", color: "var(--ink-soft)" }}>
                  “{note}”
                </div>
              ))}
            </div>
          ) : null}
          <div className="pblock">
            <div className="kv">
              <span className="kv__k">{copy.reportsColLatest}</span>
              <span className="kv__v mono">{fmt.format(new Date(report.latestAt))}</span>
            </div>
          </div>
          <Link className="btn btn--ghost btn--sm" href={`/mobile/board/${report.postId}`} target="_blank">
            <ExternalLink className="ic" aria-hidden="true" />
            {copy.reportsViewPost}
          </Link>
        </div>
        <div className="panel__foot" style={{ display: "flex", gap: 9 }}>
          <button className="btn btn--ghost" disabled={pending} onClick={onDismiss} style={{ flex: 1 }} type="button">
            {copy.reportsDismiss}
          </button>
          <button className="btn btn--danger-ghost" disabled={pending} onClick={onRemove} style={{ flex: 1 }} type="button">
            <Trash2 className="ic" aria-hidden="true" />
            {copy.reportsRemove}
          </button>
        </div>
      </aside>
    </>
  );
}
