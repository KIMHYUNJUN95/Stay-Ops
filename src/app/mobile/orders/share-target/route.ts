import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sanitizeSharedUrl } from "@/lib/share-target";

/**
 * Web Share Target receiver.
 * The browser POSTs here when the user picks StayOps from the native share sheet.
 * We validate the URL, then issue a 303 redirect to the order-creation page so the
 * browser follows it with a GET (POST→GET pattern for share targets).
 */
export async function POST(request: NextRequest) {
  let rawUrl: string | null = null;

  try {
    const body = await request.formData();
    // Web Share Target spec: prefer the `url` field; fall back to `text` since
    // some apps (e.g. Amazon mobile) put the product URL into the text field.
    rawUrl =
      body.get("url")?.toString() ??
      body.get("text")?.toString() ??
      null;
  } catch {
    // Malformed body — redirect without injecting a URL.
  }

  const safeUrl = sanitizeSharedUrl(rawUrl);
  const destination = new URL("/mobile/orders/new", request.url);
  if (safeUrl) {
    destination.searchParams.set("sharedUrl", safeUrl);
  } else if (rawUrl) {
    // A URL was present but failed validation — signal the form to show an error banner.
    destination.searchParams.set("shareError", "1");
  }

  // 303 See Other: browser re-issues the redirect as GET, which renders the form page.
  return NextResponse.redirect(destination, 303);
}
