"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withdrawBoardReport } from "@/app/mobile/board/moderation-actions";

export type MyReportRow = {
  id: string;
  authorName: string;
  preview: string;
  reasonLabel: string;
  statusLabel: string;
};

/** 계정 → 보안 「신고한 글 · 댓글」 — 신고 취소로 다시 보이게 한다(2026-10-06). */
export function MyReportsList({
  reports,
  copy,
}: {
  reports: MyReportRow[];
  copy: { title: string; body: string; empty: string; withdraw: string; unknown: string };
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onWithdraw(id: string) {
    setPendingId(id);
    try {
      await withdrawBoardReport(id);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <p className="text-sm font-bold">{copy.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{copy.body}</p>
      {reports.length === 0 ? (
        <p className="mt-2 text-[13px] font-semibold text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {reports.map((r) => (
            <li className="flex items-center justify-between gap-3 py-2" key={r.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.preview}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                  {r.authorName || copy.unknown} · {r.reasonLabel} · {r.statusLabel}
                </p>
              </div>
              <button
                className="shrink-0 rounded-full border border-border px-3 py-1 text-[12.5px] font-bold text-primary disabled:opacity-50"
                disabled={pendingId === r.id}
                onClick={() => onWithdraw(r.id)}
                type="button"
              >
                {copy.withdraw}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
