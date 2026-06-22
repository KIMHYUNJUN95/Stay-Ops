import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { LinenReturnDetailActions } from "@/components/linen-return/linen-return-detail-actions";
import { LightboxThumbs } from "@/components/shell/lightbox-thumbs";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary, type Locale } from "@/lib/i18n";
import { canManageLinenRecord, getLinenReturnRecordById } from "@/lib/linen-returns";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ building?: string; error?: string }>;
};

function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

export default async function LinenReturnDetailPage({ params, searchParams }: PageProps) {
  const [state, session, { id }, query] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(`/mobile/linen-return/record/${id}`)}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const record = await getLinenReturnRecordById(session, id);
  if (!record) {
    redirect("/mobile/linen-return");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.linenReturn;
  const buildingLabel = localizePropertyName(record.buildingName, dict.cleaning.buildingLabels);
  const canManage = canManageLinenRecord(session, record);
  const errorMessage = query.error ? copy.errors[query.error] ?? null : null;

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="linen-return" badges={navBadges} title={copy.detailTitle}>
      <div className="pb-6">
        {/* Context bar */}
        <div className="flex items-center gap-[11px] px-0.5 pb-4 pt-2">
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-black leading-tight tracking-[-0.03em] text-foreground">
              {copy.detailTitle}
            </p>
          </div>
          {canManage ? (
            <LinenReturnDetailActions
              building={record.buildingName}
              copy={copy}
              recordId={record.id}
            />
          ) : null}
        </div>

        {errorMessage ? (
          <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-600">
            {errorMessage}
          </p>
        ) : null}

        {/* Header card */}
        <div className="mb-4 rounded-[22px] border border-border bg-[linear-gradient(155deg,#fff,#fbfcfd)] p-5 shadow-[0_18px_70px_hsl(214_37%_12%/0.10)]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[12.5px] font-bold text-primary">
            <Building2 className="size-[15px]" aria-hidden="true" />
            {buildingLabel}
          </span>
          <div className="mt-3.5 mb-4 text-[23px] font-black tracking-[-0.03em] text-foreground">
            {formatDateTime(record.registeredAt, locale)}
          </div>
          <div className="flex items-center gap-[11px]">
            <span className="flex size-[38px] items-center justify-center rounded-xl bg-primary/10 text-[15px] font-extrabold text-primary">
              {record.registrantName.slice(0, 1)}
            </span>
            <span className="flex flex-col">
              <b className="text-sm font-extrabold text-foreground">{record.registrantName}</b>
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                {copy.registrantRole}
              </span>
            </span>
          </div>
        </div>

        {/* Ledger table */}
        <div className="mb-4 overflow-hidden rounded-[18px] border border-border">
          <div className="flex justify-between bg-slate-50 px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            <span>{copy.ledgerHeaderItem}</span>
            <span>{copy.ledgerHeaderQty}</span>
          </div>
          {record.lines.map((line) => (
            <div
              className="flex items-center justify-between border-t border-slate-100 px-4 py-3.5 text-[14.5px] font-semibold text-foreground"
              key={line.itemId}
            >
              <span>{line.name}</span>
              <span className="font-mono font-bold">
                {line.quantity}
                <i className="ml-0.5 font-sans text-[11px] not-italic text-muted-foreground">
                  {copy.quantityUnit}
                </i>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-primary/20 bg-primary/10 px-4 py-[15px] text-sm font-extrabold text-primary">
            <span>{copy.totalQuantity}</span>
            <span className="font-mono text-[22px] font-bold tracking-[-0.02em]">
              {record.totalQuantity}
              <i className="ml-0.5 font-sans text-[11px] not-italic text-muted-foreground">
                {copy.quantityUnit}
              </i>
            </span>
          </div>
        </div>

        {/* Photos */}
        {record.imageUrls.length > 0 ? (
          <div className="mb-4">
            <div className="mb-2.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {copy.photoSectionTitle}
            </div>
            <LightboxThumbs
              sizes="72px"
              thumbClassName="relative size-[72px] overflow-hidden rounded-[14px] border border-border bg-slate-50"
              urls={record.imageUrls}
              wrapClassName="flex flex-wrap gap-2.5"
            />
          </div>
        ) : null}

        {/* Note */}
        {record.note ? (
          <div className="rounded-[14px] bg-slate-50 px-[15px] py-[13px]">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-400">
              {copy.memoTitle}
            </span>
            <p className="mt-1.5 text-[13.5px] leading-[1.55] text-slate-600">{record.note}</p>
          </div>
        ) : null}
      </div>
    </MobileShell>
  );
}
