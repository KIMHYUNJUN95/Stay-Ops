import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Globe2, ShieldCheck } from "lucide-react";
import { signInWithEmail, signInWithGoogle } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
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
  const params = new URLSearchParams({ lang: locale, next });
  return `/auth/login?${params.toString()}`;
}

const PRIMARY_BUTTON =
  "inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground shadow-[0_18px_36px_-16px_hsl(var(--primary-hsl)/0.55)] transition-all hover:bg-primary/90 active:scale-[0.99]";
const SECONDARY_BUTTON =
  "inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-[15px] font-bold text-foreground transition-colors hover:bg-muted/50 active:scale-[0.99]";
const NOTE_BOX =
  "flex items-start gap-2 rounded-2xl border border-primary/15 bg-primary/[0.07] px-4 py-3 text-xs font-semibold leading-5 text-primary";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const state = await getOnboardingState();
  const next = sanitizeNextPath(params.next, "/mobile");
  const requestedLocale = params.lang ?? "";
  const locale: Locale = isLocale(requestedLocale) ? requestedLocale : "ko";
  const dictionary = getDictionary(locale);
  const devSeedLogin = isDevSeedLoginEnabled();
  const errorMessage = resolveAuthErrorMessage(params.error, dictionary);

  // Mobile-first login: on a phone/tablet, always route into the mobile app after
  // sign-in — overriding the role-based admin default and any ?next=/admin/... value.
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isMobileDevice =
    /Mobi|Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry/i.test(userAgent);
  const effectiveNext = isMobileDevice ? "/mobile" : next;

  if (state.status === "ready") {
    redirect(effectiveNext);
  }

  if (state.status !== "unauthenticated") {
    const onboardingUrl = `/onboarding?lang=${locale}&next=${encodeURIComponent(next)}`;
    redirect(onboardingUrl);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      {/* Aurora — soft navy/indigo light blooms fading into the ivory canvas. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-28 left-1/2 h-80 w-[130%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(50%_60%_at_50%_0%,hsl(var(--primary-hsl)/0.20),transparent_72%)] blur-2xl" />
        <div className="absolute left-[-12%] top-16 size-72 rounded-full bg-[radial-gradient(circle,hsl(var(--primary-hsl)/0.12),transparent_70%)] blur-3xl" />
        <div className="absolute right-[-14%] top-40 size-72 rounded-full bg-[radial-gradient(circle,rgba(78,99,179,0.14),transparent_70%)] blur-3xl" />
      </div>

      <header className="mx-auto flex h-[68px] w-full max-w-[440px] items-center justify-between px-6">
        <Link className="inline-flex items-center gap-2.5" href="/">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_22px_-10px_hsl(var(--primary-hsl)/0.6)]">
            <Globe2 className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="wordmark text-[22px]">{dictionary.app.name}</span>
        </Link>

        <nav
          aria-label={dictionary.auth.languageSelector}
          className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface/70 p-1 text-[12px] font-extrabold backdrop-blur-xl"
        >
          {locales.map((option) => (
            <Link
              className={`rounded-full px-2.5 py-1 transition-colors ${
                option === locale
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              href={getLanguageHref(option, effectiveNext)}
              key={option}
            >
              {option.toUpperCase()}
            </Link>
          ))}
        </nav>
      </header>

      <section className="mx-auto flex min-h-[calc(100dvh-68px)] w-full max-w-[440px] flex-col px-6 pb-10 pt-[7vh]">
        {/* Brand / welcome */}
        <div className="mb-7 px-0.5">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary/70">
            {dictionary.app.name}
          </p>
          <h1 className="mt-3 text-[34px] font-black leading-[1.12] tracking-[-0.045em]">
            {dictionary.auth.welcomeBack}
          </h1>
          <p className="mt-3 text-[15px] font-medium leading-6 text-muted-foreground">
            {dictionary.auth.productSubtitle}
          </p>
        </div>

        {/* Auth card */}
        <div className="rounded-[26px] border border-border bg-surface/85 p-6 shadow-[0_34px_80px_-34px_rgba(34,40,60,0.45)] backdrop-blur-2xl sm:p-7">
          {devSeedLogin ? (
            <div className="space-y-3">
              <div className={NOTE_BOX}>
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {dictionary.auth.devLogin.note}
                  <br />
                  {dictionary.auth.devLogin.emailDisabled}
                </span>
              </div>
              {isMobileDevice ? (
                <Link className={PRIMARY_BUTTON} href={buildDevSeedLoginHref("admin", "/mobile")}>
                  {dictionary.auth.devLogin.mobile}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link className={PRIMARY_BUTTON} href={buildDevSeedLoginHref("admin", next)}>
                    {dictionary.auth.devLogin.admin}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    className="inline-flex h-[54px] w-full items-center justify-center rounded-2xl border border-primary/35 bg-primary/[0.06] text-[15px] font-extrabold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
                    href={buildDevSeedLoginHref("staff", next)}
                  >
                    {dictionary.auth.devLogin.staff}
                  </Link>
                  <Link
                    className={SECONDARY_BUTTON}
                    href={buildDevSeedLoginHref("admin", next === "/" ? "/mobile" : next)}
                  >
                    {dictionary.auth.devLogin.mobile}
                  </Link>
                </>
              )}
            </div>
          ) : (
            <form action={signInWithEmail} className="space-y-4">
              <input name="next" type="hidden" value={effectiveNext} />
              <input name="lang" type="hidden" value={locale} />
              <label className="block space-y-2">
                <span className="text-sm font-bold text-foreground">{dictionary.auth.emailLabel}</span>
                <Input
                  autoComplete="email"
                  className="h-[54px] rounded-2xl border-border bg-background/60 px-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-primary/15"
                  name="email"
                  placeholder={dictionary.auth.emailPlaceholder}
                  required
                  type="email"
                />
              </label>

              <div className={NOTE_BOX}>
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{dictionary.auth.activeMethodNote}</span>
              </div>

              <Button className={PRIMARY_BUTTON} type="submit">
                {dictionary.auth.sendMagicLink}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </form>
          )}

          {params.sent && (
            <p className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-bold leading-6 text-primary">
              {dictionary.auth.magicLinkSent}
            </p>
          )}
          {errorMessage && (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-600">
              {errorMessage}
            </p>
          )}

          {!devSeedLogin && (
            <>
              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {dictionary.auth.divider}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form action={signInWithGoogle}>
                <input name="next" type="hidden" value={effectiveNext} />
                <input name="lang" type="hidden" value={locale} />
                <button className={`${SECONDARY_BUTTON} gap-3`} type="submit">
                  <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-sm font-black text-background">
                    G
                  </span>
                  {dictionary.auth.googleSignIn}
                </button>
              </form>
              <p className="mt-4 text-center text-xs font-medium leading-5 text-muted-foreground/80">
                {dictionary.auth.newUserHint}
              </p>
            </>
          )}
        </div>

        <p className="mt-auto pt-8 text-center text-xs font-medium text-muted-foreground/70">
          {dictionary.app.name}
        </p>
      </section>
    </main>
  );
}
