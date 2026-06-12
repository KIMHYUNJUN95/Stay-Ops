"use client";

import { useEffect, useRef, useState } from "react";
import { TaskCard } from "@/components/tasks/task-card";
import type { TaskRecord } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// Matches the list container's `gap-2` (8px). The crossed rows shift by one dragged "slot"
// (dragged row height + gap) so the opened gap lines up with the card being moved.
const GAP = 8;

type CardProps = Omit<
  React.ComponentProps<typeof TaskCard>,
  "task" | "reorderable" | "reordering" | "onReorderHandleDown"
>;

type RowMetric = { id: string; top: number; height: number };

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Vertical drag-reorder list for the Todo "Today" sections.
 *
 * The drag is started only from each card's dedicated grip handle (see TaskCard `reorderable`),
 * so it never conflicts with the card's tap, long-press menu, or swipe. While dragging, the order
 * array is held fixed and the move is previewed by translating the dragged row to follow the finger
 * and shifting the crossed rows by one slot; the array is committed once on drop and persisted.
 *
 * When `disabled` (active search/filter, or multi-select mode) it renders plain cards with no handle
 * and no drag — the list still honours whatever order the parent passed in.
 */
export function ReorderableTaskList({
  items,
  cardProps,
  disabled = false,
  onPersist,
}: {
  items: TaskRecord[];
  cardProps: CardProps;
  disabled?: boolean;
  onPersist: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState<TaskRecord[]>(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [overIndex, setOverIndex] = useState(0);
  // State copies of the drag start index / slot height for use during render (the matching refs
  // below feed the window listeners, which can't read render state). Reading refs during render is
  // disallowed, so the sibling-shift math reads these instead.
  const [dragStartIndex, setDragStartIndex] = useState(0);
  const [dragSlot, setDragSlot] = useState(0);

  const draggingRef = useRef(false);
  const orderRef = useRef(order);
  const overIndexRef = useRef(0);
  const startIndexRef = useRef(0);
  const startYRef = useRef(0);
  const slotRef = useRef(0);
  const metricsRef = useRef<RowMetric[]>([]);
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());
  const onPersistRef = useRef(onPersist);

  // Mirror live render state/props into refs so the once-attached window listeners (below) read
  // current values. Refs may not be written during render, so this happens post-commit in effects.
  useEffect(() => {
    orderRef.current = order;
  }, [order]);
  useEffect(() => {
    overIndexRef.current = overIndex;
  }, [overIndex]);
  useEffect(() => {
    onPersistRef.current = onPersist;
  }, [onPersist]);

  // Resync from the server list whenever it changes — but never mid-drag (that would yank the row
  // out from under the finger). After a persisted reorder the revalidated list arrives here.
  useEffect(() => {
    if (draggingRef.current) return;
    setOrder(items);
  }, [items]);

  // Window listeners are attached once and gated on `draggingRef`, so their references stay stable
  // (clean add/remove) and they always read live values through refs.
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
        onPersistRef.current(next.map((t) => t.id));
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

  function beginDrag(e: React.PointerEvent, task: TaskRecord) {
    if (disabled) return;
    const cur = orderRef.current;
    const si = cur.findIndex((t) => t.id === task.id);
    if (si < 0) return;
    // Snapshot every row's geometry up front; the preview math runs off this cache (no reflow reads
    // mid-drag). Variable card heights are fine — each row carries its own measured height.
    const rows: RowMetric[] = [];
    for (const t of cur) {
      const el = rowRefs.current.get(t.id);
      if (!el) return; // a row isn't mounted yet — abort rather than drag with stale metrics
      const r = el.getBoundingClientRect();
      rows.push({ id: t.id, top: r.top, height: r.height });
    }
    metricsRef.current = rows;
    slotRef.current = rows[si].height + GAP;
    startIndexRef.current = si;
    startYRef.current = e.clientY;
    overIndexRef.current = si;
    draggingRef.current = true;
    setDragStartIndex(si);
    setDragSlot(rows[si].height + GAP);
    setOverIndex(si);
    setDragDelta(0);
    setDragId(task.id);
  }

  return (
    <div className="flex flex-col gap-2">
      {order.map((t, i) => {
        const isDragged = t.id === dragId;
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
            key={t.id}
            ref={(el) => {
              rowRefs.current.set(t.id, el);
            }}
            className="relative"
            style={{
              transform: translateY ? `translateY(${translateY}px)` : undefined,
              transition: isDragged ? "none" : "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
              zIndex: isDragged ? 50 : undefined,
            }}
          >
            <div
              className={cn(
                isDragged &&
                  "rounded-[18px] shadow-[0_18px_40px_-12px_rgba(20,16,10,0.35)] will-change-transform",
              )}
              style={isDragged ? { transform: "scale(1.015)" } : undefined}
            >
              <TaskCard
                task={t}
                reorderable={!disabled}
                reordering={isDragged}
                onReorderHandleDown={beginDrag}
                {...cardProps}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
