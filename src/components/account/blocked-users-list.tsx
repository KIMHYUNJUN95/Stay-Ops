"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unblockBoardUser } from "@/app/mobile/board/moderation-actions";

/** 계정 → 보안 「차단한 사용자」 — 게시판 차단 해제(2026-10-06). */
export function BlockedUsersList({
  users,
  copy,
}: {
  users: { id: string; name: string }[];
  copy: { title: string; body: string; empty: string; unblock: string; unknown: string };
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onUnblock(id: string) {
    setPendingId(id);
    try {
      await unblockBoardUser(id);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <p className="text-sm font-bold">{copy.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{copy.body}</p>
      {users.length === 0 ? (
        <p className="mt-2 text-[13px] font-semibold text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {users.map((u) => (
            <li className="flex items-center justify-between gap-3 py-2" key={u.id}>
              <span className="truncate text-sm font-semibold">{u.name || copy.unknown}</span>
              <button
                className="shrink-0 rounded-full border border-border px-3 py-1 text-[12.5px] font-bold text-primary disabled:opacity-50"
                disabled={pendingId === u.id}
                onClick={() => onUnblock(u.id)}
                type="button"
              >
                {copy.unblock}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
