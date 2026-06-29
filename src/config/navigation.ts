import {
  BedDouble,
  Bell,
  BellRing,
  Building2,
  ListChecks,
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Gauge,
  House,
  Inbox,
  Bug,
  Megaphone,
  MessageSquareWarning,
  Newspaper,
  Package,
  Recycle,
  Settings,
  Sparkles,
  SprayCan,
  Users,
  Wrench,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { Role } from "@/config/roles";
import {
  getLocalizedText,
  localizedNavigationLabels,
  type Locale,
  type LocalizedText,
} from "@/lib/i18n";

export type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavigationItem = {
  id: string;
  label: LocalizedText;
  href: string;
  icon: NavigationIcon;
  allowedRoles?: readonly Role[];
};

const mobileNavHome = {
  id: "home",
  label: localizedNavigationLabels.mobile.home,
  href: "/mobile",
  icon: House,
} as const satisfies NavigationItem;

const mobileNavCalendar = {
  id: "calendar",
  label: localizedNavigationLabels.mobile.calendar,
  href: "/mobile/calendar",
  icon: CalendarCheck2,
} as const satisfies NavigationItem;

const mobileNavCleaning = {
  id: "cleaning",
  label: localizedNavigationLabels.mobile.cleaning,
  href: "/mobile/cleaning",
  icon: Sparkles,
} as const satisfies NavigationItem;

const mobileNavRequests = {
  id: "requests",
  label: localizedNavigationLabels.mobile.requests,
  href: "/mobile/requests",
  icon: ClipboardCheck,
} as const satisfies NavigationItem;

const mobileNavAnnouncements = {
  id: "announcements",
  label: localizedNavigationLabels.mobile.announcements,
  href: "/mobile/announcements",
  icon: BellRing,
} as const satisfies NavigationItem;

// Linen Return lives in the side menu (and the pinnable bottom-bar pool), not as a
// default bottom tab. See docs/product/19-linen-defect-workflow.md.
const mobileNavLinenReturn = {
  id: "linen-return",
  label: localizedNavigationLabels.mobile.linenReturn,
  href: "/mobile/linen-return",
  icon: BedDouble,
} as const satisfies NavigationItem;

// Todo / Shared Task — side-menu entry + pinnable bottom-bar candidate.
// See docs/product/18-todo-task-workflow.md.
const mobileNavTasks = {
  id: "tasks",
  label: localizedNavigationLabels.mobile.tasks,
  href: "/mobile/tasks",
  icon: ListChecks,
} as const satisfies NavigationItem;

// Staff Suggestions / Feedback Box — side-menu entry + pinnable bottom-bar candidate.
// See docs/product/22-staff-suggestions-workflow.md.
const mobileNavSuggestions = {
  id: "suggestions",
  label: localizedNavigationLabels.mobile.suggestions,
  href: "/mobile/suggestions",
  icon: Inbox,
} as const satisfies NavigationItem;

// Board / 게시판 — free bulletin board for all staff. See docs/product/23-board-workflow.md.
const mobileNavBoard = {
  id: "board",
  label: localizedNavigationLabels.mobile.board,
  href: "/mobile/board",
  icon: Newspaper,
} as const satisfies NavigationItem;

// Bug Report — internal product/system issue reporting. Intentionally NOT in the side-menu nav
// list (nor the pinnable bottom-bar pool): it is a utility surfaced in the sidebar footer next to
// Logout. See docs/product/25-bug-report-workflow.md + docs/product/16-mobile-navigation.md.
export const mobileNavBugs = {
  id: "bugs",
  label: localizedNavigationLabels.mobile.bugs,
  href: "/mobile/bugs",
  icon: Bug,
} as const satisfies NavigationItem;

// Attendance / 근태 (clock-in/out, live timer, capture) — side-menu entry + pinnable bottom-bar
// candidate. UI/UX-first (design only); backend deferred. See docs/product/24-attendance-workflow.md.
const mobileNavAttendance = {
  id: "attendance",
  label: localizedNavigationLabels.mobile.attendance,
  href: "/mobile/attendance",
  icon: Clock,
} as const satisfies NavigationItem;

// Complaints / 컴플레인 — guest complaint logging per booking platform. Side-menu entry + pinnable
// bottom-bar candidate. Design-only for now; backend deferred. See docs/product/26-complaint-workflow.md.
const mobileNavComplaints = {
  id: "complaints",
  label: localizedNavigationLabels.mobile.complaints,
  href: "/mobile/complaints",
  icon: MessageSquareWarning,
} as const satisfies NavigationItem;

// Bottom tab bar uses a center action ("추가") button, so it holds only 4 tabs.
// "Cleaning" intentionally lives in the side menu (hamburger) instead of the bottom bar.
export const mobileBottomNavigation = [
  mobileNavHome,
  mobileNavCalendar,
  mobileNavRequests,
  mobileNavAnnouncements,
] as const satisfies readonly NavigationItem[];

// Operational ordering: 진입점 → 일일 코어(예약·청소·할일·요청·근태) → 커뮤니케이션(공지·게시판·제안함)
// → 참조(린넨 반품·직원 목록). Bug Report is intentionally excluded (sidebar footer, next to Logout).
export const mobileSidebarNavigation = [
  mobileNavHome,
  mobileNavCalendar,
  mobileNavCleaning,
  mobileNavTasks,
  mobileNavRequests,
  mobileNavAttendance,
  mobileNavAnnouncements,
  mobileNavBoard,
  mobileNavSuggestions,
  mobileNavComplaints,
  mobileNavLinenReturn,
  {
    id: "directory",
    label: localizedNavigationLabels.mobile.directory,
    href: "/mobile/directory",
    icon: Users,
  },
] as const satisfies readonly NavigationItem[];

// ── Per-user bottom-bar customization ────────────────────────────────────────
// The center FAB opens an editor where each user picks which features sit in
// their mobile bottom tab bar. The selectable pool is the mobile side menu, and
// the chosen ids are persisted per user (profiles.bottom_nav_tabs).

/** Maximum number of user-pinned bottom tabs (the center FAB is always shown). */
export const MAX_BOTTOM_NAV_TABS = 4;

/** Default bottom-bar tab ids for a new/unset user. */
export const defaultBottomNavTabIds = [
  "home",
  "calendar",
  "requests",
  "announcements",
] as const satisfies readonly string[];

/** Features a user may pin to the bottom bar (same pool as the side menu). */
export const customizableBottomNavItems = mobileSidebarNavigation;

/** Resolve stored bottom-nav ids into ordered navigation items (max enforced). */
export function resolveBottomNavItems(
  ids: readonly string[] | null | undefined,
): NavigationItem[] {
  const byId = new Map<string, NavigationItem>(
    customizableBottomNavItems.map((item) => [item.id, item]),
  );
  const source = ids && ids.length > 0 ? ids : defaultBottomNavTabIds;
  const seen = new Set<string>();
  const resolved: NavigationItem[] = [];

  for (const id of source) {
    if (seen.has(id)) continue;
    const item = byId.get(id);
    if (!item) continue;
    seen.add(id);
    resolved.push(item);
    if (resolved.length >= MAX_BOTTOM_NAV_TABS) break;
  }

  // Never render an empty bottom bar — fall back to defaults if nothing resolved.
  if (resolved.length === 0) {
    for (const id of defaultBottomNavTabIds) {
      const item = byId.get(id);
      if (item) resolved.push(item);
    }
  }

  return resolved;
}

/** Sanitize an arbitrary id list before persisting (valid, unique, capped). */
export function sanitizeBottomNavTabIds(ids: readonly string[]): string[] {
  const valid = new Set<string>(customizableBottomNavItems.map((item) => item.id));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of ids) {
    if (!valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_BOTTOM_NAV_TABS) break;
  }

  return out.length > 0 ? out : [...defaultBottomNavTabIds];
}

export const adminNavigation = [
  {
    id: "dashboard",
    label: localizedNavigationLabels.admin.dashboard,
    href: "/admin",
    icon: Gauge,
  },
  {
    id: "calendar",
    label: localizedNavigationLabels.admin.calendar,
    href: "/admin/calendar",
    icon: CalendarDays,
  },
  {
    id: "check-in-out",
    label: localizedNavigationLabels.admin.checkInOut,
    href: "/admin/check-in-out",
    icon: ClipboardCheck,
  },
  {
    id: "cleaning",
    label: localizedNavigationLabels.admin.cleaning,
    href: "/admin/cleaning",
    icon: SprayCan,
  },
  {
    id: "maintenance",
    label: localizedNavigationLabels.admin.maintenance,
    href: "/admin/maintenance",
    icon: Wrench,
  },
  {
    id: "lost-found",
    label: localizedNavigationLabels.admin.lostFound,
    href: "/admin/lost-found",
    icon: Recycle,
  },
  {
    id: "orders",
    label: localizedNavigationLabels.admin.orders,
    href: "/admin/orders",
    icon: Package,
  },
  {
    id: "announcements",
    label: localizedNavigationLabels.admin.announcements,
    href: "/admin/announcements",
    icon: Megaphone,
  },
  {
    id: "recurring-work",
    label: localizedNavigationLabels.admin.recurringWork,
    href: "/admin/recurring-work",
    icon: Building2,
  },
  {
    id: "users",
    label: localizedNavigationLabels.admin.users,
    href: "/admin/users",
    icon: Users,
  },
  {
    id: "settings",
    label: localizedNavigationLabels.admin.settings,
    href: "/admin/settings",
    icon: Settings,
  },
] as const satisfies readonly NavigationItem[];

export const utilityNavigation = [
  {
    id: "notifications",
    label: localizedNavigationLabels.utility.notifications,
    href: "/mobile/notifications",
    icon: Bell,
  },
] as const satisfies readonly NavigationItem[];

export function getNavigationLabel(item: NavigationItem, locale: Locale) {
  const label = getLocalizedText(item.label, locale);
  if (label) {
    return label;
  }
  console.warn(`[navigation] missing localized label for "${item.id}"`);
  return item.id;
}
