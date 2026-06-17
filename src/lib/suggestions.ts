// Staff Suggestions / Feedback Box — shared types + constants (Step 1, schema-adjacent only).
//
// This module intentionally holds NO queries, server actions, or UI wiring yet. It exists so later
// steps (list / detail / comments / status) can share the row types, the status union, and the
// image cap without re-deriving them. See docs/engineering/12-staff-suggestions-technical-design.md.

import type { Database } from "@/types/database";

export type StaffSuggestionRow = Database["public"]["Tables"]["staff_suggestions"]["Row"];
export type StaffSuggestionReferenceRow =
  Database["public"]["Tables"]["staff_suggestion_references"]["Row"];
export type StaffSuggestionCommentRow =
  Database["public"]["Tables"]["staff_suggestion_comments"]["Row"];

/** Suggestion lifecycle. Only the recipient may move between these (enforced server-side later). */
export type StaffSuggestionStatus = "submitted" | "reviewing" | "on_hold" | "completed";

export const STAFF_SUGGESTION_STATUSES: readonly StaffSuggestionStatus[] = [
  "submitted",
  "reviewing",
  "on_hold",
  "completed",
];

/** Max photos on a suggestion row and on each comment row — mirrors the DB CHECK constraint. */
export const STAFF_SUGGESTION_MAX_IMAGES = 5;

/** `on_hold` requires a hold reason; `completed` requires a completion note (mirrors DB CHECKs). */
export function suggestionStatusRequiresNote(status: StaffSuggestionStatus): boolean {
  return status === "on_hold" || status === "completed";
}
