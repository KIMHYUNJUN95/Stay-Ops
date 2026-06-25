import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

export type AttendanceSiteDisplayRow = {
  name: string;
  properties?: {
    display_name_ko: string | null;
    display_name_ja: string | null;
    display_name_en: string | null;
  } | null;
};

export function resolveAttendanceLocale(locale: string): Locale {
  if (isLocale(locale)) return locale;
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("en")) return "en";
  return "ko";
}

function localizeKnownSiteName(name: string, locale: Locale): string {
  const key = name.replace(/\s+/g, "").toLowerCase();
  const copy = getDictionary(locale).attendance;
  if (key === "사무실" || key === "office" || key === "事務所") {
    return copy.siteOffice;
  }
  if (
    key === "레거시테스트현장" ||
    key === "legacytestsite" ||
    key === "レガシーテスト拠点"
  ) {
    return copy.siteLegacyTest;
  }
  return name;
}

export function localizeAttendanceSiteName(
  site: AttendanceSiteDisplayRow,
  locale: string,
): string {
  const resolvedLocale = resolveAttendanceLocale(locale);
  const property = site.properties;
  if (property) {
    if (resolvedLocale === "ja" && property.display_name_ja) return property.display_name_ja;
    if (resolvedLocale === "en" && property.display_name_en) return property.display_name_en;
    if (property.display_name_ko) return property.display_name_ko;
  }
  return localizeKnownSiteName(site.name, resolvedLocale);
}
