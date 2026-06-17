"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ProjectSectionInfo } from "@/lib/projects";
import { cn } from "@/lib/utils";

// Matches the container's vertical gap (gap-2 = 8px). A crossed block shifts by one dragged "slot"
// (dragged block height + gap) so the opened gap lines up with the section being moved.
const GAP = 8;

type RowMetric = { id: string; top: number; height: number };

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Vertical drag-reorder for a project's sections. Mirrors `reorderable-task-list`, but each draggable
 * "row" is a whole section block. The component renders the section header (grip handle for owners,
 * title, count, edit/delete); the body (task rows + add link) comes from `renderBody`. `beginDrag` is
 * used only in the grip's pointer handler — never passed into `renderBody` — so it stays out of render
 * (satisfies react-hooks/refs). When `disabled`, the grip is replaced by a static chevron and no drag.
 */
export function ReorderableSectionList({
  sections,
  disabled = false,
  isOwner,
  reorderHandleLabel,
  editLabel,
  deleteLabel,
  countOf,
  onRename,
  onDelete,
  onPersist,
  renderBody,
}: {
  sections: ProjectSectionInfo[];
  disabled?: boolean;
  isOwner: boolean;
  reorderHandleLabel: string;
  editLabel: string;
  deleteLabel: string;
  countOf: (sectionId: string) => number;
  onRename: (section: ProjectSectionInfo) => void;
  onDelete: (section: ProjectSectionInfo) => void;
  onPersist: (orderedIds: string[]) => void;
  renderBody: (section: ProjectSectionInfo) => React.ReactNode;
}) {
  const [order, setOrder] = useState<ProjectSectionInfo[]>(sections);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [overIndex, setOverIndex] = useState(0);
  const [dragStartIndex, setDragStartIndex] = useState(0);
  const [dragSlot, setDragSlot] = useState(0);

  const draggingRef = useRef(false);
  const orderRef = useRef(order);
  const overIndexRef = useRef(0);
  const startIndexRef = useRef(0);
  const startYRef = useRef(0);
  const metricsRef = useRef<RowMetric[]>([]);
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());
  const onPersistRef = useRef(onPersist);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);
  useEffect(() => {
    overIndexRef.current = overIndex;
  }, [overIndex]);
  useEffect(() => {
    onPersistRef.current = onPersist;
  }, [onPersist]);

  // Resync from the server list whenever it changes — but never mid-drag.
  useEffect(() => {
    if (draggingRef.current) return;
    setOrder(sections);
  }, [sections]);

  useEffect(() => {
    function finishDrag() {
      draggingRef.current = false;
      const si = startIndexRef.current;
      const ti = overIndexRef.current;
      setDragId(null);
      setDragDelta(0);
      if (ti !== si) {
        const next = moveItem(orderRef.current, si, ti);
        setOrder(next);
        onPersistRef.current(next.map((s) => s.id));
      }
    }
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      e.preventDefault();
      const rows = metricsRef.current;
      const si = startIndexRef.current;
      if (!rows.length || si < 0) return;
      const dy = e.clientY - startYRef.current;
      setDragDelta(dy);
      const draggedCenter = rows[si].top + rows[si].height / 2 + dy;
      let ti = si;
      for (let i = si + 1; i < rows.length; i++) {
        if (draggedCenter > rows[i].top + rows[i].height / 2) ti = i;
        else break;
      }
      if (ti === si) {
        for (let i = si - 1; i >= 0; i--) {
          if (draggedCenter < rows[i].top + rows[i].height / 2) ti = i;
          else break;
        }
      }
      setOverIndex(ti);
    }
    function onUp() {
      if (!draggingRef.current) return;
      finishDrag();
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function beginDrag(e: React.PointerEvent, section: ProjectSectionInfo) {
    if (disabled) return;
    const cur = orderRef.current;
    const si = cur.findIndex((s) => s.id === section.id);
    if (si < 0) return;
    const rows: RowMetric[] = [];
    for (const s of cur) {
      const el = rowRefs.current.get(s.id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      rows.push({ id: s.id, top: r.top, height: r.height });
    }
    metricsRef.current = rows;
    startIndexRef.current = si;
    startYRef.current = e.clientY;
    overIndexRef.current = si;
    draggingRef.current = true;
    setDragStartIndex(si);
    setDragSlot(rows[si].height + GAP);
    setOverIndex(si);
    setDragDelta(0);
    setDragId(section.id);
  }

  return (
    <div className="flex flex-col gap-2">
      {order.map((s, i) => {
        const isDragged = s.id === dragId;
        let translateY = 0;
        if (dragId) {
          if (isDragged) {
            translateY = dragDelta;
          } else {
            const si = dragStartIndex;
            const ti = overIndex;
            if (ti > si && i > si && i <= ti) translateY = -dragSlot;
            else if (ti < si && i >= ti && i < si) translateY = dragSlot;
          }
        }
        return (
          <div
            className="relative"
            key={s.id}
            ref={(el) => {
              rowRefs.current.set(s.id, el);
            }}
            style={{
              transform: translateY ? `translateY(${translateY}px)` : undefined,
              transition: isDragged ? "none" : "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
              zIndex: isDragged ? 50 : undefined,
            }}
          >
            <div
              className={cn(
                isDragged &&
                  "rounded-[16px] bg-surface shadow-[0_18px_40px_-12px_rgba(20,16,10,0.35)] will-change-transform",
              )}
            >
              <div className="flex items-center gap-1.5 px-0.5 pb-2 pt-3">
                {isOwner ? (
                  <button
                    aria-label={reorderHandleLabel}
                    className="flex size-6 touch-none cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => beginDrag(e, s)}
                    type="button"
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="flex text-muted-foreground">
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </span>
                )}
                <span className="whitespace-nowrap text-[13.5px] font-extrabold tracking-[-0.01em] text-foreground">
                  {s.title}
                </span>
                <span className="text-[11.5px] font-bold text-muted-foreground/70">{countOf(s.id)}</span>
                {isOwner ? (
                  <span className="ml-auto flex gap-1">
                    <button
                      aria-label={editLabel}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      onClick={() => onRename(s)}
                      type="button"
                    >
                      <Pencil className="size-[15px]" aria-hidden="true" />
                    </button>
                    <button
                      aria-label={deleteLabel}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => onDelete(s)}
                      type="button"
                    >
                      <Trash2 className="size-[15px]" aria-hidden="true" />
                    </button>
                  </span>
                ) : null}
              </div>
              {renderBody(s)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
