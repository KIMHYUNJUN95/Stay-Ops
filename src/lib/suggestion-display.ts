import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";

const CATEGORY_KEYS: Record<string, "guestExperience" | "manual" | "operations" | "supplies"> = {
  "게스트경험": "guestExperience",
  "guestexperience": "guestExperience",
  "ゲスト体験": "guestExperience",
  "매뉴얼": "manual",
  "manual": "manual",
  "マニュアル": "manual",
  "운영개선": "operations",
  "operations": "operations",
  "operationsimprovement": "operations",
  "運営改善": "operations",
  "비품/발주": "supplies",
  "비품발주": "supplies",
  "supplies": "supplies",
  "supplies/orders": "supplies",
  "備品/発注": "supplies",
  "備品発注": "supplies",
};

function resolveSuggestionLocale(locale: string): Locale {
  if (isLocale(locale)) return locale;
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("en")) return "en";
  return "ko";
}

function categoryKey(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function localizeSuggestionCategory(category: string | null, locale: string): string | null {
  if (!category) return null;
  const labelKey = CATEGORY_KEYS[categoryKey(category)];
  if (!labelKey) return category;
  return getDictionary(resolveSuggestionLocale(locale)).mobile.suggestions.categoryLabels[labelKey];
}

export function localizeSuggestionPropertyName(
  propertyName: string | null,
  locale: string,
): string | null {
  if (!propertyName) return null;
  const dictionary = getDictionary(resolveSuggestionLocale(locale));
  const canonical = getCanonicalPropertyName(propertyName);
  return localizePropertyName(canonical, dictionary.cleaning.buildingLabels);
}
