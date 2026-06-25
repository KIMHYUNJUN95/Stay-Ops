// Re-export the canonical types from the server-only domain module so components can import
// from a client-safe path without pulling `server-only` into the client bundle.
import type { BugStatus } from "@/lib/bug-reports";
import type { Dictionary } from "@/lib/i18n";

export type { BugReport, BugStatus } from "@/lib/bug-reports";

/** The localized copy slice for the bug-report surfaces, passed from server pages to clients. */
export type BugCopy = Dictionary["bugs"];

/** Single source of truth for status → localized label (used by badge, list, detail, sheet). */
export function bugStatusLabel(copy: BugCopy, status: BugStatus): string {
  switch (status) {
    case "submitted":
      return copy.statusSubmitted;
    case "reviewing":
      return copy.statusReviewing;
    case "fixed":
      return copy.statusFixed;
    case "closed":
      return copy.statusClosed;
    default:
      return status;
  }
}
