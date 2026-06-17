import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Image as ImageIcon, Inbox, Plus, ScrollText } from "lucide-react";
import { LinenReturnSuccess } from "@/components/linen-return/linen-return-success";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  getLinenReturnsByBuilding,
  isKnownBuilding,
  type LinenReturnRecord,
} from "@/lib/linen-returns";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{ building?: string; created?: string }>;
};

function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

function itemSummary(record: LinenReturnRecord, copy: { summaryMore: string; kindsUnit: string }): string {
  if (record.lines.length === 0) return "—";
  const first = record.lines[0].name;
  if (record.lines.length === 1) return first;
  return `${first} ${copy.summaryMore} ${record.lines.length - 1}${copy.kindsUnit}`;
}

export default async function LinenReturnListPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  const building = (params.building ?? "").trim();
  const createdId = (params.created ?? "").trim();

  if (state.status === "unauthenticated") {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/mobile/linen-return/list?building=${encodeURIComponent(building)}`)}`,
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

  const [records, navBadges] = await Promise.all([
    getLinenReturnsByBuilding(session, building),
    getMobileNavBadges(),
  ]);

  const buildingParam = encodeURIComponent(building);

  return (
    <MobileShell activeItem="linen-return" badges={navBadges} title={buildingLabel}>
      <div className="relative min-h-[60vh] pb-24">
        {/* Context bar */}
        <div className="flex items-center gap-[11px] px-0.5 pb-4 pt-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[19px] font-black leading-tight tracking-[-0.03em] text-foreground">
              {buildingLabel}
            </p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-muted-foreground">
              {`${copy.thisMonth} ${records.length}${copy.countUnit} · ${copy.latestOrder}`}
            </p>
          </div>
          <Link
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-[7px] text-xs font-bold text-primary"
            href={`/mobile/linen-return/ledger?building=${buildingParam}`}
          >
            <ScrollText className="size-[15px]" aria-hidden="true" />
            {copy.ledgerButton}
          </Link>
        </div>

        {records.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-4 flex size-[60px] items-center justify-center rounded-[18px] bg-slate-50 text-slate-400">
              <Inbox className="size-7" aria-hidden="true" />
            </span>
            <p className="text-[15px] font-extrabold text-foreground">{copy.listEmptyTitle}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{copy.listEmptySub}</p>
            <Link
              className="mt-[18px] inline-flex h-[50px] items-center justify-center gap-1.5 rounded-2xl bg-primary px-5 text-[15px] font-extrabold text-primary-foreground"
              href={`/mobile/linen-return/new?building=${buildingParam}`}
            >
              <Plus className="size-5" aria-hidden="true" />
              {copy.registerButton}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {records.map((record) => (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-[20px] border bg-surface px-3.5 py-[15px] shadow-[0_1px_2px_rgba(20,32,43,0.03)] transition-all active:scale-[0.99] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.4)]",
                  record.id === createdId
                    ? "border-primary/40 ring-2 ring-primary/15"
                    : "border-border",
                )}
                href={`/mobile/linen-return/record/${record.id}?building=${buildingParam}`}
                key={record.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold tracking-[-0.01em] text-foreground">
                    {formatDateTime(record.registeredAt, locale)}
                  </div>
                  <div className="mt-1 text-[12.5px] font-semibold text-slate-600">
                    {itemSummary(record, copy)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
                      <span className="flex size-[18px] items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">
                        {record.registrantName.slice(0, 1)}
                      </span>
                      {record.registrantName}
                    </span>
                    {record.imageUrls.length > 0 ? (
                      <>
                        <span className="size-[3px] rounded-full bg-border" />
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <ImageIcon className="size-[14px]" aria-hidden="true" />
                          {copy.photoLabel}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-baseline gap-0.5 font-mono text-foreground">
                    <b className="text-[19px] font-bold tracking-[-0.02em]">{record.totalQuantity}</b>
                    <span className="font-sans text-[11px] font-semibold text-muted-foreground">
                      {copy.quantityUnit}
                    </span>
                  </span>
                  <ChevronRight className="size-[18px] text-slate-400" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {records.length > 0 ? (
          <Link
            className="fixed bottom-24 right-4 z-30 inline-flex h-[50px] items-center gap-1.5 rounded-full bg-primary pl-[17px] pr-5 text-[14.5px] font-extrabold text-primary-foreground shadow-[0_16px_30px_-10px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-95"
            href={`/mobile/linen-return/new?building=${buildingParam}`}
          >
            <Plus className="size-5" aria-hidden="true" />
            {copy.registerButton}
          </Link>
        ) : null}

        <LinenReturnSuccess building={building} copy={copy} show={Boolean(createdId)} />
      </div>
    </MobileShell>
  );
}
