"use client";
import { useEffect, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { BoardAvatar } from "@/components/board/board-avatar";
import { BoardReactionBar } from "@/components/board/board-reaction-bar";
import { BoardComment } from "@/components/board/board-comment";
import { BoardComposer } from "@/components/board/board-composer";
import { BoardActionSheet } from "@/components/board/board-action-sheet";
import { BoardFileCard } from "@/components/board/board-file-card";
import { BoardImageGrid } from "@/components/board/board-image-grid";
import { BoardMentionSheet } from "@/components/board/board-mention-sheet";
import type { ComposerSubmitPayload } from "@/components/board/board-composer";
import type { MentionableMember } from "@/app/mobile/board/[id]/actions";
import { ALL_TOKEN } from "@/lib/board-mention-utils";
import type { BoardPostDetail } from "@/components/board/board-types";
import type { Dictionary, Locale } from "@/lib/i18n";
import {
  toggleBoardReaction,
  deleteBoardComment,
  pinBoardPost,
  unpinBoardPost,
  deleteBoardPost,
  addBoardComment,
  searchMentions,
} from "./actions";

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

export function BoardDetailClient({
  post,
  viewerId,
  viewerInitial,
  canManage,
  organizationId,
  locale,
  copy,
}: {
  post: BoardPostDetail;
  viewerId: string;
  viewerInitial: string;
  canManage: boolean;
  organizationId: string;
  locale: Locale;
  copy: Dictionary["board"];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // 멘션 상태 (composer → 시트 → 여기서 통합 관리)
  const [showMentionSheet, setShowMentionSheet] = useState(false);
  const [mentionedUsers, setMentionedUsers] = useState<MentionableMember[]>([]);
  const [mentionAll, setMentionAll] = useState(false);

  // useOptimistic re-bases on `post.reactions` after each router.refresh(), so the optimistic toggle
  // is reconciled with the server instead of going permanently stale (the old useState mirror bug).
  const [reactions, applyOptimisticToggle] = useOptimistic(
    post.reactions,
    (state, emoji: string) =>
      state.map((r) =>
        r.emoji === emoji
          ? { ...r, isMine: !r.isMine, count: r.isMine ? r.count - 1 : r.count + 1 }
          : r,
      ),
  );

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const isOwn = viewerId === post.authorId;
  const reactionTotal = post.reactionTotal;
  const commentCount = post.comments.length;

  function flashToast(message: string) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  function onToggleReaction(emoji: string) {
    startTransition(async () => {
      applyOptimisticToggle(emoji);
      await toggleBoardReaction(post.id, emoji);
      router.refresh();
    });
  }

  function onDeleteComment(commentId: string) {
    startTransition(async () => {
      await deleteBoardComment(commentId);
      router.refresh();
    });
  }

  function onMentionConfirm(selection: { users: MentionableMember[]; mentionAll: boolean }) {
    setMentionedUsers(selection.users);
    setMentionAll(selection.mentionAll);
    setShowMentionSheet(false);
  }

  function onComposerSubmit(payload: ComposerSubmitPayload) {
    startTransition(async () => {
      // 본문에 멘션 토큰 삽입: @이름 형식으로 content 앞에 붙여 DB에 저장.
      // 렌더 시 mentionedUsers와 매칭해 강조 표시함.
      let content = payload.content;

      // @ALL은 고정 토큰(@ALL)으로 본문에 삽입 — 렌더에서 locale별 변환
      if (payload.mentionAll) {
        content = `${ALL_TOKEN} ${content}`;
      } else if (payload.mentionedUsers.length > 0) {
        const names = payload.mentionedUsers.map((u) => `@${u.name}`).join(" ");
        content = `${names} ${content}`;
      }

      const mentionedUserIds = payload.mentionedUsers.map((u) => u.id);

      const result = await addBoardComment(post.id, content, payload.imageUrls, {
        mentionedUserIds,
        mentionAll: payload.mentionAll,
      });

      if ("error" in result) {
        // TODO: composer 에러 표시 경로 — 현재는 console에 기록하고 refresh는 생략
        console.error("[BoardDetailClient] addBoardComment error:", result.error);
        return;
      }

      // 멘션 상태 초기화
      setMentionedUsers([]);
      setMentionAll(false);
      router.refresh();
    });
  }

  function onPinToggle() {
    setShowActionSheet(false);
    startTransition(async () => {
      if (post.isPinned) await unpinBoardPost(post.id);
      else await pinBoardPost(post.id);
      router.refresh();
    });
  }

  async function onShare() {
    setShowActionSheet(false);
    const url = `${window.location.origin}/mobile/board/${post.id}`;
    const title = post.title ?? post.content.slice(0, 40);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      flashToast(copy.shareCopied);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        flashToast(copy.shareCopied);
      } catch {
        flashToast(copy.shareFailed);
      }
    }
  }

  function onConfirmDelete() {
    setShowDeleteConfirm(false);
    startTransition(async () => {
      const result = await deleteBoardPost(post.id);
      if ("error" in result) {
        flashToast(copy.errSaveFailed);
        return;
      }
      router.replace("/mobile/board");
    });
  }

  const reactionSummary =
    reactionTotal <= 0 || !post.firstReactorName
      ? null
      : reactionTotal === 1
        ? copy.reactionSummaryOne.replace("{name}", post.firstReactorName)
        : copy.reactionSummaryMany
            .replace("{name}", post.firstReactorName)
            .replace("{count}", String(reactionTotal - 1));

  // This page is its own scroll container (not the body), so a sheet's body-lock can't freeze it.
  // Freeze the inner scroller directly while any overlay is open so the background can't scroll behind
  // a sheet (most visible with the mention sheet's scrollable list + keyboard).
  const overlayOpen = showMentionSheet || showActionSheet || showDeleteConfirm;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div
        className={overlayOpen ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto"}
        style={overlayOpen ? { touchAction: "none", overscrollBehavior: "none" } : undefined}
      >
        <div className="px-[18px] py-[6px] pb-[18px] flex flex-col">
          {/* 작성자 헤더 */}
          <div className="flex items-center gap-[11px] py-[6px]">
            <BoardAvatar
              initial={post.authorName.charAt(0) || "·"}
              color={post.avatarColor}
              size={40}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[6px]">
                <span className="text-[15px] font-extrabold tracking-[-0.01em]">
                  {post.authorName}
                </span>
                {post.authorRole && (
                  <span className="rounded-full bg-primary/[0.09] px-[7px] py-[1.5px] text-[11px] font-bold text-primary">
                    {post.authorRole}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11.5px] font-semibold text-muted-foreground">
                {hydrated ? relativeTime(post.createdAt, locale) : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowActionSheet(true)}
              aria-label={copy.postMore}
              className="inline-flex size-[30px] items-center justify-center rounded-[9px] text-[hsl(222_10%_62%)]"
            >
              <MoreHorizontal className="size-[18px]" aria-hidden="true" />
            </button>
          </div>

          {/* 제목 */}
          {post.title && (
            <h1 className="mt-4 text-[18px] font-black tracking-[-0.02em]">{post.title}</h1>
          )}

          {/* 본문 */}
          <p className="mt-[11px] whitespace-pre-line text-[14px] font-medium leading-[1.72] text-[hsl(222_20%_28%)]">
            {post.content}
          </p>

          {/* 이미지 그리드 — 탭하면 풀스크린 라이트박스 */}
          {post.imageUrls.length > 0 && (
            <BoardImageGrid
              urls={post.imageUrls}
              viewPhotoLabel={copy.viewPhoto}
              closeLabel={copy.close}
            />
          )}

          {/* 첨부 파일 */}
          {post.fileAttachments.length > 0 && (
            <div className="mt-[14px] flex flex-col gap-2">
              {post.fileAttachments.map((f) => (
                <BoardFileCard
                  key={f.url}
                  name={f.name}
                  sizeBytes={f.sizeBytes}
                  mimeType={f.mimeType}
                />
              ))}
            </div>
          )}

          {/* 태그 */}
          {post.tags.length > 0 && (
            <div className="mt-[14px] flex flex-wrap gap-[7px]">
              {post.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-primary/[0.09] px-3 py-[5px] text-[12.5px] font-bold text-primary"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* 반응 바 */}
          <BoardReactionBar reactions={reactions} onToggle={onToggleReaction} />

          {/* 반응자 얼굴 */}
          {reactionSummary && (
            <div className="mt-[13px] flex items-center">
              <div className="flex">
                {post.reactionFaces.map((face, i) => (
                  <BoardAvatar
                    key={i}
                    initial={face.initial}
                    color={face.color}
                    size={28}
                    className={i > 0 ? "-ml-2 ring-2 ring-surface" : undefined}
                  />
                ))}
              </div>
              <span className="ml-[9px] text-[11.5px] font-bold text-muted-foreground">
                {reactionSummary}
              </span>
            </div>
          )}

          {/* 구분선 */}
          <div className="my-[18px] h-px bg-border" />

          {/* 댓글 헤더 */}
          <div className="mb-1 flex items-center gap-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
            {copy.commentLabel}{" "}
            <span className="text-primary">
              {copy.commentCountSuffix.replace("{count}", String(commentCount))}
            </span>
          </div>

          {/* 댓글 목록 */}
          {commentCount === 0 ? (
            <div className="py-[18px] text-center text-[12.5px] font-semibold text-muted-foreground">
              {copy.commentEmpty}
            </div>
          ) : (
            <div>
              {post.comments.map((c, i) => (
                <BoardComment
                  key={c.id}
                  comment={{
                    id: c.id,
                    authorName: c.authorName,
                    authorInitial: c.authorName.charAt(0) || "·",
                    avatarColor: c.avatarColor,
                    role: c.authorRole || undefined,
                    timeLabel: hydrated ? relativeTime(c.createdAt, locale) : "",
                    content: c.content,
                    imageUrls: c.imageUrls,
                    isOwn: c.isOwn,
                    canDelete: c.isOwn || canManage,
                    // 멘션 메타 — BoardCommentDetail 타입 확장 전까지는 빈 배열로 fallback
                    mentionedUsers: (c as { mentionedUsers?: { id: string; name: string }[] }).mentionedUsers ?? [],
                    mentionAll: (c as { mentionAll?: boolean }).mentionAll ?? false,
                  }}
                  isLast={i === post.comments.length - 1}
                  onDelete={onDeleteComment}
                  copy={copy}
                  allLabel={copy.mentionAll}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 댓글 입력바 */}
      <BoardComposer
        postId={post.id}
        organizationId={organizationId}
        myInitial={viewerInitial}
        disabled={!post.allowComments}
        copy={copy}
        mentionedUsers={mentionedUsers}
        mentionAll={mentionAll}
        onOpenMentionSheet={() => setShowMentionSheet(true)}
        onClearMentions={() => {
          setMentionedUsers([]);
          setMentionAll(false);
        }}
        onSubmit={onComposerSubmit}
      />

      {/* 멘션 선택 시트 — full-screen scrim은 BottomSheet의 fixed inset-0이 상단 헤더까지 자동으로 덮음 */}
      {showMentionSheet && (
        <BoardMentionSheet
          onClose={() => setShowMentionSheet(false)}
          onConfirm={onMentionConfirm}
          initialSelection={{
            userIds: mentionedUsers.map((u) => u.id),
            mentionAll,
          }}
          copy={{
            mentionSearchPlaceholder: copy.mentionSearchPlaceholder,
            mentionAll: copy.mentionAll,
            mentionAllSubtitle: copy.mentionAllSubtitle,
            // {n} 플레이스홀더를 런타임 값으로 치환해 함수로 래핑
            mentionDone: (n: number) => copy.mentionDone.replace("{n}", String(n)),
            mentionEmpty: copy.mentionEmpty,
          }}
          searchFn={searchMentions}
        />
      )}

      {/* 더보기 액션 시트 */}
      {showActionSheet && (
        <BoardActionSheet
          onClose={() => setShowActionSheet(false)}
          isOwn={isOwn}
          canManage={canManage}
          isPinned={post.isPinned}
          copy={copy}
          onEdit={() => {
            setShowActionSheet(false);
            router.push(`/mobile/board/${post.id}/edit`);
          }}
          onPin={onPinToggle}
          onShare={onShare}
          onDelete={() => {
            setShowActionSheet(false);
            setShowDeleteConfirm(true);
          }}
        />
      )}

      {/* 삭제 확인 모달 (center-aligned — 의도된 BottomSheet 예외) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-8">
          <div className="w-full max-w-[320px] rounded-[22px] bg-surface p-[22px] text-center shadow-[0_24px_60px_-20px_rgba(15,23,42,0.5)]">
            <p className="text-[15.5px] font-black tracking-[-0.01em] text-foreground">
              {copy.deleteConfirmTitle}
            </p>
            <p className="mt-[7px] text-[12.5px] font-semibold leading-[1.5] text-muted-foreground">
              {copy.deleteConfirmBody}
            </p>
            <div className="mt-[18px] flex gap-[9px]">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-11 flex-1 rounded-[13px] border border-border bg-background text-[13.5px] font-extrabold text-[hsl(222_20%_28%)]"
              >
                {copy.actionCancel}
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="h-11 flex-1 rounded-[13px] bg-[hsl(4_72%_52%)] text-[13.5px] font-extrabold text-white"
              >
                {copy.deleteConfirmCta}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed inset-x-0 bottom-[88px] z-[70] flex justify-center px-6">
          <div className="rounded-full bg-foreground/92 px-[18px] py-[9px] text-[12.5px] font-bold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
