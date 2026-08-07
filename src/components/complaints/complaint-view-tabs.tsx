import Link from "next/link";
import "./complaints.css";
import type { Dictionary } from "@/lib/i18n";

export type ComplaintsView = "manual" | "reviews" | "rooms";

/**
 * Manual complaints and external reviews are separated before any filtering — the two are
 * different data domains (docs/product/25-complaint-workflow.md). Server-rendered `<Link>` tabs
 * (not client state) so `/mobile/complaints` only fetches the list the current view needs.
 */
export function ComplaintViewTabs({ view, dict }: { view: ComplaintsView; dict: Dictionary }) {
  const t = dict.complaints;
  return (
    <div className="cx">
      <div className="cx-seg cx-topseg">
        <Link
          href="/mobile/complaints?view=manual"
          className={view === "manual" ? "on" : undefined}
        >
          {t.viewManual}
        </Link>
        <Link
          href="/mobile/complaints?view=reviews"
          className={view === "reviews" ? "on" : undefined}
        >
          {t.viewReviews}
        </Link>
        <Link href="/mobile/complaints?view=rooms" className={view === "rooms" ? "on" : undefined}>
          {t.viewRooms}
        </Link>
      </div>
    </div>
  );
}
