import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LinenLedgerPeriod } from "@/components/linen-return/linen-ledger-period";
import { LinenLedgerView } from "@/components/linen-return/linen-ledger-view";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary, type Locale } from "@/lib/i18n";
import {
  getCurrentTokyoYearMonth,
  getLinenLedgerRecords,
  getLinenLedgerRecordsByRange,
  isKnownBuilding,
  isValidIsoDate,
  type LinenReturnRecord,
  type TokyoYearMonth,
} from "@/lib/linen-returns";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{
    building?: string;
    year?: string;
    month?: string;
    startDate?: string;
    endDate?: string;
  }>;
};

function monthLabel(period: TokyoYearMonth, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date(Date.UTC(period.year, period.month - 1, 15)));
}

function rangeLabel(start: string, end: string, locale: Locale): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(
      new Date(y, m - 1, d),
    );
  };
  return start === end ? fmt(start) : `${fmt(start)} ~ ${fmt(end)}`;
}

export default async function LinenReturnLedgerPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  const building = (params.building ?? "").trim();

  if (state.status === "unauthenticated") {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/mobile/linen-return/ledger?building=${encodeURIComponent(building)}`)}`,
    );
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }
  if (!building || !(await isKnownBuilding(session, building))) {
    redirect("/mobile/linen-return");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.linenReturn;
  const buildingLabel = localizePropertyName(building, dict.cleaning.buildingLabels);

  const current = getCurrentTokyoYearMonth();
  const startDate = (params.startDate ?? "").trim();
  const endDate = (params.endDate ?? "").trim();
  const rangeMode = isValidIsoDate(startDate) && isValidIsoDate(endDate);

  let records: LinenReturnRecord[];
  let periodLabel: string;
  let baseMonth: TokyoYearMonth;
  let rangeValue: { startDate?: string; endDate?: string };

  if (rangeMode) {
    const [s, e] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    records = await getLinenLedgerRecordsByRange(session, building, s, e);
    periodLabel = rangeLabel(s, e, locale);
    baseMonth = { year: Number(s.slice(0, 4)), month: Number(s.slice(5, 7)) };
    rangeValue = { startDate: s, endDate: e };
  } else {
    const year = Number(params.year);
    const month = Number(params.month);
    const period: TokyoYearMonth =
      Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12
        ? { year, month }
        : current;
    records = await getLinenLedgerRecords(session, building, period);
    periodLabel = monthLabel(period, locale);
    baseMonth = period;
    rangeValue = {};
  }

  const navBadges = await getMobileNavBadges();
  // Do not allow paging into the future beyond the current Tokyo month.
  const canGoNext =
    baseMonth.year < current.year ||
    (baseMonth.year === current.year && baseMonth.month < current.month);
  const buildingParam = encodeURIComponent(building);

  return (
    <MobileShell activeItem="linen-return" badges={navBadges} title={copy.ledgerTitle}>
      <div className="pb-6">
        <div className="mb-3.5 flex items-end justify-between px-0.5 pt-1">
          <div className="flex items-center gap-2.5">
            <Link
              aria-label={copy.backToList}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700"
              href={`/mobile/linen-return/list?building=${buildingParam}`}
            >
              <ChevronLeft className="size-[19px]" aria-hidden="true" />
            </Link>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                {buildingLabel}
              </p>
              <h1 className="text-[26px] font-black tracking-[-0.03em] text-foreground">
                {copy.ledgerTitle}
              </h1>
            </div>
          </div>

          <LinenLedgerPeriod
            building={building}
            canGoNext={canGoNext}
            copy={copy}
            label={periodLabel}
            locale={locale}
            month={baseMonth.month}
            range={rangeValue}
            year={baseMonth.year}
          />
        </div>

        <LinenLedgerView
          building={building}
          copy={copy}
          currentUserId={session.user.id}
          locale={locale}
          records={records}
        />
      </div>
    </MobileShell>
  );
}
