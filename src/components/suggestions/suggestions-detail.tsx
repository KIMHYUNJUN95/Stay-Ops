"use client";

/**
 * Frames 3 & 4 — Staff Suggestions detail (role-aware). One component renders all three viewer roles,
 * preserving each finalized treatment from the Feedback Box.html handoff:
 *  - recipient → bottom status bar + status / hold / completion sheets (functional, Step 6)
 *  - all participants → bottom comment composer (functional, Step 5)
 *  - author → read-only suggestion body; no status controls
 *
 * As-built: data via `SuggestionDetail` (Step 4), comments live (Step 5), status workflow live
 * (Step 6), fully localized via `copy` (Step 8). See docs/product/22-staff-suggestions-workflow.md.
 */

import type { CSSProperties } from "react";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteStaffSuggestion,
  updateStaffSuggestionStatus,
} from "@/app/mobile/suggestions/actions";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { StaffSuggestionStatus } from "@/lib/suggestions";
import type { SuggestionDetail } from "@/lib/suggestions-queries";
import "./suggestions.css";
import { Ic, SgIcon } from "./sg-icons";
import { SuggestionCommentComposer } from "./suggestion-comment-composer";
import { SuggestionCommentItem } from "./suggestion-comment-item";

type SgCopy = Dictionary["mobile"]["suggestions"];

const STAT_CLS: Record<StaffSuggestionStatus, string> = {
  submitted: "sub",
  reviewing: "rev",
  on_hold: "hold",
  completed: "done",
};

function relativeTime(iso: string, locale: Locale): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.34524],
    ["month", 12],
    ["year", Infinity],
  ];
  let value = diffSec;
  for (const [unit, span] of units) {
    if (Math.abs(value) < span) return rtf.format(-Math.round(value), unit);
    value = value / span;
  }
  return rtf.format(-Math.round(value), "year");
}

const STATUS_OPTIONS: {
  cls: string;
  status: StaffSuggestionStatus;
  req?: "hold" | "done";
}[] = [
  { cls: "sub", status: "submitted" },
  { cls: "rev", status: "reviewing" },
  { cls: "hold", status: "on_hold", req: "hold" },
  { cls: "done", status: "completed", req: "done" },
];

export function SuggestionsDetail({
  data,
  locale,
  organizationId,
  viewerUserId,
  copy,
}: {
  data: SuggestionDetail;
  locale: Locale;
  organizationId: string;
  viewerUserId: string;
  copy: SgCopy;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  // Instagram-style: comments live in their own bottom sheet (distinct from the status sheet).
  const [commentOpen, setCommentOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  // Long-press the heart → a "who liked" sheet (UI only; likes are client-side until a backend exists).
  const [likeSheetOpen, setLikeSheetOpen] = useState(false);
  const [heartPop, setHeartPop] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const [holdReason, setHoldReason] = useState(data.holdReason ?? "");
  const [completionNote, setCompletionNote] = useState(data.completionNote ?? "");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isStatusPending, startStatus] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  // Author may edit/delete the main suggestion only while it is still `submitted`.
  const canAuthorEdit = data.viewerRole === "author" && data.status === "submitted";
  function removeSuggestion() {
    startDelete(async () => {
      const fd = new FormData();
      fd.set("suggestionId", data.id);
      await deleteStaffSuggestion(fd);
    });
  }
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Recipient-only status change. Reversible among the four statuses; on_hold/completed carry a note.
  function changeStatus(
    target: StaffSuggestionStatus,
    opts?: { holdReason?: string; completionNote?: string },
  ) {
    if (isStatusPending) return;
    setStatusError(null);
    startStatus(async () => {
      const fd = new FormData();
      fd.set("suggestionId", data.id);
      fd.set("status", target);
      if (opts?.holdReason) fd.set("holdReason", opts.holdReason);
      if (opts?.completionNote) fd.set("completionNote", opts.completionNote);
      const result = await updateStaffSuggestionStatus(fd);
      if (!result.ok) {
        setStatusError(copy.errors.save_failed);
        return;
      }
      setSheetOpen(false);
      setReasonOpen(false);
      setCompleteOpen(false);
      router.refresh();
    });
  }
  const statusDrag = useSheetDragDismiss({ shown: sheetOpen, onDismiss: () => setSheetOpen(false) });
  const reasonDrag = useSheetDragDismiss({ shown: reasonOpen, onDismiss: () => setReasonOpen(false) });
  const completeDrag = useSheetDragDismiss({
    shown: completeOpen,
    onDismiss: () => setCompleteOpen(false),
  });
  const commentDrag = useSheetDragDismiss({
    shown: commentOpen,
    onDismiss: () => setCommentOpen(false),
  });
  const likeDrag = useSheetDragDismiss({
    shown: likeSheetOpen,
    onDismiss: () => setLikeSheetOpen(false),
  });

  const isRecipient = data.viewerRole === "recipient";
  const isReferenced = data.viewerRole === "referenced";
  const time = hydrated ? relativeTime(data.createdAt, locale) : "";
  const initial = (name: string) => (name || "—").slice(0, 1);
  const meTag = (role: SuggestionDetail["viewerRole"]) => (data.viewerRole === role ? ` ${copy.me}` : "");

  // Current viewer's display name (for the "who liked" sheet — likes are client-only for now).
  const viewerName =
    data.viewerRole === "author"
      ? data.author.name
      : data.viewerRole === "recipient"
        ? data.recipient.name
        : data.references.find((r) => r.id === viewerUserId)?.name ?? "";

  function startHeartPress() {
    longPressedRef.current = false;
    pressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      setLikeSheetOpen(true);
    }, 450);
  }
  function endHeartPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }
  function onHeartClick() {
    // A completed long-press already opened the "who liked" sheet — don't also toggle the like.
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    // Becoming liked (currently not liked) → play the pop bounce.
    if (!liked) setHeartPop(true);
    setLiked((v) => !v);
  }
  // Likes are client-only for now, so the only liker is the current viewer when they've liked.
  // (A real likes backend would replace this with the persisted liker list.)
  const likers = liked ? [{ id: viewerUserId, name: viewerName || copy.me }] : [];

  // Comment thread = comments + status-change events, interleaved by time (events render as a log).
  const timeline = [
    ...data.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, comment: c })),
    ...data.events.map((e) => ({ kind: "event" as const, at: e.createdAt, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="sg">
      <div className="scroll" style={{ paddingBottom: "88px" }}>
        <div className="who">
          <Ic>{isReferenced ? SgIcon.eye : SgIcon.lock}</Ic>
          {isReferenced ? (
            <>
              <span>{copy.whoReferenced}</span>
              <span className="sep">·</span>
              <span>{copy.whoReferencedSub}</span>
            </>
          ) : (
            <>
              <span>{copy.whoCanView}</span>
              <span className="sep">·</span>
              <span>
                {copy.whoAuthorLabel} {data.author.name || "—"}
                {meTag("author")} · {copy.whoRecipientLabel} {data.recipient.name || "—"}
                {meTag("recipient")}
                {data.references.length ? ` · ${copy.referenceCount.replace("{n}", String(data.references.length))}` : ""}
              </span>
            </>
          )}
        </div>

        <div className="dhero">
          <div className="dstatus-row">
            <span className="fcard__time" style={{ marginLeft: 0 }}>
              {time}
              {time && data.author.name ? " · " : ""}
              {data.author.name}
            </span>
          </div>
          <h2 className="dtitle">{data.title}</h2>
          <div className="route">
            <div className="route__col">
              <span
                className="route__av"
                style={{ background: "var(--surface)", color: "var(--ink-soft)" }}
              >
                {initial(data.author.name)}
              </span>
              <div>
                <div className="route__l">{copy.routeFrom}</div>
                <div className="route__n">
                  {data.author.name || "—"}
                  {meTag("author")}
                </div>
              </div>
            </div>
            <span className="route__arrow">{SgIcon.arrowR}</span>
            <div className="route__col">
              <span className="route__av" style={{ background: "var(--primary)", color: "#fff" }}>
                {initial(data.recipient.name)}
              </span>
              <div>
                <div className="route__l">{copy.routeTo}</div>
                <div className="route__n">
                  {data.recipient.name || "—"}
                  {meTag("recipient")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {canAuthorEdit ? (
          <div style={{ display: "flex", gap: "14px", alignItems: "center", margin: "0 0 14px", padding: "0 2px" }}>
            <Link
              href={`/mobile/suggestions/${data.id}/edit`}
              style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary)" }}
            >
              {copy.edit}
            </Link>
            {confirmDelete ? (
              <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "var(--faint)" }}>{copy.deletePrompt}</span>
                <button
                  type="button"
                  style={{ fontSize: "12.5px", fontWeight: 700, color: "#c0392b" }}
                  onClick={removeSuggestion}
                  disabled={isDeleting}
                >
                  {copy.delete}
                </button>
                <button
                  type="button"
                  style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--muted)" }}
                  onClick={() => setConfirmDelete(false)}
                >
                  {copy.cancel}
                </button>
              </span>
            ) : (
              <button
                type="button"
                style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--faint)" }}
                onClick={() => setConfirmDelete(true)}
              >
                {copy.delete}
              </button>
            )}
          </div>
        ) : null}

        {data.category || data.propertyName || data.roomLabel ? (
          <div className="dtags">
            {data.category ? <span className="dtag">{data.category}</span> : null}
            {data.propertyName ? (
              <span className="dtag">
                <Ic>{SgIcon.building}</Ic>
                {data.propertyName}
              </span>
            ) : null}
            {data.roomLabel ? (
              <span className="dtag">
                <Ic>{SgIcon.door}</Ic>
                {data.roomLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {data.status === "on_hold" && data.holdReason ? (
          <div className="holdbanner">
            <Ic>{SgIcon.pause}</Ic>
            <div>
              <b>{copy.holdBanner}</b>
              <p>{data.holdReason}</p>
            </div>
          </div>
        ) : null}
        {data.status === "completed" && data.completionNote ? (
          <div
            className="holdbanner"
            style={
              {
                background: "var(--done-bg)",
                borderColor: "color-mix(in oklab, var(--done) 26%, transparent)",
                "--hold": "var(--done)",
              } as CSSProperties
            }
          >
            <Ic>{SgIcon.check}</Ic>
            <div>
              <b style={{ color: "var(--done)" }}>{copy.completionBanner}</b>
              <p>{data.completionNote}</p>
            </div>
          </div>
        ) : null}

        <div className="dbody">{data.body}</div>
        {data.imageUrls.length ? (
          <div className="dphotos">
            {data.imageUrls.map((url, i) => (
              <div
                className="dphoto"
                key={i}
                style={{
                  backgroundImage: `url(${url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            ))}
          </div>
        ) : null}

        {/* Instagram-style action row — like (visual) + comment (opens the comment sheet). */}
        <div className="actions">
          <button
            type="button"
            className={`actbtn${liked ? " liked" : ""}`}
            onClick={onHeartClick}
            onPointerDown={startHeartPress}
            onPointerUp={endHeartPress}
            onPointerLeave={endHeartPress}
            onPointerCancel={endHeartPress}
            aria-label={copy.likeAction}
            aria-pressed={liked}
          >
            <span
              className={`ic${heartPop ? " pop" : ""}`}
              onAnimationEnd={() => setHeartPop(false)}
            >
              {SgIcon.heart}
            </span>
          </button>
          <button
            type="button"
            className="actbtn"
            onClick={() => setCommentOpen(true)}
            aria-label={copy.thread}
          >
            <Ic>{SgIcon.comment}</Ic>
            <span className="cnt">{data.comments.length}</span>
          </button>
        </div>
        {likers.length > 0 ? (
          <button type="button" className="likesum" onClick={() => setLikeSheetOpen(true)}>
            <span className="likesum__faces">
              {likers.slice(0, 3).map((u) => (
                <span key={u.id} className="likesum__av">
                  {(u.name || "—").slice(0, 1)}
                </span>
              ))}
            </span>
            <span className="likesum__txt">
              {likers.length === 1
                ? copy.likeSummaryOne.replace("{name}", likers[0].name)
                : copy.likeSummaryMany
                    .replace("{name}", likers[0].name)
                    .replace("{n}", String(likers.length - 1))}
            </span>
          </button>
        ) : null}
        <div style={{ height: "8px" }} />
      </div>

      {/* Bottom chrome — recipient status bar (above) + comment composer (below). */}
      {hydrated && isRecipient
        ? createPortal(
            <div className="sg">
              {/* STATUS sheet (≠ comment sheet): opened by the bottom status pill; carries the
                  status / hold-reason / completion sheets. */}
              <div
                className={`dim${sheetOpen ? " show" : ""}`}
                onClick={() => setSheetOpen(false)}
                style={statusDrag.scrimStyle}
                aria-hidden="true"
              />
              <div
                className={`sheet${sheetOpen ? " show" : ""}`}
                data-sheet
                style={{ ...statusDrag.sheetStyle, opacity: statusDrag.scrimStyle.opacity }}
                role="dialog"
                aria-modal="true"
              >
                <div {...statusDrag.handleProps}>
                  <div className="sheet__grab">
                    <div className="sheet__handle" />
                  </div>
                  <p className="sheet__title">{copy.statusSheetTitle}</p>
                  <p className="sheet__sub">{copy.statusSheetSub}</p>
                </div>
                {statusError ? (
                  <p role="alert" style={{ padding: "0 2px 6px", color: "#c0392b", fontSize: "12px", fontWeight: 700 }}>
                    {statusError}
                  </p>
                ) : null}
                <div className="statopts">
                  {STATUS_OPTIONS.map((o) => {
                    const on = o.status === data.status;
                    return (
                      <button
                        key={o.cls}
                        type="button"
                        disabled={isStatusPending}
                        className={`statopt${on ? " on" : ""}`}
                        onClick={() => {
                          if (o.req === "hold") {
                            setHoldReason(data.holdReason ?? "");
                            setSheetOpen(false);
                            setReasonOpen(true);
                            return;
                          }
                          if (o.req === "done") {
                            setCompletionNote(data.completionNote ?? "");
                            setSheetOpen(false);
                            setCompleteOpen(true);
                            return;
                          }
                          changeStatus(o.status);
                        }}
                      >
                        <span className="statopt__d" style={{ background: `var(--${o.cls})` }} />
                        <div className="statopt__b">
                          <div className="statopt__n">{copy.status[o.status]}</div>
                          <div className="statopt__s">
                            {o.status === "submitted"
                              ? copy.optSubDesc
                              : o.status === "reviewing"
                                ? copy.optRevDesc
                                : o.status === "on_hold"
                                  ? copy.optHoldDesc
                                  : copy.optDoneDesc}
                          </div>
                        </div>
                        {o.req ? (
                          <span className={`req-note${o.req === "done" ? " done" : ""}`}>
                            {o.req === "done" ? copy.reqDone : copy.reqHold}
                          </span>
                        ) : (
                          <span className="statopt__chk">{on ? SgIcon.check : null}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div style={{ height: "6px" }} />
              </div>

              <div
                className={`dim${reasonOpen ? " show" : ""}`}
                onClick={() => setReasonOpen(false)}
                style={reasonDrag.scrimStyle}
                aria-hidden="true"
              />
              <div
                className={`sheet${reasonOpen ? " show" : ""}`}
                data-sheet
                style={{ ...reasonDrag.sheetStyle, opacity: reasonDrag.scrimStyle.opacity }}
                role="dialog"
                aria-modal="true"
              >
                <div {...reasonDrag.handleProps}>
                  <div className="sheet__grab">
                    <div className="sheet__handle" />
                  </div>
                  <div className="rsheet-h">
                    <span className="rsheet-ic hold">{SgIcon.pause}</span>
                    <div>
                      <b>{copy.holdSheetTitle}</b>
                      <p>{copy.holdSheetSub}</p>
                    </div>
                  </div>
                </div>
                <div className="rsheet-from">
                  <span className="pill from">{copy.status[data.status]}</span>
                  <span className="ar">
                    <Ic>{SgIcon.arrowR}</Ic>
                  </span>
                  <span className="pill to-hold">{copy.status.on_hold}</span>
                </div>
                <div className="field">
                  <div className="field__l">
                    {copy.holdField} <span className="req">*</span>
                  </div>
                  <textarea
                    className="inp"
                    rows={3}
                    placeholder={copy.holdPlaceholder}
                    value={holdReason}
                    onChange={(e) => setHoldReason(e.target.value)}
                  />
                </div>
                {statusError ? (
                  <p role="alert" style={{ padding: "0 2px 6px", color: "#c0392b", fontSize: "12px", fontWeight: 700 }}>
                    {statusError}
                  </p>
                ) : null}
                <div className="sheet__btns">
                  <button
                    type="button"
                    className="dbar__status"
                    style={{ flex: "0 0 96px", height: "50px", borderRadius: "14px" }}
                    onClick={() => setReasonOpen(false)}
                  >
                    {copy.cancel}
                  </button>
                  <button
                    type="button"
                    className="ctxbar__save"
                    style={{
                      flex: 1,
                      height: "50px",
                      borderRadius: "14px",
                      fontSize: "14.5px",
                      opacity: holdReason.trim() && !isStatusPending ? 1 : 0.5,
                    }}
                    disabled={!holdReason.trim() || isStatusPending}
                    onClick={() => changeStatus("on_hold", { holdReason: holdReason.trim() })}
                  >
                    {copy.holdConfirm}
                  </button>
                </div>
                <div style={{ height: "4px" }} />
              </div>

              <div
                className={`dim${completeOpen ? " show" : ""}`}
                onClick={() => setCompleteOpen(false)}
                style={completeDrag.scrimStyle}
                aria-hidden="true"
              />
              <div
                className={`sheet${completeOpen ? " show" : ""}`}
                data-sheet
                style={{ ...completeDrag.sheetStyle, opacity: completeDrag.scrimStyle.opacity }}
                role="dialog"
                aria-modal="true"
              >
                <div {...completeDrag.handleProps}>
                  <div className="sheet__grab">
                    <div className="sheet__handle" />
                  </div>
                  <div className="rsheet-h">
                    <span className="rsheet-ic done">{SgIcon.check}</span>
                    <div>
                      <b>{copy.doneSheetTitle}</b>
                      <p>{copy.doneSheetSub}</p>
                    </div>
                  </div>
                </div>
                <div className="rsheet-from">
                  <span className="pill from">{copy.status[data.status]}</span>
                  <span className="ar">
                    <Ic>{SgIcon.arrowR}</Ic>
                  </span>
                  <span className="pill to-done">{copy.status.completed}</span>
                </div>
                <div className="field">
                  <div className="field__l">
                    {copy.doneField} <span className="req">*</span>
                  </div>
                  <textarea
                    className="inp"
                    rows={3}
                    placeholder={copy.donePlaceholder}
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                  />
                </div>
                {statusError ? (
                  <p role="alert" style={{ padding: "0 2px 6px", color: "#c0392b", fontSize: "12px", fontWeight: 700 }}>
                    {statusError}
                  </p>
                ) : null}
                <div className="sheet__btns">
                  <button
                    type="button"
                    className="dbar__status"
                    style={{ flex: "0 0 96px", height: "50px", borderRadius: "14px" }}
                    onClick={() => setCompleteOpen(false)}
                  >
                    {copy.cancel}
                  </button>
                  <button
                    type="button"
                    className="ctxbar__save"
                    style={{
                      flex: 1,
                      height: "50px",
                      borderRadius: "14px",
                      fontSize: "14.5px",
                      background: "var(--done)",
                      opacity: completionNote.trim() && !isStatusPending ? 1 : 0.5,
                    }}
                    disabled={!completionNote.trim() || isStatusPending}
                    onClick={() => changeStatus("completed", { completionNote: completionNote.trim() })}
                  >
                    {copy.doneConfirm}
                  </button>
                </div>
                <div style={{ height: "4px" }} />
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Bottom chrome (all roles): the status control (recipient) or a permission note, plus the
          COMMENT sheet — a separate bottom sheet from the status sheet above. */}
      {hydrated
        ? createPortal(
            <div className="sg">
              {isRecipient ? (
                <div className="statusbar-bottom">
                  <button
                    type="button"
                    className="sbtn"
                    onClick={() => setSheetOpen(true)}
                    aria-haspopup="dialog"
                  >
                    <span className="sbtn__l">{copy.statusPill}</span>
                    <span
                      className="sbtn__cur"
                      style={{ color: `var(--${STAT_CLS[data.status]})` }}
                    >
                      <span className="d" style={{ background: `var(--${STAT_CLS[data.status]})` }} />
                      {copy.status[data.status]}
                    </span>
                    <span className="sbtn__chev">{SgIcon.chevU}</span>
                  </button>
                </div>
              ) : (
                <div className="permnote-bottom">
                  <Ic>{SgIcon.lock}</Ic>
                  {copy.statusBarNote}
                </div>
              )}

              {/* COMMENT sheet (≠ status sheet): tall, header + close, thread + docked composer. */}
              <div
                className={`dim${commentOpen ? " show" : ""}`}
                onClick={() => setCommentOpen(false)}
                style={commentDrag.scrimStyle}
                aria-hidden="true"
              />
              <div
                className={`csheet${commentOpen ? " show" : ""}`}
                data-sheet
                style={{ ...commentDrag.sheetStyle, opacity: commentDrag.scrimStyle.opacity }}
                role="dialog"
                aria-modal="true"
              >
                <div className="csheet__grab" {...commentDrag.handleProps}>
                  <div className="csheet__handle" />
                  <div className="csheet__head">
                    <span className="csheet__title">
                      {copy.thread} {data.comments.length}
                    </span>
                  </div>
                </div>
                <div className="csheet__scroll">
                  {timeline.length === 0 ? (
                    <p className="csheet__empty">{copy.noComments}</p>
                  ) : (
                    timeline.map((item) =>
                      item.kind === "comment" ? (
                        <SuggestionCommentItem
                          comment={item.comment}
                          copy={copy}
                          hydrated={hydrated}
                          isOwn={item.comment.authorId === viewerUserId}
                          key={`c-${item.comment.id}`}
                          locale={locale}
                        />
                      ) : (
                        <div className="clog" key={`e-${item.event.id}`}>
                          <span className="line" />
                          <span className="badge">
                            <span
                              className="d"
                              style={{ background: `var(--${STAT_CLS[item.event.status]})` }}
                            />
                            {copy.statusLog
                              .replace("{name}", item.event.actorName || "—")
                              .replace("{status}", copy.status[item.event.status])}
                          </span>
                          <span className="line" />
                        </div>
                      ),
                    )
                  )}
                </div>
                <SuggestionCommentComposer
                  copy={copy}
                  organizationId={organizationId}
                  suggestionId={data.id}
                />
              </div>

              {/* "좋아요" (who liked) sheet — long-press the heart to open. UI only for now: likes are
                  client-side, so the list shows the current viewer when they've liked. */}
              <div
                className={`dim${likeSheetOpen ? " show" : ""}`}
                onClick={() => setLikeSheetOpen(false)}
                style={likeDrag.scrimStyle}
                aria-hidden="true"
              />
              <div
                className={`lsheet${likeSheetOpen ? " show" : ""}`}
                data-sheet
                style={{ ...likeDrag.sheetStyle, opacity: likeDrag.scrimStyle.opacity }}
                role="dialog"
                aria-modal="true"
              >
                <div className="lsheet__grab" {...likeDrag.handleProps}>
                  <div className="sheet__handle" />
                  <p className="lsheet__title">
                    {copy.likeAction} {liked ? 1 : 0}
                  </p>
                </div>
                <div className="lsheet__list">
                  {liked ? (
                    <div className="lrow">
                      <span className="lrow__av">{(viewerName || "—").slice(0, 1)}</span>
                      <span className="lrow__n">{viewerName || copy.me}</span>
                      <span className="lrow__heart">{SgIcon.heart}</span>
                    </div>
                  ) : (
                    <p className="lsheet__empty">{copy.likeEmpty}</p>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
