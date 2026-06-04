import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, Globe2, ShieldCheck } from "lucide-react";
import { signInWithEmail, signInWithGoogle } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resolveAuthErrorMessage } from "@/lib/auth-errors";
import { buildDevSeedLoginHref, isDevSeedLoginEnabled } from "@/lib/dev-auth";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { sanitizeNextPath } from "@/lib/safe-redirect";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    lang?: string;
    next?: string;
    sent?: string;
  }>;
};

function getLanguageHref(locale: Locale, next: string) {
  const params = new URLSearchParams({
    lang: locale,
    next,
  });

  return `/auth/login?${params.toString()}`;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const state = await getOnboardingState();
  const next = sanitizeNextPath(params.next, "/mobile");
  const requestedLocale = params.lang ?? "";
  const locale: Locale = isLocale(requestedLocale) ? requestedLocale : "ko";
  const dictionary = getDictionary(locale);
  const devSeedLogin = isDevSeedLoginEnabled();
  const errorMessage = resolveAuthErrorMessage(params.error, dictionary);

  if (state.status === "ready") {
    redirect(next);
  }

  if (state.status !== "unauthenticated") {
    const onboardingUrl = `/onboarding?lang=${locale}&next=${encodeURIComponent(next)}`;
    redirect(onboardingUrl);
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(0,132,135,0.09),transparent_28%),radial-gradient(circle_at_18%_100%,rgba(255,255,255,0.62),transparent_32%),linear-gradient(180deg,hsl(0_0%_100%),hsl(284_30%_98%)_52%,hsl(230_28%_96%))] text-slate-950 dark:bg-[radial-gradient(circle_at_50%_16%,rgba(110,231,223,0.1),transparent_30%),radial-gradient(circle_at_14%_100%,rgba(255,255,255,0.05),transparent_26%),linear-gradient(180deg,#061f1d,#0b2926_58%,#071816)] dark:text-slate-50">
      <header className="mx-auto flex h-[74px] w-full max-w-[460px] items-center justify-between px-6 sm:max-w-6xl sm:px-8">
        <Link className="inline-flex items-center gap-3" href="/">
          <Globe2 className="size-7 text-slate-950 dark:text-slate-50" aria-hidden="true" />
          <span className="text-2xl font-black tracking-[-0.04em]">
            {dictionary.app.name}
          </span>
        </Link>

        <nav
          aria-label={dictionary.auth.languageSelector}
          className="inline-flex items-center gap-1 rounded-full border border-white/55 bg-white/44 px-1.5 py-1 text-sm font-black shadow-[0_8px_22px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:shadow-[0_8px_22px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          {locales.map((option) => (
            <Link
              className={`rounded-full px-2 py-1 transition-colors ${
                option === locale
                  ? "text-slate-950 underline decoration-slate-950 underline-offset-8 dark:text-slate-50 dark:decoration-slate-50"
                  : "hidden text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 sm:inline"
              }`}
              href={getLanguageHref(option, next)}
              key={option}
            >
              {option.toUpperCase()}
            </Link>
          ))}
          <ChevronDown className="size-4 text-slate-950 dark:text-slate-50" aria-hidden="true" />
        </nav>
      </header>

      <section className="mx-auto flex min-h-[calc(100dvh-74px)] w-full max-w-[460px] flex-col items-center px-5 pb-10 pt-[15vh] sm:max-w-6xl sm:px-8 sm:pt-[13vh]">
        <Card className="w-full max-w-[414px] rounded-[18px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.84),rgba(255,255,255,0.68))] p-8 text-slate-950 shadow-[0_26px_80px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.78)_inset,0_-1px_0_rgba(15,23,42,0.04)_inset] ring-1 ring-white/55 backdrop-blur-[32px] dark:border-white/12 dark:bg-[linear-gradient(145deg,rgba(10,43,40,0.84),rgba(10,43,40,0.66))] dark:text-slate-50 dark:shadow-[0_26px_80px_rgba(0,0,0,0.28),0_1px_0_rgba(255,255,255,0.08)_inset] dark:ring-white/10 sm:max-w-[430px] sm:p-10">
          <div className="text-center">
            <h1 className="text-[34px] font-black leading-tight tracking-[-0.05em] sm:text-[38px]">
              {dictionary.auth.welcomeBack}
            </h1>
          </div>

          {devSeedLogin ? (
            <div className="mt-8 space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-[#a7ded9]/65 bg-[#eefafa]/62 px-4 py-3 text-xs font-semibold leading-5 text-[#007376] shadow-[0_1px_0_rgba(255,255,255,0.58)_inset] backdrop-blur-xl dark:border-[#1f5f59]/80 dark:bg-[#0d3834]/72 dark:text-[#6ee7df]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {dictionary.auth.devLogin.note}
                  <br />
                  {dictionary.auth.devLogin.emailDisabled}
                </span>
              </div>
              <Link
                className="inline-flex h-[54px] w-full items-center justify-center rounded-lg bg-[#008487] text-base font-black text-white shadow-[0_14px_34px_rgba(0,132,135,0.18)] transition-colors hover:bg-[#007376]"
                href={buildDevSeedLoginHref("admin", next)}
              >
                {dictionary.auth.devLogin.admin}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
              <Link
                className="inline-flex h-[54px] w-full items-center justify-center rounded-lg border border-[#008487]/40 bg-white/70 text-base font-black text-[#008487] transition-colors hover:bg-[#eefafa] dark:border-[#6ee7df]/30 dark:bg-white/8 dark:text-[#6ee7df] dark:hover:bg-[#0d3834]"
                href={buildDevSeedLoginHref("staff", next)}
              >
                {dictionary.auth.devLogin.staff}
              </Link>
              <Link
                className="inline-flex h-[54px] w-full items-center justify-center rounded-lg border border-slate-300/80 bg-white/50 text-base font-bold text-slate-700 transition-colors hover:bg-white dark:border-white/15 dark:bg-white/6 dark:text-slate-200 dark:hover:bg-white/10"
                href={buildDevSeedLoginHref(
                  "admin",
                  next === "/" ? "/mobile" : next,
                )}
              >
                {dictionary.auth.devLogin.mobile}
              </Link>
            </div>
          ) : (
            <form action={signInWithEmail} className="mt-8 space-y-5">
              <input name="next" type="hidden" value={next} />
              <input name="lang" type="hidden" value={locale} />
              <label className="block space-y-2">
                <span className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  {dictionary.auth.emailLabel}
                </span>
                <Input
                  autoComplete="email"
                  className="h-[58px] rounded-lg border-slate-300/70 bg-white/58 px-5 text-lg text-slate-950 shadow-[0_1px_0_rgba(255,255,255,0.72)_inset] backdrop-blur-xl placeholder:text-slate-400 focus:border-[#008487] focus:ring-[#008487]/15 dark:border-white/15 dark:bg-white/8 dark:text-slate-50 dark:placeholder:text-slate-500"
                  name="email"
                  placeholder={dictionary.auth.emailPlaceholder}
                  required
                  type="email"
                />
              </label>

              <div className="flex items-start gap-2 rounded-lg border border-[#a7ded9]/65 bg-[#eefafa]/62 px-4 py-3 text-xs font-semibold leading-5 text-[#007376] shadow-[0_1px_0_rgba(255,255,255,0.58)_inset] backdrop-blur-xl dark:border-[#1f5f59]/80 dark:bg-[#0d3834]/72 dark:text-[#6ee7df]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{dictionary.auth.activeMethodNote}</span>
              </div>

              <Button
                className="h-[58px] w-full rounded-lg bg-[#008487] text-base font-black text-white shadow-[0_14px_34px_rgba(0,132,135,0.18)] hover:bg-[#007376]"
                type="submit"
              >
                {dictionary.auth.sendMagicLink}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Button>
            </form>
          )}

          {params.sent && (
            <p className="mt-4 rounded-lg border border-[#a7ded9]/70 bg-[#e7f7f5]/70 px-4 py-3 text-sm font-bold leading-6 text-[#008487] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-[#1f5f59] dark:bg-[#0d3834]/78 dark:text-[#6ee7df]">
              {dictionary.auth.magicLinkSent}
            </p>
          )}
          {errorMessage && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-600 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-300">
              {errorMessage}
            </p>
          )}

          {!devSeedLogin && (
            <>
              <div className="my-8 flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {dictionary.auth.divider}
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              </div>
              <form action={signInWithGoogle}>
                <input name="next" type="hidden" value={next} />
                <input name="lang" type="hidden" value={locale} />
                <button
                  className="flex h-[54px] w-full items-center justify-center gap-3 rounded-lg border border-slate-300/80 bg-white/60 px-4 text-base font-bold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition-colors hover:bg-white/80 dark:border-white/15 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14"
                  type="submit"
                >
                  <span className="flex size-6 items-center justify-center rounded-sm bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950">
                    G
                  </span>
                  {dictionary.auth.googleSignIn}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
            {dictionary.auth.productSubtitle}
          </p>

          {!devSeedLogin && (
            <p className="mt-3 text-center text-xs font-medium leading-5 text-slate-400 dark:text-slate-500">
              {dictionary.auth.newUserHint}
            </p>
          )}

          <div className="mt-8 flex items-center justify-center gap-4 text-sm font-semibold text-slate-500 dark:text-slate-400 sm:hidden">
            <Globe2 className="size-4" aria-hidden="true" />
            {locales.map((option) => (
              <Link
                className={
                  option === locale
                    ? "text-slate-950 underline underline-offset-4 dark:text-slate-50"
                    : "hover:text-slate-950 dark:hover:text-slate-50"
                }
                href={getLanguageHref(option, next)}
                key={option}
              >
                {option.toUpperCase()}
              </Link>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
