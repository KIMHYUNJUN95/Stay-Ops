import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { InviteCodeFieldCopy } from "@/app/onboarding/invite-code-field";
import { JoinForm } from "@/app/onboarding/onboarding-forms";
import { OnboardingWizard } from "@/app/onboarding/onboarding-wizard";
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
          reviewCta: o.joinFlow.reviewCta,
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
    <main
      className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
      style={{
        background:
          "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
      }}
    >
      <header className="h-[48px] flex-none" />
      <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
        <div className="flex-1 overflow-y-auto px-1 pt-2 -mx-1">
          <p className="mb-[10px] mt-[14px] text-[12px] font-extrabold uppercase tracking-[0.04em] text-primary">
            {dictionary.onboarding.accountSetup}
          </p>
          <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
            {currentStepTitle}
          </h1>
          {joinProfile && (
            <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
              {dictionary.onboarding.joinBody(joinProfile.name)}
            </p>
          )}
          {errorMessage && (
            <div className="mt-[14px] rounded-[14px] border border-[hsl(4_62%_46%/0.24)] bg-[hsl(6_70%_95.5%)] px-[14px] py-[13px] text-[13px] font-semibold leading-[1.5] text-[hsl(4_62%_46%)]">
              {errorMessage}
            </div>
          )}
          {joinProfile && (state.status === "needs_membership" || allowRejoin) && (
            <JoinForm
              copy={{ joinTeamCta: o.joinTeamCta, invite: inviteCopy }}
              safeNext={safeNext}
            />
          )}
        </div>
      </section>
    </main>
  );
}
