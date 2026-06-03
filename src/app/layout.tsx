import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentAppSession();
  const sessionTheme = session?.user.themePreference ?? "system";

  return (
    <html
      data-theme={sessionTheme}
      lang={session?.user.preferredLanguage ?? "ko"}
      className={`${geistSans.variable} ${geistMono.variable} ${sessionTheme === "dark" ? "dark" : ""} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <SessionProvider initialSession={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
