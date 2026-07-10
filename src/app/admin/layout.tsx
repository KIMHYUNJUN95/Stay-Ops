import type { Metadata } from "next";

// The admin console is an installable PWA in its own right, kept fully separate from the
// mobile app. Next.js metadata merges by segment, so overriding `manifest` here makes every
// /admin/* route advertise the desktop-oriented manifest (standalone window, unlocked
// orientation, /admin scope + start_url) instead of the root mobile manifest. Installing while
// on an /admin page therefore registers a distinct "StayOps Admin" app (id "/admin"), separate
// from the mobile "StayOps" app (id "/"). The shared service worker (scope "/") still serves
// both. See docs/product/05-admin-web-ia.md → "Installable Admin PWA".
export const metadata: Metadata = {
  manifest: "/manifest-admin.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StayOps Admin",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
