"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource, StarPips, PLATFORMS, ratingMax } from "./cx-platform";
import { getDictionary } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
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
  closeLabel,
}: {
  src: string;
  caption: string;
  onClose: () => void;
  hint: string;
  closeLabel: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="cx cx-lightbox" role="dialog" aria-modal="true">
      <div className="cx-lightbox__bar">
        <span className="t">{caption}</span>
        <button type="button" className="cx-lightbox__x" onClick={onClose} aria-label={closeLabel}>
          {CxIcon.x}
        </button>
      </div>
      <div className="cx-lightbox__stage" onClick={onClose}>
        <div className="cx-lightbox__img">
          {/* 라이트박스는 **원본 해상도**로 본다(결정 로그 2026-06-22). `next/image` 로 바꾸면
              뷰포트에 맞춰 축소된 사본이 내려와 «크게 봐서 확인한다» 는 목적이 깨진다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
  const buildingLabels = dict.cleaning.buildingLabels;
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
    <div className="cx cx-detail cx-mdetail">
      <div className="cx-dsrc-row">
        <PlatformSource plat={c.platform} dict={dict} />
        <span className="time mono">
          {new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(c.createdAt))}
        </span>
      </div>

      <h2 className="cx-mdetail__t">{c.title}</h2>

      {/* 상태는 칩 하나로만 — v1 의 점(dot)과 병기하지 않는다. */}
      <div className="cx-mdetail__status">
        <span className={done ? "cx-statuschip is-resolved" : "cx-statuschip is-open"}>
          {done ? t.statusDone : t.statusOpen}
        </span>
      </div>

      {/* 문맥 — S3 리뷰 상세와 같은 kv 카드를 쓴다. 두 상세가 다른 모양이면 같은 사건을 두고
          다른 화면처럼 읽힌다. 값이 없는 행은 숨긴다 — 리뷰와 달리 사용자가 직접 넣는 값이라
          «수집 누락»과 «실제 부재»를 구분할 필요가 없다. */}
      <div className="cx-kvcard">
        {c.propertyName && (
          <div className="cx-kvrow">
            <span className="cx-kvrow__k">{t.metaBuilding}</span>
            <span className="cx-kvrow__v">
              {localizePropertyName(getCanonicalPropertyName(c.propertyName), buildingLabels)}
            </span>
          </div>
        )}
        {c.roomLabel && (
          <div className="cx-kvrow">
            <span className="cx-kvrow__k">{t.metaRoom}</span>
            <span className="cx-kvrow__v">{c.roomLabel}</span>
          </div>
        )}
        {c.guestName && (
          <div className="cx-kvrow">
            <span className="cx-kvrow__k">{t.metaGuest}</span>
            <span className="cx-kvrow__v">{c.guestName}</span>
          </div>
        )}
        {max > 0 && c.rating != null && (
          <div className="cx-kvrow">
            <span className="cx-kvrow__k">{t.metaRating}</span>
            <span className="cx-kvrow__v cx-ratingv">
              <CIc>{CxIcon.star}</CIc>
              <span className="mono">
                {c.rating.toFixed(1)} <i>/ {max}</i>
              </span>
            </span>
          </div>
        )}
      </div>

      {c.description && <p className="cx-mdetail__body">{c.description}</p>}

      {c.imageUrls.length > 0 && (
        <div className="cx-shots">
          {c.imageUrls.map((url, i) => {
            const caption = url.split("/").pop() ?? String(i + 1);
            return (
              <button
                key={url}
                type="button"
                className="cx-shot"
                onClick={() => setLightbox({ src: url, caption })}
              >
                {/* `.cx-shot` 이 relative + aspect-ratio:1 이라 `fill` 이 그대로 맞는다. */}
                <Image src={url} alt={caption} fill sizes="33vw" className="cx-shot__img" />
                <span className="cx-shot__z">{CxIcon.zoom}</span>
              </button>
            );
          })}
        </div>
      )}

      {canChangeStatus && (
        <button
          type="button"
          className={done ? "cx-prim-btn done-state" : "cx-prim-btn"}
          onClick={handleStatusToggle}
          disabled={isPending}
        >
          <CIc>{CxIcon.check}</CIc>
          {done ? t.markedDone : t.markDone}
        </button>
      )}

      <div className="cx-sechead cx-sechead--log">
        <span>{t.logTitle}</span>
        <span className="cx-logcount">{comments.length}</span>
      </div>

      <div className="cx-cmtlist">
        {comments.map((cm) => {
          const initial = cm.authorName.slice(0, 1) || "?";
          const ownerStyle = isOwnerRole(cm.authorRole);
          return (
            <div key={cm.id} className="cx-cmt">
              <span className={ownerStyle ? "cx-cmt__av p" : "cx-cmt__av n"}>{initial}</span>
              <div className="cx-cmt__b">
                <div className="cx-cmt__h">
                  <span className="cx-cmt__n">{cm.authorName}</span>
                  <span className={ownerStyle ? "cx-role-pill" : "cx-role-pill ref"}>
                    {ownerStyle ? t.roleOwner : t.roleRef}
                  </span>
                  <span className="cx-cmt__t mono">{formatCommentTime(cm.createdAt, locale)}</span>
                </div>
                <div className="cx-cmt__body">{cm.content}</div>
                {cm.imageUrls.length > 0 && (
                  <div className="cx-cmt__imgs">
                    {cm.imageUrls.map((url, i) => (
                      // `.cx-cmt__img` 이 64×64 고정이라 치수를 그대로 넘긴다.
                      <Image key={i} src={url} alt="" width={64} height={64} className="cx-cmt__img" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 댓글 권한이 없으면(파트타임) 입력창 자체가 사라진다 — 비활성 입력창은 «고장»으로 읽힌다. */}
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
            aria-label={t.commentPlaceholder}
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
          closeLabel={t.lightboxClose}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
