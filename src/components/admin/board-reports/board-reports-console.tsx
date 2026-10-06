"use client";

// Admin 게시판 신고 콘솔 (2026-10-06). 공용 콘솔 부품(.qtbl · .panel · .modal · .state · .pill · .kv · .adm-toast) 위에
// 이 화면 고유 셀 · 본문 상자만 board-reports-console.css 로 얹는다. docs/product/23-board-workflow.md §12-C
import "./board-reports-console.css";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, Flag, ShieldCheck, Trash2, X } from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import { resolveBoardReport } from "@/app/mobile/board/moderation-actions";
import { boardReasonLabel } from "@/lib/board-report-reasons";
import type { PendingBoardReport } from "@/lib/board-moderation";
import type { Dictionary, Locale } from "@/lib/i18n";

type Copy = Dictionary["board"];

// 도쿄 기준 「10월 6일 11:53」 — 오전/오후 없이 24시간제, 고정폭 글꼴은 쓰지 않는다.
function makeDateFmt(locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function targetLabel(copy: Copy, r: PendingBoardReport) {
  return r.targetType === "post" ? copy.reportsTargetPost : copy.reportsTargetComment;
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
  const fmt = makeDateFmt(locale);
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
                <th style={{ paddingLeft: 18 }}>{copy.reportsColContent}</th>
                <th>{copy.reportsColReasons}</th>
                <th style={{ width: 90 }}>{copy.reportsColCount}</th>
                <th style={{ width: 150 }}>{copy.reportsColLatest}</th>
                <th className="colchev" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr className={selectedKey === r.key ? "sel" : ""} key={r.key} onClick={() => setSelectedKey(r.key)}>
                  <td style={{ paddingLeft: 18 }}>
                    <div className="brp-target">
                      <span className="brp-kind">{targetLabel(copy, r)}</span>
                      <div className="brp-target__b">
                        <div className="brp-target__t">{r.preview}</div>
                        <div className="brp-target__s">{r.authorName || copy.reportsAuthorUnknown}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="brp-reasons">
                      {r.reasons.map((reason) => (
                        <span className="pill pill--muted" key={reason}>
                          {boardReasonLabel(copy, reason)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="brp-count">{copy.reportsCount.replace("{count}", String(r.count))}</span>
                  </td>
                  <td className="brp-when">{fmt.format(new Date(r.latestAt))}</td>
                  <td className="colchev">
                    <span className="ic">
                      <ChevronRight aria-hidden="true" />
                    </span>
                  </td>
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
            <div className="modal__body">
              <div className="brp-content">{selected.preview}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>{copy.reportsRemoveBody}</div>
            </div>
            <div className="modal__foot">
              <span className="modal__foot-note is-danger">
                <span className="ic">
                  <ShieldCheck aria-hidden="true" />
                </span>
                {copy.reportsCount.replace("{count}", String(selected.count))}
              </span>
              <div style={{ display: "flex", gap: 9 }}>
                <button className="btn btn--ghost" disabled={pending} onClick={() => setConfirmRemove(false)} type="button">
                  {copy.actionCancel}
                </button>
                <button className="btn btn--danger-ghost" disabled={pending} onClick={() => void resolve("remove")} type="button">
                  <span className="ic">
                    <Trash2 aria-hidden="true" />
                  </span>
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
            <span className="panel__kicker">{copy.reportsPanelKicker}</span>
            <button aria-label={copy.reportsClose} className="panel__x" onClick={onClose} type="button">
              <X />
            </button>
          </div>
          <div className="brp-panel__title">
            {(report.targetType === "post" ? copy.reportsPanelTitlePost : copy.reportsPanelTitleComment).replace(
              "{name}",
              report.authorName || copy.reportsAuthorUnknown,
            )}
          </div>
          <div className="panel__chips">
            <span className="pill pill--info">{targetLabel(copy, report)}</span>
            <span className="pill pill--danger">{copy.reportsCount.replace("{count}", String(report.count))}</span>
          </div>
        </div>
        <div className="panel__body">
          <div className="pblock">
            <div className="pblock__t">{copy.reportsColContent}</div>
            <div className="brp-content">{report.preview}</div>
          </div>
          <div className="pblock">
            <div className="pblock__t">{copy.reportsColReasons}</div>
            <div className="brp-reasons">
              {report.reasons.map((reason) => (
                <span className="pill pill--muted" key={reason}>
                  {boardReasonLabel(copy, reason)}
                </span>
              ))}
            </div>
          </div>
          {report.notes.length > 0 ? (
            <div className="pblock">
              <div className="pblock__t">{copy.reportsNotesTitle}</div>
              {report.notes.map((note, i) => (
                <div className="brp-note" key={i}>
                  {note}
                </div>
              ))}
            </div>
          ) : null}
          <div className="pblock">
            <div className="kv">
              <span className="kv__k">{copy.reportsColCount}</span>
              <span className="kv__v">{report.count}</span>
            </div>
            <div className="kv">
              <span className="kv__k">{copy.reportsColLatest}</span>
              <span className="kv__v">{fmt.format(new Date(report.latestAt))}</span>
            </div>
          </div>
          <Link className="brp-open" href={`/mobile/board/${report.postId}`} target="_blank">
            <span className="ic">
              <ExternalLink aria-hidden="true" />
            </span>
            {copy.reportsViewPost}
          </Link>
        </div>
        <div className="panel__foot">
          <button className="btn btn--ghost" disabled={pending} onClick={onDismiss} type="button">
            {copy.reportsDismiss}
          </button>
          <button className="btn btn--danger-ghost" disabled={pending} onClick={onRemove} type="button">
            <span className="ic">
              <Trash2 aria-hidden="true" />
            </span>
            {copy.reportsRemove}
          </button>
        </div>
      </aside>
    </>
  );
}
