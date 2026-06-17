import { redirect } from "next/navigation";

// Staff Suggestions / Feedback Box — the referenced detail is now rendered role-aware by the
// `/mobile/suggestions/[id]` route (Step 4, 2026-06-16), so this design-preview route (which had no
// suggestion id and only showed sample data) just redirects back to the list.
// See docs/product/22-staff-suggestions-workflow.md.
export default function MobileSuggestionReferencedPage() {
  redirect("/mobile/suggestions");
}
