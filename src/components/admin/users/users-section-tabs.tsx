import Link from "next/link";
import "@/components/admin/users-console.css";

/**
 * Pill switcher shared by /admin/users and /admin/users/invites — the two members-lifecycle
 * screens now live under one section (invite-code management moved out of settings, 2026-07-13).
 */
export function UsersSectionTabs({
  active,
  labels,
}: {
  active: "members" | "invites";
  labels: { members: string; invites: string };
}) {
  return (
    <nav className="sectiontabs" aria-label={labels.members}>
      <Link
        href="/admin/users"
        className={`sectiontab${active === "members" ? " active" : ""}`}
      >
        {labels.members}
      </Link>
      <Link
        href="/admin/users/invites"
        className={`sectiontab${active === "invites" ? " active" : ""}`}
      >
        {labels.invites}
      </Link>
    </nav>
  );
}
