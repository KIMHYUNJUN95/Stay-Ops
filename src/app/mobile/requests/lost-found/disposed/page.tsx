import { redirect } from "next/navigation";
import {
  DisposedLostFoundList,
  type DisposedItemVM,
} from "@/components/requests/disposed-lost-found-list";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getDictionary } from "@/lib/i18n";
import { getDisposedLostItems } from "@/lib/lost-found";
import { getOnboardingState } from "@/lib/onboarding";
import { resolveRequestLocation } from "@/lib/request-location";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

// Tokyo 운영일 기준 YYYY-MM-DD (서버/러너 타임존과 무관하게 일 경계 고정).
function tokyoDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayDiff(todayKey: string, key: string): number {
  const [ay, am, ad] = todayKey.split("-").map(Number);
  const [by, bm, bd] = key.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

export default async function DisposedLostFoundPage() {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/requests/lost-found/disposed");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.lostFound.disposed;

  const [items, roomCatalog, navBadges] = await Promise.all([
    getDisposedLostItems(session),
    getActiveRoomCatalogServer(session.organization.id).catch(() => undefined),
    getMobileNavBadges(),
  ]);

  const todayKey = tokyoDateKey(new Date().toISOString());
  const currentMonthKey = todayKey.slice(0, 7);
  const [cy, cm] = currentMonthKey.split("-").map(Number);
  const lm = new Date(Date.UTC(cy, cm - 1, 1));
  lm.setUTCMonth(lm.getUTCMonth() - 1);
  const lastMonthKey = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, "0")}`;

  const vms: DisposedItemVM[] = items.map((item) => {
    const location = resolveRequestLocation(
      item.room_label,
      roomCatalog,
      dictionary.cleaning.buildingLabels,
      item.property_name,
    );
    const disposedAtIso = item.handled_at ?? item.updated_at;
    const disposedDateKey = disposedAtIso ? tokyoDateKey(disposedAtIso) : null;
    const monthKey = disposedDateKey ? disposedDateKey.slice(0, 7) : currentMonthKey;
    const relativeGroup =
      monthKey === currentMonthKey ? "thisMonth" : monthKey === lastMonthKey ? "lastMonth" : null;
    return {
      id: item.id,
      itemName: item.item_name,
      buildingLabel: location.buildingLabel ?? "-",
      roomLabel: location.roomLabel,
      thumbnailUrl: item.image_urls?.[0] ?? null,
      disposedAtIso,
      disposedDateKey,
      isAuto: !item.handled_by, // 자동 폐기 배치는 handled_by 를 비운다
      handledByName: item.handled_by_name,
      reporterName: item.reporter_name || "-",
      handlingMemo: item.handling_memo,
      monthKey,
      relativeGroup,
    };
  });

  const monthCount = vms.filter((v) => v.monthKey === currentMonthKey).length;
  const weekCount = vms.filter(
    (v) => v.disposedDateKey && dayDiff(todayKey, v.disposedDateKey) >= 0 && dayDiff(todayKey, v.disposedDateKey) <= 6,
  ).length;

  const buildingOptions = Array.from(new Set(vms.map((v) => v.buildingLabel).filter((b) => b && b !== "-")))
    .sort((a, b) => a.localeCompare(b, locale));

  return (
    <MobileShell activeItem="requests" badges={navBadges} title={copy.title}>
      <DisposedLostFoundList
        buildingOptions={buildingOptions}
        copy={copy}
        items={vms}
        locale={locale}
        stats={{ total: vms.length, month: monthCount, week: weekCount }}
        todayKey={todayKey}
      />
    </MobileShell>
  );
}
