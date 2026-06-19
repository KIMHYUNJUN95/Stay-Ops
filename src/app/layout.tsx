import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Noto_Sans_JP,
  Noto_Sans_KR,
  Noto_Serif,
} from "next/font/google";
import { SessionProvider } from "@/components/providers/session-provider";
import { getCurrentAppSession } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// CJK body fonts — match the design handoff's Korean/Japanese weight (incl. 900/black).
// Geist has no CJK glyphs, so Hangul/Kana previously fell back to a system font with
// no true black weight. preload:false keeps these large fonts off the critical path.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  weight: ["400", "500", "700", "800", "900"],
  preload: false,
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-jp",
  weight: ["400", "500", "700", "800", "900"],
  preload: false,
});

// Wordmark font — serif italic used for the "Stay Ops" brand mark across all shells.
const notoSerif = Noto_Serif({
  variable: "--font-wordmark",
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["italic", "normal"],
});

export const metadata: Metadata = {
  title: "StayOps",
  description: "Hotel operations app for field staff and office teams.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StayOps",
  },
};

// viewportFit: "cover" makes the app go edge-to-edge so safe-area-inset-* env()
// values are non-zero on notched devices (the mobile shell pads the top notch and
// bottom home-indicator with them). themeColor tints the browser top chrome /
// address bar the warm ivory so it blends with the app instead of a grey band.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f4ee",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentAppSession();

  return (
    <html
      lang={session?.user.preferredLanguage ?? "ko"}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansKr.variable} ${notoSansJp.variable} ${notoSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <SessionProvider initialSession={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
