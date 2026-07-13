"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource, StarPips, PLATFORMS, ratingMax } from "./cx-platform";
import { getDictionary } from "@/lib/i18n";
import type { Complaint, ComplaintComment } from "@/lib/complaints";
import {
  resolveComplaintAction,
  reopenComplaintAction,
  createComplaintCommentAction,
} from "@/app/mobile/complaints/actions";

// 오늘이면 HH:MM, 그 외엔 날짜로 표시 (하드코딩 없이 Intl 사용)
function formatCommentTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  if (isToday) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(d);
  }
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(d);
}

function isOwnerRole(role: string | null): boolean {
  return (
    role === "owner" ||
    role === "senior_managing_director" ||
    role === "developer_super_admin" ||
    role === "office_admin"
  );
}

function Lightbox({
  src,
  caption,
  onClose,
  hint,
}: {
  src: string;
  caption: string;
  onClose: () => void;
  hint: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="cx cx-lightbox" role="dialog" aria-modal="true">
      <div className="cx-lightbox__bar">
        <span className="t">{caption}</span>
        <button type="button" className="cx-lightbox__x" onClick={onClose} aria-label="close">
          {CxIcon.x}
        </button>
      </div>
      <div className="cx-lightbox__stage" onClick={onClose}>
        <div className="cx-lightbox__img">
          <img src={src} alt={caption} />
        </div>
      </div>
      <div className="cx-lightbox__hint">
        <CIc>{CxIcon.zoom}</CIc>
        {hint}
      </div>
    </div>,
    document.body,
  );
}

export function ComplaintDetail({
  complaint,
  comments,
  locale,
  canChangeStatus,
  canComment,
}: {
  complaint: Complaint;
  comments: ComplaintComment[];
  locale: string;
  currentUserId: string;
  canChangeStatus: boolean;
  canComment: boolean;
}) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const c = complaint;
  const [done, setDone] = useState(c.status === "resolved");
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const max = ratingMax(c.platform);

  function handleStatusToggle() {
    startTransition(async () => {
      const action = done ? reopenComplaintAction : resolveComplaintAction;
      const res = await action(c.id);
      if ("ok" in res) {
        setDone((v) => !v);
        router.refresh();
      }
    });
  }

  function handleComment() {
    const text = commentText.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await createComplaintCommentAction(c.id, text, []);
      if ("id" in res) {
        setCommentText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="cx cx-detail">
      <div className="cx-dsrc-row">
        <PlatformSource plat={c.platform} dict={dict} />
        <span className="time mono">
          {new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(
            new Date(c.createdAt),
          )}
        </span>
      </div>

      <h2 className="cx-dtitle">{c.title}</h2>

      <div className="cx-dstatus">
        <span className={`cx-spill ${done ? "resolved" : "open"}`}>
          <span className="d" />
          {done ? t.statusDone : t.statusOpen}
        </span>
      </div>

      {/* Meta block — 값 없는 행 숨김 */}
      <div className="cx-meta">
        {c.propertyName && (
          <div className="cx-meta__row">
            <span className="cx-meta__l">
              <CIc>{CxIcon.building}</CIc>
              {t.metaBuilding}
            </span>
            <span className="cx-meta__v">{c.propertyName}</span>
          </div>
        )}
        {c.roomLabel && (
          <div className="cx-meta__row">
            <span className="cx-meta__l">
              <CIc>{CxIcon.door}</CIc>
              {t.metaRoom}
            </span>
            <span className="cx-meta__v">{c.roomLabel}</span>
          </div>
        )}
        {c.guestName && (
          <div className="cx-meta__row">
            <span className="cx-meta__l">
              <CIc>{CxIcon.person}</CIc>
              {t.metaGuest}
            </span>
            <span className="cx-meta__v">
              {c.guestName} ·{" "}
              {c.platform === "direct" ? t.platformDirect : PLATFORMS[c.platform].name}
            </span>
          </div>
        )}
        {max > 0 && c.rating != null && (
          <div className="cx-meta__row">
            <span className="cx-meta__l">
              <CIc>{CxIcon.star}</CIc>
              {t.metaRating}
            </span>
            <span className="cx-meta__v rate-v">
              <StarPips plat={c.platform} rating={c.rating} />
              <span>{t.ratingOf(c.rating.toFixed(1), max)}</span>
            </span>
          </div>
        )}
      </div>

      {c.description && <div className="cx-dbody">{c.description}</div>}

      {c.imageUrls.length > 0 && (
        <div className="cx-dgrid">
          {c.imageUrls.map((url, i) => {
            const caption = url.split("/").pop() ?? String(i + 1);
            return (
              <button
                key={url}
                type="button"
                className="cx-shot"
                onClick={() => setLightbox({ src: url, caption })}
              >
                <img src={url} alt={caption} className="cx-shot__img" />
                <span className="cx-shot__z">{CxIcon.zoom}</span>
              </button>
            );
          })}
        </div>
      )}

      {canChangeStatus && (
        <button
          type="button"
          className={`cx-prim-btn${done ? " done-state" : ""}`}
          onClick={handleStatusToggle}
          disabled={isPending}
        >
          <CIc>{CxIcon.check}</CIc>
          {done ? t.markedDone : t.markDone}
        </button>
      )}

      <div className="cx-divider" />

      <div className="cx-clabel">
        {t.logTitle} <span className="n">{comments.length}</span>
      </div>

      {comments.map((cm) => {
        const initial = cm.authorName.slice(0, 1) || "?";
        const ownerStyle = isOwnerRole(cm.authorRole);
        return (
          <div key={cm.id} className="cx-cmt">
            <span className={`cx-cmt__av ${ownerStyle ? "p" : "n"}`}>{initial}</span>
            <div className="cx-cmt__b">
              <div className="cx-cmt__h">
                <span className="cx-cmt__n">{cm.authorName}</span>
                <span className={`cx-role-pill${ownerStyle ? "" : " ref"}`}>
                  {ownerStyle ? t.roleOwner : t.roleRef}
                </span>
                <span className="cx-cmt__t">{formatCommentTime(cm.createdAt, locale)}</span>
              </div>
              <div className="cx-cmt__body">{cm.content}</div>
              {cm.imageUrls.length > 0 && (
                <div className="cx-cmt__imgs">
                  {cm.imageUrls.map((url, i) => (
                    <img key={i} src={url} alt="" className="cx-cmt__img" />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {canComment && (
        <div className="cx-composer">
          <input
            className="cx-composer__in"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={t.commentPlaceholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleComment();
              }
            }}
          />
          <button
            type="button"
            className="cx-composer__send"
            onClick={handleComment}
            disabled={isPending || !commentText.trim()}
          >
            {CxIcon.send}
          </button>
        </div>
      )}

      {lightbox && (
        <Lightbox
          src={lightbox.src}
          caption={lightbox.caption}
          hint={t.lightboxHint}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
