"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FolderOpen, Plus, Search, Share2, X } from "lucide-react";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import type { Dictionary } from "@/lib/i18n";
import type { ProjectSummary } from "@/lib/projects";
import type { ShareableUser } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { createProject } from "@/app/mobile/tasks/projects/actions";

type Copy = Dictionary["tasks"];

function pctOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function AvatarStack({ members }: { members: ProjectSummary["members"] }) {
  const shown = members.slice(0, 3);
  const extra = members.length - shown.length;
  return (
    <div className="flex">
      {shown.map((m, i) => (
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full border-2 border-surface text-[11px] font-extrabold",
            i === 0 ? "ml-0" : "-ml-2",
            m.role === "owner" ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600",
          )}
          key={m.userId}
        >
          {m.name.slice(0, 1)}
        </span>
      ))}
      {extra > 0 ? (
        <span className="-ml-2 inline-flex size-7 items-center justify-center rounded-full border-2 border-surface bg-slate-100 text-[11px] font-extrabold text-muted-foreground">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export function ProjectsBoard({
  copy,
  projects,
  shareableUsers,
}: {
  copy: Copy;
  projects: ProjectSummary[];
  shareableUsers: ShareableUser[];
}) {
  const p = copy.projects;

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Create sheet — mount/shown split so it can animate out before unmounting.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const open = useCallback(() => {
    setMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }, []);
  const close = useCallback(() => {
    setShown(false);
    setTimeout(() => setMounted(false), 320);
  }, []);

  // iOS-style drag-to-dismiss on the grab handle / title.
  const drag = useSheetDragDismiss({ shown, onDismiss: close });

  // Create-sheet form state. Share defaults ON so the invite search is visible (matches the design).
  const [shareOn, setShareOn] = useState(true);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const invitedUsers = shareableUsers.filter((u) => inviteIds.includes(u.id));
  const inviteResults = (() => {
    const q = inviteQuery.trim();
    if (!q) return [];
    return shareableUsers
      .filter((u) => !inviteIds.includes(u.id) && u.name.includes(q))
      .slice(0, 6);
  })();

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, close]);

  return (
    <div className="relative">
      {projects.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="mb-4 flex size-[60px] items-center justify-center rounded-[18px] bg-slate-50 text-slate-400">
            <FolderOpen className="size-7" aria-hidden="true" />
          </span>
          <p className="text-[15px] font-extrabold text-foreground">{p.emptyTitle}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{p.emptySub}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {projects.map((proj) => {
            const pct = pctOf(proj.completedTasks, proj.totalTasks);
            return (
              <Link
                className="block rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(20,32,43,0.03)] transition-colors active:bg-slate-50"
                href={`/mobile/tasks/projects/${proj.id}`}
                key={proj.id}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[16px] font-extrabold tracking-[-0.02em] text-foreground">
                    <span className="truncate">{proj.title}</span>
                    {proj.isShared ? (
                      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-primary/[0.09] text-primary">
                        <Share2 className="size-[13px]" aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/[0.09] px-2.5 py-1 text-[12px] font-extrabold text-primary">
                    {pct}%
                  </span>
                </div>
                <div className="my-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  {proj.members.length > 0 ? <AvatarStack members={proj.members} /> : <span />}
                  <span className="whitespace-nowrap text-[12.5px] font-bold text-muted-foreground">
                    {p.taskCount
                      .replace("{done}", String(proj.completedTasks))
                      .replace("{total}", String(proj.totalTasks))}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create FAB — pill with label, portaled to body so it stays viewport-fixed. */}
      {hydrated
        ? createPortal(
            <button
              className="fixed bottom-24 right-4 z-30 inline-flex h-[52px] items-center gap-2 rounded-full bg-primary pl-[18px] pr-5 text-[14px] font-extrabold text-primary-foreground shadow-[0_16px_30px_-10px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-[0.97]"
              onClick={open}
              type="button"
            >
              <Plus className="size-5" strokeWidth={2.2} aria-hidden="true" />
              {p.createFab}
            </button>,
            document.body,
          )
        : null}

      {/* Create sheet */}
      {mounted && hydrated
        ? createPortal(
            <div
              className={cn(
                "fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(20,16,10,0.5)] transition-opacity duration-300 motion-reduce:transition-none",
                shown ? "opacity-100" : "opacity-0",
              )}
              onClick={close}
              style={drag.scrimStyle}
            >
              <div
                className={cn(
                  "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3",
                  "transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
                  shown ? "translate-y-0" : "translate-y-full",
                )}
                data-sheet
                onClick={(e) => e.stopPropagation()}
                style={drag.sheetStyle}
              >
                <div
                  className="mx-auto mb-4 h-1 w-[38px] rounded-full bg-slate-200"
                  {...drag.handleProps}
                />
                <p
                  className="mb-[18px] text-[19px] font-black tracking-[-0.02em] text-foreground"
                  {...drag.handleProps}
                >
                  {p.createTitle}
                </p>

                <form action={createProject}>
                  <input name="share" type="hidden" value={shareOn ? "on" : "off"} />
                  <input name="shareJson" type="hidden" value={JSON.stringify(inviteIds)} />

                  <div className="mb-[15px]">
                    <div className="mb-[7px] px-0.5 text-[12px] font-bold text-slate-700">
                      {p.nameLabel}
                    </div>
                    <input
                      autoFocus
                      className="h-[52px] w-full rounded-[13px] border border-border bg-background px-3.5 text-[17px] font-bold text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/60 focus:border-primary"
                      name="title"
                      placeholder={p.namePlaceholder}
                      required
                    />
                  </div>

                  <div className="mb-[15px]">
                    <div className="mb-[7px] flex items-center gap-1.5 px-0.5 text-[12px] font-bold text-slate-700">
                      {p.descLabel}
                      <span className="font-semibold text-muted-foreground/70">{p.optional}</span>
                    </div>
                    <textarea
                      className="w-full resize-none rounded-[13px] border border-border bg-background px-3.5 py-3 text-[14px] font-medium leading-relaxed text-foreground outline-none [scrollbar-width:none] placeholder:text-muted-foreground/60 focus:border-primary [&::-webkit-scrollbar]:hidden"
                      name="description"
                      placeholder={p.descPlaceholder}
                      rows={2}
                    />
                  </div>

                  <div className="mb-[15px]">
                    <div className="flex items-center justify-between rounded-[13px] border border-border bg-background px-3.5 py-3">
                      <div>
                        <b className="text-[14px] font-bold text-foreground">{p.shareLabel}</b>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{p.shareSub}</p>
                      </div>
                      <button
                        aria-pressed={shareOn}
                        className={cn(
                          "relative h-[27px] w-[46px] shrink-0 rounded-full transition-colors",
                          shareOn ? "bg-primary" : "bg-slate-200",
                        )}
                        onClick={() => setShareOn((v) => !v)}
                        type="button"
                      >
                        <span
                          className={cn(
                            "absolute top-[3px] size-[21px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-[left]",
                            shareOn ? "left-[22px]" : "left-[3px]",
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {shareOn ? (
                    <div className="mt-3 rounded-[13px] border border-border bg-background p-3.5">
                      <div className="mb-2.5 flex items-center gap-1.5 px-0.5 text-[12px] font-bold text-slate-700">
                        {p.inviteLabel}
                        <span className="font-semibold text-muted-foreground/70">{p.optional}</span>
                      </div>
                      <div className="relative flex items-center">
                        <Search
                          className="pointer-events-none absolute left-3 size-4 text-muted-foreground/60"
                          aria-hidden="true"
                        />
                        <input
                          className="h-[42px] w-full rounded-[11px] border border-border bg-surface pl-9 pr-3.5 text-[13.5px] font-medium text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
                          onChange={(e) => setInviteQuery(e.target.value)}
                          placeholder={p.inviteSearch}
                          value={inviteQuery}
                        />
                      </div>
                      {inviteResults.length > 0 ? (
                        <div className="mt-2 overflow-hidden rounded-[11px] border border-border bg-surface">
                          {inviteResults.map((u) => (
                            <button
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors active:bg-slate-50"
                              key={u.id}
                              onClick={() => {
                                setInviteIds((prev) => [...prev, u.id]);
                                setInviteQuery("");
                              }}
                              type="button"
                            >
                              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-extrabold text-primary">
                                {u.name.slice(0, 1)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">
                                {u.name}
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{u.role}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {invitedUsers.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {invitedUsers.map((u) => (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.09] py-[5px] pl-[5px] pr-1.5 text-[12px] font-bold text-primary"
                              key={u.id}
                            >
                              <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                {u.name.slice(0, 1)}
                              </span>
                              {u.name}
                              <button
                                aria-label="remove"
                                className="flex size-4 items-center justify-center text-primary/60"
                                onClick={() => setInviteIds((prev) => prev.filter((x) => x !== u.id))}
                                type="button"
                              >
                                <X className="size-3" aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-[22px] flex gap-2.5">
                    <button
                      className="h-[50px] shrink-0 basis-24 rounded-[14px] bg-slate-100 text-[14.5px] font-extrabold text-slate-700"
                      onClick={close}
                      type="button"
                    >
                      {copy.cancel}
                    </button>
                    <button
                      className="h-[50px] flex-1 rounded-[14px] bg-primary text-[14.5px] font-extrabold text-primary-foreground"
                      type="submit"
                    >
                      {p.create}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
