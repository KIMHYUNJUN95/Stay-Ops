import { redirect } from "next/navigation";

// Invite-code (team code) management moved to the users section, 2026-07-13 — member lifecycle
// (invite → manage → deactivate → delete) now lives in one place. Kept as a redirect so old links
// and bookmarks don't 404.
export default function AdminInviteCodesRedirectPage() {
  redirect("/admin/users/invites");
}
