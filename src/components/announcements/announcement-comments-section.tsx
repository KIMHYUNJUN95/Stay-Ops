"use client";

import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import {
  createAnnouncementComment,
  deleteAnnouncementComment,
  updateAnnouncementComment,
} from "@/app/announcements/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AnnouncementCommentItem } from "@/lib/announcements";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AnnouncementCommentsSectionProps = {
  allowComments: boolean;
  announcementId: string;
  appearance?: "default" | "announcement";
  comments: AnnouncementCommentItem[];
  errorMessage?: string | null;
  locale: Locale;
  returnTo: string;
  successMessage?: string | null;
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

const ANNOUNCEMENT_CARD =
  "rounded-[24px] border border-slate-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#fbfcff_100%)] shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)] backdrop-blur-none dark:border-white/12 dark:bg-white/8";

export function AnnouncementCommentsSection({
  allowComments,
  announcementId,
  appearance = "default",
  comments,
  errorMessage = null,
  locale,
  returnTo,
  successMessage = null,
}: AnnouncementCommentsSectionProps) {
  const copy = getAnnouncementDictionary(locale);
  const isAnnouncement = appearance === "announcement";

  return (
    <Card
      className={cn(
        "mt-6 rounded-lg border border-border/80 bg-card p-5 shadow-sm",
        isAnnouncement &&
          `mt-4 p-5 text-slate-950 dark:text-slate-50 ${ANNOUNCEMENT_CARD}`,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-black leading-tight">{copy.comments}</h2>
          <p
            className={cn(
              "mt-1 text-sm font-semibold leading-6 text-muted-foreground",
              isAnnouncement && "text-slate-500 dark:text-slate-400",
            )}
          >
            {allowComments ? copy.commentPlaceholder : copy.commentBlocked}
          </p>
        </div>
      </div>

      {successMessage && (
        <div
          className={cn(
            "mt-5 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm font-semibold text-primary",
            isAnnouncement &&
              "rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-[#1f5f59] dark:bg-[#0d3834] dark:text-[#6ee7df]",
          )}
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          className={cn(
            "mt-5 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm font-semibold text-foreground",
            isAnnouncement &&
              "rounded-2xl border-slate-200 bg-white/82 text-slate-900 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] dark:border-white/10 dark:bg-white/5 dark:text-slate-100",
          )}
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {comments.length === 0 ? (
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border border-dashed border-border bg-background/40 px-4 py-5 text-sm font-semibold text-muted-foreground",
              isAnnouncement &&
                "rounded-2xl border-slate-200/80 bg-white/82 py-4 text-slate-500 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
            )}
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
                isAnnouncement && "rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/80 dark:bg-[#123f3b] dark:text-[#6ee7df]",
              )}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
            </div>
            <span>{copy.commentsEmpty}</span>
          </div>
        ) : (
          comments.map((comment) => (
            <AnnouncementCommentCard
              appearance={appearance}
              comment={comment}
              copy={copy}
              key={comment.id}
              locale={locale}
              returnTo={returnTo}
            />
          ))
        )}
      </div>

      <form action={createAnnouncementComment} className="mt-4 space-y-3">
        <input name="announcementId" type="hidden" value={announcementId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2",
            isAnnouncement &&
              "rounded-2xl border-slate-200/80 bg-white/82 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] dark:border-white/10 dark:bg-white/6",
          )}
        >
          <textarea
            className={cn(
              "max-h-40 min-h-8 flex-1 resize-y border-0 bg-transparent px-1 py-1 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60",
              isAnnouncement &&
                "font-semibold text-slate-950 placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500",
            )}
            disabled={!allowComments}
            name="content"
            placeholder={copy.commentPlaceholder}
            required
          />
          <Button
            className={cn(
              "h-10 w-10 rounded-full p-0",
              isAnnouncement && "bg-[#315F91] text-white shadow-[0_14px_26px_-18px_rgba(49,95,145,0.65)] hover:bg-[#274D76]",
            )}
            disabled={!allowComments}
            type="submit"
          >
            <Send className="size-4" aria-hidden="true" />
            <span className="sr-only">{copy.commentSubmit}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}

type AnnouncementCommentCardProps = {
  appearance: "default" | "announcement";
  comment: AnnouncementCommentItem;
  copy: ReturnType<typeof getAnnouncementDictionary>;
  locale: Locale;
  returnTo: string;
};

function AnnouncementCommentCard({
  appearance,
  comment,
  copy,
  locale,
  returnTo,
}: AnnouncementCommentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const isAnnouncement = appearance === "announcement";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-background/80 p-4 shadow-sm",
        isAnnouncement &&
          "rounded-2xl border-slate-200/80 bg-white/82 text-slate-950 shadow-[0_12px_24px_-22px_rgba(31,58,95,0.45)] dark:border-white/10 dark:bg-white/5 dark:text-slate-50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-sm font-black text-foreground",
              isAnnouncement && "text-slate-950 dark:text-slate-50",
            )}
          >
            {comment.authorName}
          </p>
          <p
            className={cn(
              "mt-1 text-xs font-semibold text-muted-foreground",
              isAnnouncement && "text-slate-500 dark:text-slate-400",
            )}
          >
            {formatDate(comment.createdAt, locale)}
            {comment.updatedAt !== comment.createdAt ? ` · ${copy.edited}` : ""}
          </p>
        </div>
        {comment.isAuthor && (
          <div className="flex items-center gap-2">
            <Button
              className={cn(
                "h-9 px-3 text-xs",
                isAnnouncement &&
                  "rounded-xl border-slate-200 bg-white text-slate-700 shadow-[0_8px_18px_-16px_rgba(31,58,95,0.35)] hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15",
              )}
              onClick={() => setIsEditing((current) => !current)}
              type="button"
              variant="secondary"
            >
              {isEditing ? copy.cancel : copy.edit}
            </Button>
            <form
              action={deleteAnnouncementComment}
              onSubmit={(event) => {
                if (!window.confirm(copy.confirmCommentDeleteTitle)) {
                  event.preventDefault();
                }
              }}
            >
              <input name="commentId" type="hidden" value={comment.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <Button
                className={cn(
                  "h-9 px-3 text-xs",
                  isAnnouncement &&
                    "rounded-xl border-slate-200 bg-white text-slate-700 shadow-[0_8px_18px_-16px_rgba(31,58,95,0.35)] hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15",
                )}
                type="submit"
                variant="secondary"
              >
                {copy.delete}
              </Button>
            </form>
          </div>
        )}
      </div>

      {isEditing ? (
        <form action={updateAnnouncementComment} className="mt-4 space-y-3">
          <input name="commentId" type="hidden" value={comment.id} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <textarea
            className={cn(
              "min-h-24 w-full resize-y rounded-lg border border-border bg-surface/80 px-3 py-3 text-sm font-semibold text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15",
              isAnnouncement &&
                "rounded-2xl border-slate-200/80 bg-white/82 text-slate-950 placeholder:text-slate-400 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] focus:border-sky-300 focus:ring-sky-200/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-50 dark:placeholder:text-slate-500",
            )}
            defaultValue={comment.content}
            name="content"
            required
          />
          <div className="flex justify-end">
            <Button
              className={cn(
                "h-9 px-3 text-xs",
                isAnnouncement && "rounded-xl bg-[#315F91] text-white shadow-[0_14px_26px_-18px_rgba(49,95,145,0.65)] hover:bg-[#274D76]",
              )}
              type="submit"
            >
              {copy.save}
            </Button>
          </div>
        </form>
      ) : (
        <p
          className={cn(
            "mt-3 whitespace-pre-line break-words text-sm font-semibold leading-6 text-muted-foreground",
            isAnnouncement && "text-slate-600 dark:text-slate-300",
          )}
        >
          {comment.content}
        </p>
      )}
    </div>
  );
}
