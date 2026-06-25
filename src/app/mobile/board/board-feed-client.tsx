"use client";
import { useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { BoardTagFilter } from "@/components/board/board-tag-filter";
import { BoardListRow } from "@/components/board/board-list-row";
import { BoardEmptyState } from "@/components/board/board-empty-state";
import { getBoardDictionary } from "@/lib/board-i18n";
import type { Locale } from "@/lib/i18n";

// stub 데이터 — 백엔드 작업 후 서버 쿼리로 교체 예정
const MOCK_POSTS = [
  {
    id: "1",
    isPinned: true,
    category: "업무공유",
    title: "이번 주 객실 점검 순번 공유",
    authorName: "박지훈",
    timeLabel: "오늘 오전 8:40",
    commentCount: 5,
    isUnread: false,
  },
  {
    id: "2",
    isPinned: false,
    category: "업무공유",
    title: "아라키초 A동 린넨 교체 완료",
    authorName: "김지수",
    timeLabel: "오늘 오전 9:23",
    commentCount: 2,
    isUnread: true,
  },
  {
    id: "3",
    isPinned: false,
    category: "건의",
    title: "오후 택배 수령 가능하신 분 계실까요?",
    authorName: "이소연",
    timeLabel: "오늘 오전 7:55",
    commentCount: 4,
    isUnread: false,
  },
  {
    id: "4",
    isPinned: false,
    category: "일상",
    title: "점심 같이 드실 분 🍱",
    authorName: "최도윤",
    timeLabel: "어제 오후 12:10",
    commentCount: 3,
    isUnread: false,
  },
  {
    id: "5",
    isPinned: false,
    category: "정보공유",
    title: "비품 재고 정리 팁 공유합니다",
    authorName: "정우진",
    timeLabel: "어제 오후 4:11",
    commentCount: 1,
    isUnread: false,
  },
  {
    id: "6",
    isPinned: false,
    category: "정보공유",
    title: "신규 입사자 안내 자료 공유",
    authorName: "박지훈",
    timeLabel: "어제 오전 10:30",
    commentCount: 0,
    isUnread: false,
  },
  {
    id: "7",
    isPinned: false,
    category: "일상",
    title: "창고 정리 도와주신 분들 감사합니다",
    authorName: "정우진",
    timeLabel: "2일 전",
    commentCount: 2,
    isUnread: false,
  },
  {
    id: "8",
    isPinned: false,
    category: "건의",
    title: "휴게실 정수기 필터 교체 요청",
    authorName: "한예린",
    timeLabel: "2일 전",
    commentCount: 6,
    isUnread: false,
  },
];

// 태그 목록은 카테고리와 동일한 언어로 구성 (stub 단계에서는 ko 카테고리 그대로 사용)
const ALL_TAGS_KO = ["전체", "업무공유", "일상", "건의", "정보공유"];

export function BoardFeedClient({ locale }: { locale: Locale }) {
  const copy = getBoardDictionary(locale);

  const [selectedTag, setSelectedTag] = useState<string>(copy.allTag);

  const pinnedPosts = MOCK_POSTS.filter((p) => p.isPinned);
  const normalPosts = MOCK_POSTS.filter((p) => !p.isPinned);

  const isAll = selectedTag === copy.allTag;
  const filteredPinned = isAll
    ? pinnedPosts
    : pinnedPosts.filter((p) => p.category === selectedTag);
  const filteredNormal = isAll
    ? normalPosts
    : normalPosts.filter((p) => p.category === selectedTag);

  const filteredTotal = filteredPinned.length + filteredNormal.length;
  const isEmpty = filteredTotal === 0;

  // 태그 목록: "전체" 자리는 로케일 allTag, 나머지는 ko 카테고리 (stub 단계)
  const displayTags = [copy.allTag, ...ALL_TAGS_KO.slice(1)];

  return (
    <div className="flex min-h-full flex-col">
      {/* 페이지 헤더 */}
      <div className="shrink-0 px-[18px] pb-[8px]">
        <div className="mb-[13px] flex items-center gap-[9px]">
          <h1 className="text-[22px] font-black tracking-[-0.03em] text-foreground">
            {copy.title}
          </h1>
          <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-border bg-surface px-[7px] text-[11px] font-black text-muted-foreground shadow-[0_4px_10px_-6px_hsl(223_46%_32%/0.25)]">
            {MOCK_POSTS.length}
          </span>
          <Link
            href="/mobile/board/compose"
            className="ml-auto flex h-9 items-center gap-[6px] rounded-full bg-primary px-[15px] text-[13.5px] font-extrabold text-white shadow-[0_10px_18px_-10px_hsl(223_46%_32%/0.55)]"
          >
            <Pencil className="size-4" aria-hidden="true" />
            {copy.compose}
          </Link>
        </div>
      </div>

      {/* 태그 필터 */}
      <div className="shrink-0 pb-[10px]">
        <BoardTagFilter
          tags={displayTags}
          selected={selectedTag}
          onSelect={setSelectedTag}
        />
      </div>

      {/* 필터 결과 레이블 */}
      {!isAll && (
        <div className="shrink-0 px-[18px] pb-[2px] pt-[11px] text-[11.5px] font-bold text-muted-foreground">
          <b className="text-primary">{selectedTag}</b>{" "}
          {copy.filterResultSuffix(filteredTotal)}
        </div>
      )}

      {/* 목록 or 빈 상태 */}
      {isEmpty ? (
        <BoardEmptyState title={copy.emptyTitle} subtitle={copy.emptySubtitle} />
      ) : (
        <div className="px-[18px] pb-[120px]">
          {filteredPinned.map((post) => (
            <Link
              key={post.id}
              href={`/mobile/board/${post.id}`}
              className="block"
            >
              <BoardListRow
                id={post.id}
                title={post.title}
                category={post.category}
                authorName={post.authorName}
                timeLabel={post.timeLabel}
                commentCount={post.commentCount}
                isPinned={post.isPinned}
                isUnread={post.isUnread}
                pinnedBadge={copy.pinnedBadge}
              />
            </Link>
          ))}
          {filteredNormal.map((post) => (
            <Link
              key={post.id}
              href={`/mobile/board/${post.id}`}
              className="block"
            >
              <BoardListRow
                id={post.id}
                title={post.title}
                category={post.category}
                authorName={post.authorName}
                timeLabel={post.timeLabel}
                commentCount={post.commentCount}
                isPinned={post.isPinned}
                isUnread={post.isUnread}
                pinnedBadge={copy.pinnedBadge}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
