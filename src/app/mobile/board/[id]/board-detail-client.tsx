"use client";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { BoardAvatar } from "@/components/board/board-avatar";
import { BoardReactionBar } from "@/components/board/board-reaction-bar";
import { BoardComment } from "@/components/board/board-comment";
import { BoardComposer } from "@/components/board/board-composer";
import { BoardActionSheet } from "@/components/board/board-action-sheet";
import { getBoardDictionary } from "@/lib/board-i18n";
import type { AvatarColor } from "@/components/board/board-types";
import type { Locale } from "@/lib/i18n";

type ReactionItem = { emoji: string; count: number; isMine: boolean };

const STUB_POST = {
  id: "1",
  authorName: "김지수",
  authorInitial: "김",
  avatarColor: "default" as AvatarColor,
  authorRole: "청소팀",
  timeLabel: "오늘 오전 9:23",
  isPinned: false,
  title: "아라키초 A동 린넨 교체 완료",
  content:
    "오전 객실 린넨 전부 교체했습니다. 침구 상태 사진 같이 올려요. 3호실 베개 커버가 한 장 부족해서 프론트 여분으로 채웠고, 재고는 내일 보충 요청 넣어두겠습니다. 추가로 봐야 할 곳 있으면 댓글 남겨주세요 🙏",
  images: ["IMG · 객실 1", "IMG · 침구"],
  tags: ["업무공유", "청소팀"],
  reactions: [
    { emoji: "👍", count: 5, isMine: true },
    { emoji: "❤️", count: 2, isMine: false },
    { emoji: "😂", count: 0, isMine: false },
    { emoji: "😮", count: 0, isMine: false },
    { emoji: "😢", count: 0, isMine: false },
  ] satisfies ReactionItem[],
  reactionFaces: [
    { initial: "나", color: "default" as AvatarColor },
    { initial: "박", color: "green" as AvatarColor },
    { initial: "한", color: "default" as AvatarColor },
  ],
  reactionSummary: "나 · 박지훈 외 3명이 반응했어요",
  commentCount: 4,
};

const STUB_COMMENTS = [
  {
    id: "1",
    authorName: "박지훈",
    authorInitial: "박",
    avatarColor: "green" as AvatarColor,
    role: "필드 매니저",
    timeLabel: "8분 전",
    content: "고생하셨어요! 3호실 베개 커버는 내일 같이 채워둘게요.",
    isOwn: false,
  },
  {
    id: "2",
    authorName: "한예린",
    authorInitial: "한",
    avatarColor: "default" as AvatarColor,
    timeLabel: "5분 전",
    content: "B동도 곧 끝납니다. 사진 보니 깔끔하네요 👍",
    isOwn: false,
  },
  {
    id: "3",
    authorName: "최도윤",
    authorInitial: "최",
    avatarColor: "blue" as AvatarColor,
    timeLabel: "3분 전",
    content: "재고 보충 요청은 제가 오늘 넣어둘게요.",
    isOwn: false,
  },
];

export function BoardDetailClient({
  postId,
  locale,
}: {
  postId: string;
  locale?: Locale;
}) {
  void postId; // stub — will be used for server data fetching after backend work
  const copy = getBoardDictionary(locale);
  const [reactions, setReactions] = useState<ReactionItem[]>(STUB_POST.reactions);
  const [showActionSheet, setShowActionSheet] = useState(false);

  function toggleReaction(emoji: string) {
    setReactions((prev) =>
      prev.map((r) =>
        r.emoji === emoji
          ? { ...r, isMine: !r.isMine, count: r.isMine ? r.count - 1 : r.count + 1 }
          : r,
      ),
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-[18px] py-[6px] pb-[18px] flex flex-col">

          {/* 작성자 헤더 */}
          <div className="flex items-center gap-[11px] py-[6px]">
            <BoardAvatar
              initial={STUB_POST.authorInitial}
              color={STUB_POST.avatarColor}
              size={40}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[6px]">
                <span className="text-[15px] font-extrabold tracking-[-0.01em]">
                  {STUB_POST.authorName}
                </span>
                <span className="rounded-full bg-primary/[0.09] px-[7px] py-[1.5px] text-[11px] font-bold text-primary">
                  {STUB_POST.authorRole}
                </span>
              </div>
              <div className="mt-0.5 text-[11.5px] font-semibold text-muted-foreground">
                {STUB_POST.timeLabel}
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
          <h1 className="mt-4 text-[18px] font-black tracking-[-0.02em]">
            {STUB_POST.title}
          </h1>

          {/* 본문 */}
          <p className="mt-[11px] text-[14px] font-medium leading-[1.72] text-[hsl(222_20%_28%)]">
            {STUB_POST.content}
          </p>

          {/* 이미지 그리드 */}
          {STUB_POST.images.length > 0 && (
            <div className="mt-[14px] grid grid-cols-2 gap-[6px]">
              {STUB_POST.images.map((label) => (
                <div
                  key={label}
                  className="relative h-[116px] rounded-[10px] overflow-hidden border border-border bg-[repeating-linear-gradient(135deg,hsl(40_22%_90%)_0_11px,hsl(40_26%_87%)_11px_22px)] flex items-center justify-center"
                >
                  <span className="font-mono text-[10px] font-bold text-[hsl(222_10%_62%)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 태그 */}
          {STUB_POST.tags.length > 0 && (
            <div className="mt-[14px] flex flex-wrap gap-[7px]">
              {STUB_POST.tags.map((t) => (
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
          <BoardReactionBar reactions={reactions} onToggle={toggleReaction} />

          {/* 반응자 얼굴 */}
          <div className="mt-[13px] flex items-center">
            <div className="flex">
              {STUB_POST.reactionFaces.map((face, i) => (
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
              {STUB_POST.reactionSummary}
            </span>
          </div>

          {/* 구분선 */}
          <div className="my-[18px] h-px bg-border" />

          {/* 댓글 헤더 */}
          <div className="mb-1 flex items-center gap-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
            {copy.commentLabel}{" "}
            <span className="text-primary">{copy.commentCountSuffix(STUB_POST.commentCount)}</span>
          </div>

          {/* 댓글 목록 */}
          <div>
            {STUB_COMMENTS.map((c, i) => (
              <BoardComment
                key={c.id}
                comment={c}
                isLast={i === STUB_COMMENTS.length - 1}
                copy={copy}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 댓글 입력바 */}
      <BoardComposer copy={copy} />

      {/* 더보기 액션 시트 */}
      {showActionSheet && (
        <BoardActionSheet
          onClose={() => setShowActionSheet(false)}
          isOwn={true}
          isPinned={STUB_POST.isPinned}
        />
      )}
    </div>
  );
}
