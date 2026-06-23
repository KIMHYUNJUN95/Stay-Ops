import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Globe2, Ticket } from "lucide-react";
import type { InviteCodeFieldCopy } from "@/app/onboarding/invite-code-field";
import { JoinForm } from "@/app/onboarding/onboarding-forms";
import { OnboardingWizard } from "@/app/onboarding/onboarding-wizard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { getDeviceSurfaceFromHeaders } from "@/lib/mobile-device";
import { getOnboardingState } from "@/lib/onboarding";
import { normalizeNextPathForSurface, normalizePathForSurface } from "@/lib/surface-routing";

const LOCALE_COOKIE = "stayops_locale";

type OnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
    lang?: string;
    next?: string;
    rejoin?: string;
  }>;
};

const glassCardClass =
  "rounded-[18px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.84),rgba(255,255,255,0.68))] text-slate-950 shadow-[0_26px_80px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.78)_inset,0_-1px_0_rgba(15,23,42,0.04)_inset] ring-1 ring-white/55 backdrop-blur-[32px]";

const iconClass =
  "flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_1px_0_rgba(255,255,255,0.62)_inset] backdrop-blur-xl";

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const [state, params, cookieStore, headerStore] = await Promise.all([
    getOnboardingState(),
    searchParams,
    cookies(),
    headers(),
  ]);
  const surface = getDeviceSurfaceFromHeaders(headerStore);

  // ?lang= takes priority; the pre-auth locale cookie set during language
  // selection is the fallback so the choice survives the redirect chain
  // (login → callback → onboarding) even when no ?lang= param is carried.
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value ?? "";
  const requestedLocale = params.lang ?? cookieLocale;
  const queryLocale: Locale = isLocale(requestedLocale) ? requestedLocale : "ko";
  const safeNext = normalizeNextPathForSurface(params.next, surface);
  const allowRejoin = state.status === "removed" && params.rejoin === "1";
  const joinProfile =
    state.status === "needs_membership" || state.status === "removed"
      ? state.profile
      : null;
  const blockedLocale: Locale =
    state.status === "suspended" || state.status === "removed"
      ? state.profile.preferredLanguage
      : queryLocale;

  if (state.status === "ready") {
    // Honour `safeNext` when present (e.g. user was mid-flow when session
    // expired, or was redirected here after Google OAuth). Fall back to the
    // role-appropriate default route.
    redirect(safeNext || normalizePathForSurface(state.redirectTo, surface));
  }

  if (state.status === "unauthenticated") {
    const onboardingNext = `/onboarding?lang=${queryLocale}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`;
    redirect(
      `/auth/login?next=${encodeURIComponent(onboardingNext)}&lang=${queryLocale}`,
    );
  }

  if (
    state.status === "suspended" ||
    (state.status === "removed" && !allowRejoin) ||
    state.status === "disabled"
  ) {
    const blockedParams = new URLSearchParams({
      view: "blocked",
      mode: state.status,
      lang: blockedLocale,
    });
    if (safeNext) blockedParams.set("next", safeNext);
    const blockedEmail =
      state.status === "disabled" ? state.email : state.user.email ?? "";
    if (blockedEmail) blockedParams.set("email", blockedEmail);
    redirect(`/auth/login?${blockedParams.toString()}`);
  }

  const locale: Locale =
    joinProfile && (state.status === "needs_membership" || allowRejoin)
      ? joinProfile.preferredLanguage
      : queryLocale;
  const dictionary = getDictionary(locale);
  const errorMessage = params.error
    ? (dictionary.onboarding.errors[params.error] ?? params.error)
    : null;
  const currentStepTitle =
    state.status === "needs_membership" || allowRejoin
      ? dictionary.onboarding.joinTitle
      : dictionary.onboarding.profileTitle;

  const o = dictionary.onboarding;
  const inviteCopy: InviteCodeFieldCopy = {
    label: o.inviteCodePlaceholder,
    placeholder: o.inviteCodePlaceholder,
    hint: o.inviteCodeHint,
    verifyCta: o.verifyInviteCta,
    verifiedBadge: o.inviteVerifiedBadge,
    orgLabel: o.previewOrgLabel,
    roleLabel: o.previewRoleLabel,
    changeCode: o.changeInviteCode,
    errors: o.errors,
    roleCategories: o.roleCategories,
  };

  // ── needs_profile → multi-step wizard (Profile Setup redesign) ──────────────
  if (state.status === "needs_profile") {
    return (
      <OnboardingWizard
        intro={{
          title: o.intro.title,
          subtitle: o.intro.subtitle,
          itemBasicsTitle: o.intro.itemBasicsTitle,
          itemBasicsSub: o.intro.itemBasicsSub,
          itemLangTitle: o.intro.itemLangTitle,
          itemLangSub: o.intro.itemLangSub,
          itemInviteTitle: o.intro.itemInviteTitle,
          itemInviteSub: o.intro.itemInviteSub,
          startCta: o.intro.startCta,
        }}
        steps={{
          basicsEyebrow: o.steps.basicsEyebrow,
          continueCta: o.steps.continueCta,
          nameTitle: o.steps.nameTitle,
          nameSubtitle: o.steps.nameSubtitle,
          nameLabel: o.steps.nameLabel,
          nameHint: o.steps.nameHint,
          dobTitle: o.steps.dobTitle,
          dobSubtitle: o.steps.dobSubtitle,
          dobYearLabel: o.steps.dobYearLabel,
          dobMonthLabel: o.steps.dobMonthLabel,
          dobDayLabel: o.steps.dobDayLabel,
          dobYearPlaceholder: o.steps.dobYearPlaceholder,
          dobMonthPlaceholder: o.steps.dobMonthPlaceholder,
          dobDayPlaceholder: o.steps.dobDayPlaceholder,
          dobHint: o.steps.dobHint,
          dobSheetTitle: o.steps.dobSheetTitle,
          dobConfirm: o.steps.dobConfirm,
          phoneTitle: o.steps.phoneTitle,
          phoneSubtitle: o.steps.phoneSubtitle,
          phoneNumLabel: o.steps.phoneNumLabel,
          phoneInputPlaceholder: o.steps.phoneInputPlaceholder,
          phoneHint: o.steps.phoneHint,
          phoneCountrySheetTitle: o.steps.phoneCountrySheetTitle,
        }}
        countries={o.countries}
        join={{
          inviteEyebrow: o.joinFlow.inviteEyebrow,
          inviteTitle: o.joinFlow.inviteTitle,
          inviteSubtitle: o.joinFlow.inviteSubtitle,
          caseHint: o.joinFlow.caseHint,
          verifyCta: o.joinFlow.verifyCta,
          checking: o.joinFlow.checking,
          skip: o.joinFlow.skip,
          invalidTitle: o.joinFlow.invalidTitle,
          confirmEyebrow: o.joinFlow.confirmEyebrow,
          confirmTitle: o.joinFlow.confirmTitle,
          confirmSubtitle: o.joinFlow.confirmSubtitle,
          roleLabel: o.joinFlow.roleLabel,
          verified: o.joinFlow.verified,
          joinCta: o.joinFlow.joinCta,
          codePlaceholder: o.inviteCodePlaceholder,
          orgLabel: o.previewOrgLabel,
          errors: o.errors,
          roleCategories: o.roleCategories,
        }}
        review={{
          title: o.review.title,
          subtitle: o.review.subtitle,
          rowName: o.review.rowName,
          rowDob: o.review.rowDob,
          rowPhone: o.review.rowPhone,
          rowLang: o.review.rowLang,
          rowOrg: o.review.rowOrg,
          rowRole: o.review.rowRole,
          edit: o.review.edit,
          infoTitle: o.review.infoTitle,
          infoBody: o.review.infoBody,
          submit: o.review.submit,
        }}
        success={{
          eyebrow: o.success.eyebrow,
          welcomePrefix: o.success.welcomePrefix,
          welcomeSuffix: o.success.welcomeSuffix,
          bodyJoined: o.success.bodyJoined,
          bodyNoTeam: o.success.bodyNoTeam,
          startCta: o.success.startCta,
        }}
        languageName={dictionary.languages[locale]}
        profile={{
          copy: {
            nameLabel: o.fullNamePlaceholder,
            namePlaceholder: o.fullNamePlaceholder,
            birthDateLabel: o.birthDateLabel,
            birthDatePlaceholder: o.birthDatePlaceholder,
            birthDateHint: o.birthDateHint,
            phoneLabel: o.phonePlaceholder,
            phonePlaceholder: o.phonePlaceholder,
            phoneHint: o.phoneHint,
            languageLabel: dictionary.auth.languageSelector,
            languages: dictionary.languages,
            continueCta: o.saveProfile,
            joinTeamCta: o.joinTeamCta,
            invite: inviteCopy,
          },
          locale,
          safeNext,
        }}
      />
    );
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(0,132,135,0.09),transparent_28%),radial-gradient(circle_at_18%_100%,rgba(255,255,255,0.62),transparent_32%),linear-gradient(180deg,hsl(0_0%_100%),hsl(284_30%_98%)_52%,hsl(230_28%_96%))] px-5 py-8 text-slate-950 sm:py-10">
      <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col justify-center">
        <header className="mb-7 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-3">
              <Globe2 className="size-7 text-slate-950" aria-hidden="true" />
              <span className="wordmark text-2xl">
                {dictionary.app.name}
              </span>
            </div>
            <Badge className="mt-5 rounded-full border border-white/55 bg-white/48 px-3 py-1 text-primary shadow-[0_8px_22px_rgba(15,23,42,0.06),0_1px_0_rgba(255,255,255,0.7)_inset] backdrop-blur-xl">
              {dictionary.onboarding.accountSetup}
            </Badge>
            <h1 className="mt-4 max-w-2xl text-[34px] font-black leading-tight tracking-[-0.05em] sm:text-[42px]">
              {currentStepTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600">
              {dictionary.onboarding.subtitle}
            </p>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-sm font-bold leading-6 text-red-600 shadow-[0_1px_0_rgba(255,255,255,0.62)_inset] backdrop-blur-xl">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {joinProfile && (state.status === "needs_membership" || allowRejoin) && (
            <Card className={`${glassCardClass} p-6 md:p-8`}>
              <div className={iconClass}>
                <Ticket className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-[-0.03em]">
                {dictionary.onboarding.joinTitle}
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                {dictionary.onboarding.joinBody(joinProfile.name)}
              </p>
              <JoinForm
                copy={{ joinTeamCta: o.joinTeamCta, invite: inviteCopy }}
                safeNext={safeNext}
              />
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
