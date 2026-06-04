import { redirect } from "next/navigation";
import { Globe2, ShieldAlert, ShieldCheck, Ticket, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import {
  claimFirstPlatformAdmin,
  completeProfile,
  joinOrganizationWithInviteCode,
} from "@/app/onboarding/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { sanitizeNextPath } from "@/lib/safe-redirect";

type OnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
    lang?: string;
    next?: string;
  }>;
};

const glassCardClass =
  "rounded-[18px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.84),rgba(255,255,255,0.68))] text-slate-950 shadow-[0_26px_80px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.78)_inset,0_-1px_0_rgba(15,23,42,0.04)_inset] ring-1 ring-white/55 backdrop-blur-[32px] dark:border-white/12 dark:bg-[linear-gradient(145deg,rgba(10,43,40,0.84),rgba(10,43,40,0.66))] dark:text-slate-50 dark:shadow-[0_26px_80px_rgba(0,0,0,0.28),0_1px_0_rgba(255,255,255,0.08)_inset] dark:ring-white/10";

const secondaryCardClass =
  "rounded-[18px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.74),rgba(255,255,255,0.58))] text-slate-950 shadow-[0_14px_38px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.64)_inset] ring-1 ring-white/35 backdrop-blur-2xl dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(10,43,40,0.78),rgba(10,43,40,0.62))] dark:text-slate-50 dark:shadow-[0_14px_38px_rgba(0,0,0,0.24),0_1px_0_rgba(255,255,255,0.07)_inset] dark:ring-white/10";

const iconClass =
  "flex size-12 items-center justify-center rounded-2xl border border-[#a7ded9]/60 bg-[#eefafa]/70 text-[#008487] shadow-[0_1px_0_rgba(255,255,255,0.62)_inset] backdrop-blur-xl dark:border-[#1f5f59]/80 dark:bg-[#0d3834]/74 dark:text-[#6ee7df]";

const inputClass =
  "h-[54px] rounded-lg border-slate-300/70 bg-white/58 px-4 text-base font-semibold text-slate-950 shadow-[0_1px_0_rgba(255,255,255,0.72)_inset] backdrop-blur-xl placeholder:text-slate-400 focus:border-[#008487] focus:ring-[#008487]/15 dark:border-white/15 dark:bg-white/8 dark:text-slate-50 dark:placeholder:text-slate-500";

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const [state, params] = await Promise.all([
    getOnboardingState(),
    searchParams,
  ]);

  const requestedLocale = params.lang ?? "";
  const queryLocale: Locale = isLocale(requestedLocale) ? requestedLocale : "ko";
  const safeNext = sanitizeNextPath(params.next);

  if (state.status === "ready") {
    // Honour `safeNext` when present (e.g. user was mid-flow when session
    // expired, or was redirected here after Google OAuth). Fall back to the
    // role-appropriate default route.
    redirect(safeNext || state.redirectTo);
  }

  if (state.status === "unauthenticated") {
    const onboardingNext = `/onboarding?lang=${queryLocale}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`;
    redirect(
      `/auth/login?next=${encodeURIComponent(onboardingNext)}&lang=${queryLocale}`,
    );
  }

  const locale: Locale =
    state.status === "needs_membership" ||
    state.status === "suspended" ||
    state.status === "removed"
      ? state.profile.preferredLanguage
      : queryLocale;
  const dictionary = getDictionary(locale);
  const errorMessage = params.error
    ? (dictionary.onboarding.errors[params.error] ?? params.error)
    : null;
  const currentStepTitle =
    state.status === "needs_membership"
      ? dictionary.onboarding.joinTitle
      : state.status === "suspended"
        ? dictionary.onboarding.suspendedTitle
        : state.status === "removed"
          ? dictionary.onboarding.removedTitle
          : dictionary.onboarding.profileTitle;

  // Render a blocked screen for suspended/removed users.
  if (state.status === "suspended" || state.status === "removed") {
    const isRemoved = state.status === "removed";
    return (
      <main className="flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(0,132,135,0.09),transparent_28%),linear-gradient(180deg,hsl(0_0%_100%),hsl(230_28%_96%))] px-5 py-10 text-slate-950 dark:bg-[linear-gradient(180deg,#061f1d,#071816)] dark:text-slate-50">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <ShieldAlert className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            {currentStepTitle}
          </h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
            {isRemoved ? dictionary.onboarding.removedBody : dictionary.onboarding.suspendedBody}
          </p>
          <form action={signOut} className="mt-8">
            <button
              className="h-[54px] w-full rounded-lg border border-slate-300/80 bg-white/60 text-base font-bold text-slate-700 transition-colors hover:bg-white dark:border-white/15 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/14"
              type="submit"
            >
              {dictionary.common.logout}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(0,132,135,0.09),transparent_28%),radial-gradient(circle_at_18%_100%,rgba(255,255,255,0.62),transparent_32%),linear-gradient(180deg,hsl(0_0%_100%),hsl(284_30%_98%)_52%,hsl(230_28%_96%))] px-5 py-8 text-slate-950 dark:bg-[radial-gradient(circle_at_50%_16%,rgba(110,231,223,0.1),transparent_30%),radial-gradient(circle_at_14%_100%,rgba(255,255,255,0.05),transparent_26%),linear-gradient(180deg,#061f1d,#0b2926_58%,#071816)] dark:text-slate-50 sm:py-10">
      <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col justify-center">
        <header className="mb-7 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-3">
              <Globe2 className="size-7 text-slate-950 dark:text-slate-50" aria-hidden="true" />
              <span className="text-2xl font-black tracking-[-0.04em]">
                {dictionary.app.name}
              </span>
            </div>
            <Badge className="mt-5 rounded-full border border-white/55 bg-white/48 px-3 py-1 text-[#008487] shadow-[0_8px_22px_rgba(15,23,42,0.06),0_1px_0_rgba(255,255,255,0.7)_inset] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:text-[#6ee7df]">
              {dictionary.onboarding.accountSetup}
            </Badge>
            <h1 className="mt-4 max-w-2xl text-[34px] font-black leading-tight tracking-[-0.05em] sm:text-[42px]">
              {currentStepTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              {dictionary.onboarding.subtitle}
            </p>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-sm font-bold leading-6 text-red-600 shadow-[0_1px_0_rgba(255,255,255,0.62)_inset] backdrop-blur-xl dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {state.status === "needs_profile" && (
            <Card className={`${glassCardClass} p-6 md:col-span-2 md:p-8`}>
              <div className={iconClass}>
                <UserRound className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-[-0.03em]">
                {dictionary.onboarding.profileTitle}
              </h2>
              <form action={completeProfile} className="mt-6 grid gap-4">
                {safeNext && <input name="next" type="hidden" value={safeNext} />}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-bold text-slate-950 dark:text-slate-100">
                      {dictionary.onboarding.fullNamePlaceholder}
                    </span>
                    <Input
                      className={inputClass}
                      name="name"
                      placeholder={dictionary.onboarding.fullNamePlaceholder}
                      required
                      type="text"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-bold text-slate-950 dark:text-slate-100">
                      {dictionary.onboarding.phonePlaceholder}
                    </span>
                    <Input
                      className={inputClass}
                      name="phoneNumber"
                      placeholder={dictionary.onboarding.phonePlaceholder}
                      required
                      type="tel"
                    />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-bold text-slate-950 dark:text-slate-100">
                      {dictionary.auth.languageSelector}
                    </span>
                    <select
                      className={`${inputClass} w-full outline-none`}
                      defaultValue={locale}
                      name="preferredLanguage"
                    >
                      <option value="ko">{dictionary.languages.ko}</option>
                      <option value="ja">{dictionary.languages.ja}</option>
                      <option value="en">{dictionary.languages.en}</option>
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-bold text-slate-950 dark:text-slate-100">
                      {dictionary.onboarding.inviteCodeOptionalPlaceholder}
                    </span>
                    <Input
                      className={inputClass}
                      name="inviteCode"
                      placeholder={
                        dictionary.onboarding.inviteCodeOptionalPlaceholder
                      }
                      type="text"
                    />
                  </label>
                </div>
                <Button
                  className="h-[54px] w-full rounded-lg bg-[#008487] text-base font-black text-white shadow-[0_14px_34px_rgba(0,132,135,0.18)] hover:bg-[#007376]"
                  type="submit"
                >
                  {dictionary.onboarding.saveProfile}
                </Button>
              </form>
            </Card>
          )}

          {state.status === "needs_membership" && (
            <Card className={`${glassCardClass} p-6 md:p-8`}>
              <div className={iconClass}>
                <Ticket className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-[-0.03em]">
                {dictionary.onboarding.joinTitle}
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
                {dictionary.onboarding.joinBody(state.profile.name)}
              </p>
              <form
                action={joinOrganizationWithInviteCode}
                className="mt-6 space-y-4"
              >
                {safeNext && <input name="next" type="hidden" value={safeNext} />}
                <label className="block space-y-2">
                  <span className="text-sm font-bold text-slate-950 dark:text-slate-100">
                    {dictionary.onboarding.inviteCodePlaceholder}
                  </span>
                  <Input
                    autoCapitalize="characters"
                    className={inputClass}
                    name="inviteCode"
                    placeholder={dictionary.onboarding.inviteCodePlaceholder}
                    required
                    type="text"
                  />
                </label>
                <Button
                  className="h-[54px] w-full rounded-lg bg-[#008487] text-base font-black text-white shadow-[0_14px_34px_rgba(0,132,135,0.18)] hover:bg-[#007376]"
                  type="submit"
                >
                  {dictionary.onboarding.join}
                </Button>
              </form>
            </Card>
          )}

          {(state.status === "needs_profile" ||
            state.status === "needs_membership") &&
            state.canClaimPlatformAdmin && (
              <Card className={`${secondaryCardClass} p-6 md:p-8`}>
                <div className={iconClass}>
                  <ShieldCheck className="size-6" aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-2xl font-black tracking-[-0.03em]">
                  {dictionary.onboarding.firstAdminTitle}
                </h2>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
                  {dictionary.onboarding.firstAdminBody}
                </p>
                <form action={claimFirstPlatformAdmin} className="mt-5">
                  <Button
                    className="h-12 w-full rounded-lg border-white/70 bg-white/58 text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.62)_inset] backdrop-blur-xl hover:bg-white/72 dark:border-white/10 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/15"
                    disabled={state.status === "needs_profile"}
                    type="submit"
                    variant="secondary"
                  >
                    {dictionary.onboarding.claimAdmin}
                  </Button>
                </form>
              </Card>
            )}
        </div>
      </section>
    </main>
  );
}
