import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import type { AppSession } from "@/lib/session";

// Shared header/footer metadata for every admin-console Excel/PDF export.
//
// Locale rule (do not break it): the export locale is ALWAYS resolved server-side from the actor's
// own `session.user.preferredLanguage`. Client components never pass a locale to an export action —
// otherwise a file could come out in a language the signed-in user never chose.

export type AdminExportMeta = {
  locale: Locale;
  localeTag: string;
  orgName: string;
  /** e.g. "생성일시 · 2026-07-14 09:31" */
  generatedLabel: string;
  /** Canonical shared labels (export buttons, No./합계 column headers, print button). */
  shared: Dictionary["admin"]["shared"];
};

export function adminLocaleTag(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
}

/** "2026-07-01" → "20260701", for export filenames. */
export function compactRangePart(value: string): string {
  return value.replace(/-/g, "");
}

export function buildAdminExportMeta(session: AppSession): AdminExportMeta {
  const locale = session.user.preferredLanguage;
  const localeTag = adminLocaleTag(locale);
  const dictionary = getDictionary(locale);
  const shared = dictionary.admin.shared;

  const generatedAt = new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  return {
    locale,
    localeTag,
    orgName: session.organization.name ?? "",
    generatedLabel: `${shared.exportGeneratedLabel} · ${generatedAt}`,
    shared,
  };
}
