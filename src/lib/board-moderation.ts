// 게시판 신고 · 차단 — server-only 조회 (2026-10-06, 앱 출시 준비 B4).
//
// 두 표(`board_reports` · `user_blocks`)는 service-role 전용이라 여기서만 읽는다. 게시판 피드 · 상세 쿼리는
// `getBoardHiddenFor()` 결과로 「내가 신고한 글 · 댓글」과 「내가 차단한 사람의 글 · 댓글」을 걸러 낸다.
// 문서: docs/product/23-board-workflow.md → 「신고 · 차단」.

import type { AppSession } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const BOARD_REPORT_REASONS = ["spam", "harassment", "inappropriate", "privacy", "other"] as const;
export type BoardReportReason = (typeof BOARD_REPORT_REASONS)[number];

export function isBoardReportReason(value: unknown): value is BoardReportReason {
  return typeof value === "string" && (BOARD_REPORT_REASONS as readonly string[]).includes(value);
}

export type BoardHiddenSet = {
  blockedUserIds: Set<string>;
  hiddenPostIds: Set<string>;
  hiddenCommentIds: Set<string>;
};

const EMPTY_HIDDEN: BoardHiddenSet = {
  blockedUserIds: new Set(),
  hiddenPostIds: new Set(),
  hiddenCommentIds: new Set(),
};

/** 이 사용자에게 숨길 것: 내가 차단한 사람 · 내가 신고한 글 · 댓글. 실패하면 아무것도 숨기지 않는다(게시판이 비면 안 된다). */
export async function getBoardHiddenFor(session: AppSession): Promise<BoardHiddenSet> {
  try {
    const service = getSupabaseServiceClient();
    const orgId = session.organization.id;
    const uid = session.user.id;
    const [blocks, reports] = await Promise.all([
      service
        .from("user_blocks")
        .select("blocked_user_id")
        .eq("organization_id", orgId)
        .eq("blocker_user_id", uid),
      service
        .from("board_reports")
        .select("target_type, post_id, comment_id")
        .eq("organization_id", orgId)
        .eq("reporter_user_id", uid),
    ]);
    if (blocks.error || reports.error) return EMPTY_HIDDEN;

    const hidden: BoardHiddenSet = {
      blockedUserIds: new Set((blocks.data ?? []).map((b) => b.blocked_user_id)),
      hiddenPostIds: new Set(),
      hiddenCommentIds: new Set(),
    };
    for (const r of reports.data ?? []) {
      if (r.target_type === "post") hidden.hiddenPostIds.add(r.post_id);
      else if (r.comment_id) hidden.hiddenCommentIds.add(r.comment_id);
    }
    return hidden;
  } catch {
    return EMPTY_HIDDEN;
  }
}

export function canModerateBoard(session: AppSession): boolean {
  return session.user.role === "owner" || session.user.role === "office_admin";
}

/** 처리 대기 중인 신고 대상 수(같은 대상의 여러 신고는 1건). 처리 권한이 없으면 0. */
export async function countPendingBoardReports(session: AppSession): Promise<number> {
  if (!canModerateBoard(session)) return 0;
  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service
      .from("board_reports")
      .select("target_type, post_id, comment_id")
      .eq("organization_id", session.organization.id)
      .eq("status", "pending");
    if (error) return 0;
    return new Set((data ?? []).map((r) => `${r.target_type}:${r.comment_id ?? r.post_id}`)).size;
  } catch {
    return 0;
  }
}

export type PendingBoardReport = {
  key: string;
  targetType: "post" | "comment";
  postId: string;
  commentId: string | null;
  authorName: string;
  preview: string;
  reasons: BoardReportReason[];
  notes: string[];
  count: number;
  latestAt: string;
};

/**
 * 처리 대기 신고를 대상별로 묶어 최신순으로. 대상이 이미 지워졌으면(작성자 · 관리자 삭제) 그 신고는 「삭제됨」으로
 * 정리하고 목록에서 뺀다.
 */
export async function listPendingBoardReports(session: AppSession): Promise<PendingBoardReport[]> {
  if (!canModerateBoard(session)) return [];
  const service = getSupabaseServiceClient();
  const orgId = session.organization.id;

  const { data, error } = await service
    .from("board_reports")
    .select("id, target_type, post_id, comment_id, reason, note, created_at, target_author_user_id")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return [];

  const postIds = Array.from(new Set(data.map((r) => r.post_id)));
  const commentIds = Array.from(
    new Set(data.map((r) => r.comment_id).filter((id): id is string => Boolean(id))),
  );
  const authorIds = Array.from(
    new Set(data.map((r) => r.target_author_user_id).filter((id): id is string => Boolean(id))),
  );

  const [posts, comments, profiles] = await Promise.all([
    service.from("board_posts").select("id, title, content, deleted_at").in("id", postIds),
    commentIds.length
      ? service.from("board_comments").select("id, content, deleted_at").in("id", commentIds)
      : Promise.resolve({ data: [] as { id: string; content: string; deleted_at: string | null }[], error: null }),
    authorIds.length
      ? service.from("profiles").select("id, name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);

  const postMap = new Map((posts.data ?? []).map((p) => [p.id, p]));
  const commentMap = new Map((comments.data ?? []).map((c) => [c.id, c]));
  const nameMap = new Map((profiles.data ?? []).map((p) => [p.id, p.name]));

  const groups = new Map<string, PendingBoardReport>();
  const goneReportIds: string[] = [];

  for (const r of data) {
    const targetType = r.target_type === "comment" ? "comment" : "post";
    const post = postMap.get(r.post_id);
    const comment = r.comment_id ? commentMap.get(r.comment_id) : undefined;
    const gone =
      !post || post.deleted_at || (targetType === "comment" && (!comment || comment.deleted_at));
    if (gone) {
      goneReportIds.push(r.id);
      continue;
    }

    const key = `${targetType}:${r.comment_id ?? r.post_id}`;
    let group = groups.get(key);
    if (!group) {
      const preview =
        targetType === "comment" ? (comment?.content ?? "") : (post?.title || post?.content || "");
      group = {
        key,
        targetType,
        postId: r.post_id,
        commentId: r.comment_id,
        authorName: (r.target_author_user_id && nameMap.get(r.target_author_user_id)) || "",
        preview: preview.slice(0, 160),
        reasons: [],
        notes: [],
        count: 0,
        latestAt: r.created_at,
      };
      groups.set(key, group);
    }
    group.count += 1;
    if (isBoardReportReason(r.reason) && !group.reasons.includes(r.reason)) group.reasons.push(r.reason);
    if (r.note) group.notes.push(r.note);
  }

  if (goneReportIds.length > 0) {
    // best-effort 정리 — 실패해도 다음 조회에서 다시 걸러진다.
    await service
      .from("board_reports")
      .update({ status: "removed", resolved_at: new Date().toISOString() })
      .in("id", goneReportIds);
  }

  return Array.from(groups.values());
}

export type BlockedUser = { id: string; name: string };

/** 내가 차단한 사용자 목록(계정 → 보안). */
export async function listMyBlockedUsers(session: AppSession): Promise<BlockedUser[]> {
  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service
      .from("user_blocks")
      .select("blocked_user_id, created_at")
      .eq("organization_id", session.organization.id)
      .eq("blocker_user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error || !data || data.length === 0) return [];
    const ids = data.map((b) => b.blocked_user_id);
    const { data: profiles } = await service.from("profiles").select("id, name").in("id", ids);
    const names = new Map((profiles ?? []).map((p) => [p.id, p.name]));
    return ids.map((id) => ({ id, name: names.get(id) ?? "" }));
  } catch {
    return [];
  }
}
