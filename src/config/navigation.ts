import {
  Bell,
  BellRing,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  Gauge,
  House,
  Megaphone,
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

export const mobileBottomNavigation = [
  {
    id: "home",
    label: localizedNavigationLabels.mobile.home,
    href: "/mobile",
    icon: House,
  },
  {
    id: "calendar",
    label: localizedNavigationLabels.mobile.calendar,
    href: "/mobile/calendar",
    icon: CalendarCheck2,
  },
  {
    id: "cleaning",
    label: localizedNavigationLabels.mobile.cleaning,
    href: "/mobile/cleaning",
    icon: Sparkles,
  },
  {
    id: "requests",
    label: localizedNavigationLabels.mobile.requests,
    href: "/mobile/requests",
    icon: ClipboardCheck,
  },
  {
    id: "announcements",
    label: localizedNavigationLabels.mobile.announcements,
    href: "/mobile/announcements",
    icon: BellRing,
  },
] as const satisfies readonly NavigationItem[];

export const mobileSidebarNavigation = [
  ...mobileBottomNavigation,
  {
    id: "notifications",
    label: localizedNavigationLabels.utility.notifications,
    href: "/mobile/notifications",
    icon: Bell,
  },
  {
    id: "directory",
    label: localizedNavigationLabels.mobile.directory,
    href: "/mobile/directory",
    icon: Users,
  },
] as const satisfies readonly NavigationItem[];

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
