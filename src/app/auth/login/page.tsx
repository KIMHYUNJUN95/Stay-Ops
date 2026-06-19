import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInWithGoogle, signOut } from "@/app/auth/actions";
import { EmailLoginForm } from "@/app/auth/login/email-login-form";
import { EmailNewPasswordForm } from "@/app/auth/login/email-new-password-form";
import { EmailResetForm } from "@/app/auth/login/email-reset-form";
import { EmailSignupForm } from "@/app/auth/login/email-signup-form";
import { GoogleSubmitButton } from "@/app/auth/login/google-button";
import { LanguageSheet } from "@/app/auth/login/language-sheet";
import { resolveAuthErrorMessage } from "@/lib/auth-errors";
import { buildDevSeedLoginHref, isDevSeedLoginEnabled } from "@/lib/dev-auth";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { isMobileUserAgent } from "@/lib/mobile-device";
import { getOnboardingState } from "@/lib/onboarding";
import { sanitizeNextPath } from "@/lib/safe-redirect";

const LOCALE_COOKIE = "stayops_locale";

type LoginPageProps = {
  searchParams: Promise<{
    email?: string;
    error?: string;
    lang?: string;
    mode?: string;
    next?: string;
    sent?: string;
    view?: string;
  }>;
};

// Surface (card / ivory) + navy accents pulled straight from the design tokens.
const GRADIENT_EMAIL =
  "linear-gradient(165deg, hsl(223 50% 42%), hsl(223 54% 22%))";
const SHADOW_EMAIL = "0 18px 36px -20px hsl(223 46% 32% / 0.7)";
const PRIMARY_SOFT =
  "color-mix(in oklab, hsl(223 46% 32%) 8%, hsl(44 52% 98.5%))";
const PRIMARY_SOFT_BORDER =
  "color-mix(in oklab, hsl(223 46% 32%) 18%, transparent)";
const INFO_BG = "color-mix(in oklab, hsl(206 70% 40%) 7%, hsl(44 52% 98.5%))";
const INFO_BORDER = "color-mix(in oklab, hsl(206 70% 40%) 20%, transparent)";
const INFO_ICON_BG = "color-mix(in oklab, hsl(206 70% 40%) 14%, #fff)";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[14px]" aria-hidden="true">
      <path
        d="M12 3l7 2.5v5.2c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5L12 3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon({ large = false, small = false }: { large?: boolean; small?: boolean }) {
  const size = large ? "size-[34px]" : small ? "size-[15px]" : "size-5";
  return (
    <svg viewBox="0 0 24 24" fill="none" className={size} aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 7l7.5 5.5L19.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[34px]" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function UserXIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[34px]" aria-hidden="true">
      <circle cx="10" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 19.5c1.1-3 3.6-4.6 6-4.6 1 0 2 .3 2.9.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 15l5 5M21 15l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[34px]" aria-hidden="true">
      <path d="M12 3.5v8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M7 6.5a8 8 0 1010 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function WarnIcon({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 4l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
}

function ClockIcon({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5v5l3.2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[34px]" aria-hidden="true">
      <path d="M5 12.5a10 10 0 0114 0M8 15.5a6 6 0 018 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.3" fill="currentColor" />
      <path d="M3 4l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[34px]" aria-hidden="true">
      <path d="M9.5 14.5l5-5M8 10.5L6.4 12a3.5 3.5 0 005 5l1.6-1.6M16 13.5l1.6-1.6a3.5 3.5 0 00-5-5L11 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[21px] flex-none" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.9a5.05 5.05 0 01-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.18v2.84A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.83 14.09a6.6 6.6 0 010-4.18V7.07H2.18a11 11 0 000 9.86l3.65-2.84z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.07.56 4.21 1.65l3.14-3.14C17.45 1.46 14.97.5 12 .5A11 11 0 002.18 7.07l3.65 2.84C6.7 7.3 9.13 4.75 12 4.75z" />
    </svg>
  );
}

// Inline alert banner shared by the Band 5 error screens.
const BANNER_STYLES = {
  danger: {
    bg: "hsl(6 70% 95.5%)",
    border: "color-mix(in oklab, hsl(4 62% 46%) 24%, transparent)",
    iconBg: "color-mix(in oklab, hsl(4 62% 46%) 13%, #fff)",
    fg: "hsl(4 62% 46%)",
  },
  warn: {
    bg: "hsl(38 82% 92%)",
    border: "color-mix(in oklab, hsl(35 80% 38%) 26%, transparent)",
    iconBg: "color-mix(in oklab, hsl(35 80% 38%) 16%, #fff)",
    fg: "hsl(35 80% 38%)",
  },
  info: {
    bg: "hsl(206 66% 93%)",
    border: "color-mix(in oklab, hsl(206 70% 40%) 22%, transparent)",
    iconBg: "color-mix(in oklab, hsl(206 70% 40%) 14%, #fff)",
    fg: "hsl(206 70% 40%)",
  },
} as const;

function Banner({
  variant,
  icon,
  title,
  children,
}: {
  variant: keyof typeof BANNER_STYLES;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  const s = BANNER_STYLES[variant];
  return (
    <div
      className="flex items-start gap-[11px] rounded-[14px] border px-[14px] py-[13px]"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <span
        className="flex size-[34px] flex-none items-center justify-center rounded-[10px]"
        style={{ background: s.iconBg, color: s.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold" style={{ color: s.fg }}>
          {title}
        </div>
        {children && (
          <div className="mt-[3px] text-[11.5px] font-semibold leading-[1.5] text-[hsl(222_20%_28%)]">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M4 7.5A1.5 1.5 0 015.5 6h13A1.5 1.5 0 0120 7.5V10a2 2 0 000 4v2.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 16.5V14a2 2 0 000-4V7.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 6v12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2.5" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const state = await getOnboardingState();

  // ?lang= param takes priority; cookie fallback keeps the selection across redirects.
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value ?? "";
  const requestedLocale = params.lang ?? cookieLocale;
  const locale: Locale = isLocale(requestedLocale) ? requestedLocale : "ko";
  const dictionary = getDictionary(locale);
  const t = dictionary.auth;
  const devSeedLogin = isDevSeedLoginEnabled();
  const errorMessage = resolveAuthErrorMessage(params.error, dictionary);

  // Mobile-first login: on a phone/tablet, always route into the mobile app after
  // sign-in — overriding the role-based admin default and any ?next=/admin/... value.
  const userAgent = (await headers()).get("user-agent");
  const isMobileDevice = isMobileUserAgent(userAgent);
  const next = sanitizeNextPath(params.next, isMobileDevice ? "/mobile" : "/admin");
  const effectiveNext = isMobileDevice ? "/mobile" : next;
  const isBlockedState =
    params.view === "blocked" &&
    (state.status === "suspended" ||
      state.status === "removed" ||
      state.status === "disabled");

  // Password-reset link lands here with a recovery SESSION (so the user is
  // authenticated). This screen must render despite that — otherwise the gating
  // below would bounce the user to their dashboard/onboarding before they can
  // set a new password.
  const isPasswordRecovery =
    params.view === "email" && params.mode === "new_password";

  if (state.status === "ready" && !isPasswordRecovery) {
    redirect(effectiveNext);
  }

  if (state.status !== "unauthenticated" && !isBlockedState && !isPasswordRecovery) {
    const onboardingUrl = `/onboarding?lang=${locale}&next=${encodeURIComponent(next)}`;
    redirect(onboardingUrl);
  }

  // Email auth (login / signup / reset). Login screen is built; signup/reset are next.
  const langNext = `lang=${locale}&next=${encodeURIComponent(effectiveNext)}`;
  const emailHref = `/auth/login?view=email&${langNext}`;
  const signupHref = `/auth/login?view=email&mode=signup&${langNext}`;
  const forgotHref = `/auth/login?view=email&mode=reset&${langNext}`;

  // ===== Password reset — sent confirmation (view=email&mode=reset&sent=…) =====
  if (params.view === "email" && params.mode === "reset" && params.sent) {
    const resendHref = forgotHref;
    return (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="email" />
        </header>

        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <div className="flex-1" />

          {/* Centered confirmation card. */}
          <div className="flex flex-col items-center text-center">
            <span
              className="mb-5 flex size-[72px] items-center justify-center rounded-[22px] text-primary"
              style={{ background: PRIMARY_SOFT }}
            >
              <MailIcon large />
            </span>
            <p className="mb-[9px] text-[11px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
              {t.email.resetSentEyebrow}
            </p>
            <h1 className="text-[21px] font-black leading-[1.2] tracking-[-0.025em]">
              {t.email.resetSentTitle}
            </h1>
            <p className="mt-[11px] max-w-[290px] text-[13.5px] font-semibold leading-[1.6] text-muted-foreground">
              {t.email.resetSentBody}
            </p>
            {params.email && (
              <span className="mt-4 inline-flex items-center gap-[7px] rounded-full bg-muted px-[14px] py-2 text-[12.5px] font-bold text-[hsl(222_20%_28%)]">
                <span className="text-muted-foreground">
                  <MailIcon small />
                </span>
                {params.email}
              </span>
            )}
          </div>

          <div className="flex-1" />

          <Link
            href={emailHref}
            className="flex h-[52px] w-full items-center justify-center rounded-[15px] text-[15px] font-extrabold tracking-[-0.01em] text-white"
            style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
          >
            {t.email.resetSentBackToLogin}
          </Link>

          <p className="mt-[18px] text-center text-[12px] font-semibold text-muted-foreground">
            {t.email.resetSentNoMail}{" "}
            <Link href={resendHref} className="font-extrabold text-primary">
              {t.email.resetSentResend}
            </Link>{" "}
            ·{" "}
            <Link href="#" className="font-extrabold text-primary">
              {t.email.resetSentHelp}
            </Link>
          </p>
        </section>
      </main>
    );
  }

  // ===== New password screen (view=email&mode=new_password) =====
  // Reached after the Supabase recovery link is exchanged for a session in /auth/callback.
  if (params.view === "email" && params.mode === "new_password") {
    return (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="email" />
        </header>

        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <div className="mt-2">
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.15] tracking-[-0.03em]">
              {t.email.newPasswordTitle}
            </h1>
            <p className="mt-2 text-[13.5px] font-semibold leading-[1.5] text-muted-foreground">
              {t.email.newPasswordSubtitle}
            </p>
          </div>

          {errorMessage && (
            <p className="mb-4 mt-5 rounded-[13px] border border-[hsl(4_62%_46%/0.24)] bg-[hsl(6_70%_95.5%)] px-[14px] py-3 text-[13px] font-bold leading-[1.5] text-[hsl(4_62%_46%)]">
              {errorMessage}
            </p>
          )}

          <div className="mt-[30px]">
            <EmailNewPasswordForm
              copy={{
                newPasswordLabel: t.email.newPasswordLabel,
                newPasswordConfirmLabel: t.email.newPasswordConfirmLabel,
                updatePasswordCta: t.email.updatePasswordCta,
                showPassword: t.email.showPassword,
                hidePassword: t.email.hidePassword,
              }}
              next={effectiveNext}
              lang={locale}
            />
          </div>

          <div className="flex-1" />
        </section>
      </main>
    );
  }

  // ===== Password reset screen (view=email&mode=reset) =====
  if (params.view === "email" && params.mode === "reset") {
    return (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="email" />
        </header>

        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <div className="mt-2">
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.15] tracking-[-0.03em]">
              {t.email.resetTitle}
            </h1>
            <p className="mt-2 text-[13.5px] font-semibold leading-[1.5] text-muted-foreground">
              {t.email.resetSubtitle}
            </p>
          </div>

          {errorMessage && (
            <p className="mb-4 mt-5 rounded-[13px] border border-[hsl(4_62%_46%/0.24)] bg-[hsl(6_70%_95.5%)] px-[14px] py-3 text-[13px] font-bold leading-[1.5] text-[hsl(4_62%_46%)]">
              {errorMessage}
            </p>
          )}

          <div className="mt-[30px]">
            <EmailResetForm
              copy={{
                emailLabel: t.emailLabel,
                emailPlaceholder: t.emailPlaceholder,
                resetHint: t.email.resetHint,
                resetCta: t.email.resetCta,
              }}
              next={effectiveNext}
              lang={locale}
            />
          </div>

          <div className="flex-1" />
        </section>
      </main>
    );
  }

  // ===== Email verification sent (view=email&mode=signup&sent=verify) =====
  if (params.view === "email" && params.mode === "signup" && params.sent === "verify") {
    return (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="email" />
        </header>

        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <div className="flex-1" />

          <div className="flex flex-col items-center text-center">
            <span
              className="mb-5 flex size-[72px] items-center justify-center rounded-[22px] text-primary"
              style={{ background: PRIMARY_SOFT }}
            >
              <MailIcon large />
            </span>
            <h1 className="text-[21px] font-black leading-[1.2] tracking-[-0.025em]">
              {t.email.verificationSentTitle}
            </h1>
            <p className="mt-[11px] max-w-[290px] text-[13.5px] font-semibold leading-[1.6] text-muted-foreground">
              {t.email.verificationSentBody}
            </p>
            {params.email && (
              <span className="mt-4 inline-flex items-center gap-[7px] rounded-full bg-muted px-[14px] py-2 text-[12.5px] font-bold text-[hsl(222_20%_28%)]">
                <span className="text-muted-foreground">
                  <MailIcon small />
                </span>
                {params.email}
              </span>
            )}
          </div>

          <div className="flex-1" />

          <Link
            href={emailHref}
            className="flex h-[52px] w-full items-center justify-center rounded-[15px] text-[15px] font-extrabold tracking-[-0.01em] text-white"
            style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
          >
            {t.email.resetSentBackToLogin}
          </Link>
        </section>
      </main>
    );
  }

  // ===== Error states (view=error&mode=…) =====
  // Design-first preview of the Band 5 error frames. Field values are demo
  // placeholders; the password show/hide toggle is non-interactive in this preview.
  if (params.view === "error") {
    const e = t.errs;
    const demoEmail = params.email ?? "ito.k@arakicho-stay.jp";
    const kind = params.mode ?? "wrong_pw";
    const FIELD =
      "h-[52px] w-full rounded-[13px] border bg-surface px-[14px] text-[15px] font-semibold text-foreground outline-none";
    const LABEL = "mb-[7px] text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]";
    const eyeBtn = (
      <span className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-[9px] text-[hsl(222_10%_62%)]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
    );

    const shell = (inner: React.ReactNode) => (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="error" />
        </header>
        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          {inner}
        </section>
      </main>
    );

    // 1 — wrong password
    if (kind === "wrong_pw") {
      return shell(
        <>
          <h1 className="mt-2 text-[25px] font-black leading-[1.15] tracking-[-0.03em]">
            {t.email.loginCta}
          </h1>
          <div className="mt-[18px]">
            <Banner variant="danger" icon={<WarnIcon />} title={e.wrongPwBanner}>
              {e.wrongPwBodyPre}
              <Link href={forgotHref} className="font-extrabold underline underline-offset-2">
                {e.wrongPwBodyLink}
              </Link>
              {e.wrongPwBodyPost}
            </Banner>
          </div>
          <div className="mb-[14px] mt-4">
            <div className={LABEL}>{t.emailLabel}</div>
            <input readOnly value={demoEmail} className={`${FIELD} border-border`} />
          </div>
          <div className="mb-[14px]">
            <div className="mb-[7px] flex items-center justify-between text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]">
              {t.email.passwordLabel}
              <Link href={forgotHref} className="text-[12px] font-extrabold text-primary">
                {t.email.forgot}
              </Link>
            </div>
            <div className="relative">
              <input
                readOnly
                type="password"
                value="000000"
                className={`${FIELD} border-[hsl(4_62%_46%)] pr-[46px]`}
              />
              {eyeBtn}
            </div>
            <div className="mt-[7px] flex items-center gap-[5px] text-[11.5px] font-bold text-[hsl(4_62%_46%)]">
              <WarnIcon className="size-[14px]" />
              {e.wrongPwAttempts}
            </div>
          </div>
          <Link
            href="#"
            className="mt-[14px] flex h-[54px] w-full items-center justify-center rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white"
            style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
          >
            {t.email.loginCta}
          </Link>
          <div className="flex-1" />
        </>,
      );
    }

    // 2 — email already exists (signup)
    if (kind === "email_exists") {
      return shell(
        <>
          <h1 className="mt-2 text-[25px] font-black leading-[1.15] tracking-[-0.03em]">
            {t.email.tabSignup}
          </h1>
          <div className="mt-[18px]">
            <Banner variant="info" icon={<InfoIcon />} title={e.emailExistsBanner}>
              {e.emailExistsBodyPre}
              <Link href={emailHref} className="font-extrabold underline underline-offset-2">
                {e.emailExistsBodyLink}
              </Link>
              {e.emailExistsBodyPost}
            </Banner>
          </div>
          <div className="mb-5 mt-5 flex rounded-[13px] bg-muted p-1">
            <Link
              href={emailHref}
              className="flex h-10 flex-1 items-center justify-center rounded-[10px] text-[13.5px] font-extrabold text-muted-foreground"
            >
              {t.email.tabLogin}
            </Link>
            <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-surface text-[13.5px] font-extrabold text-foreground shadow-[0_2px_6px_rgba(20,32,43,0.12)]">
              {t.email.tabSignup}
            </span>
          </div>
          <div className="mb-[14px]">
            <div className={LABEL}>{t.emailLabel}</div>
            <input readOnly value={demoEmail} className={`${FIELD} border-[hsl(4_62%_46%)]`} />
            <div className="mt-[7px] flex items-center gap-[5px] text-[11.5px] font-bold text-[hsl(4_62%_46%)]">
              <WarnIcon className="size-[14px]" />
              {e.emailExistsFieldErr}
            </div>
          </div>
          <div className="mb-[14px]">
            <div className={LABEL}>{t.email.passwordLabel}</div>
            <div className="relative">
              <input
                readOnly
                type="password"
                placeholder={t.email.passwordPlaceholder}
                className={`${FIELD} border-border pr-[46px] placeholder:font-medium placeholder:text-[hsl(222_10%_62%)]`}
              />
              {eyeBtn}
            </div>
          </div>
          <span className="mt-[6px] flex h-[54px] w-full items-center justify-center rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white opacity-[0.42]" style={{ background: GRADIENT_EMAIL }}>
            {t.email.signupCta}
          </span>
          <div className="flex-1" />
        </>,
      );
    }

    // 3 — account collision (link)
    if (kind === "collision") {
      return shell(
        <>
          <div className="flex-1" />
          <div className="flex flex-col items-center text-center">
            <span
              className="mb-5 flex size-[72px] items-center justify-center rounded-[22px] text-primary"
              style={{ background: PRIMARY_SOFT }}
            >
              <LinkIcon />
            </span>
            <p className="mb-[9px] text-[11px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
              {e.collisionEyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[21px] font-black leading-[1.2] tracking-[-0.025em]">
              {e.collisionTitle}
            </h1>
            <p className="mt-[11px] max-w-[290px] text-[13.5px] font-semibold leading-[1.6] text-muted-foreground">
              {e.collisionBody}
            </p>
            <span className="mt-4 inline-flex items-center gap-[7px] rounded-full bg-muted px-[14px] py-2 text-[12.5px] font-bold text-[hsl(222_20%_28%)]">
              <span className="text-muted-foreground">
                <MailIcon small />
              </span>
              {demoEmail}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col gap-[10px]">
            <Link
              href="#"
              className="flex h-[52px] w-full items-center justify-center gap-[11px] rounded-[15px] text-[15px] font-extrabold tracking-[-0.01em] text-white"
              style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
            >
              <GoogleGlyph />
              {e.collisionGoogleCta}
            </Link>
            <Link
              href={emailHref}
              className="flex h-[50px] w-full items-center justify-center rounded-[15px] border border-border text-[14.5px] font-extrabold text-[hsl(222_20%_28%)]"
            >
              {e.collisionPwCta}
            </Link>
          </div>
        </>,
      );
    }

    // 4 — rate limit
    if (kind === "rate_limit") {
      return shell(
        <>
          <h1 className="mt-2 text-[25px] font-black leading-[1.15] tracking-[-0.03em]">
            {t.email.loginCta}
          </h1>
          <div className="mt-[18px]">
            <Banner variant="warn" icon={<ClockIcon />} title={e.rateLimitBanner}>
              {e.rateLimitBody}
              <span className="mt-2 inline-flex items-center gap-[5px] rounded-full px-[10px] py-1 font-mono text-[12px] font-bold tabular-nums text-[hsl(35_80%_38%)]" style={{ background: "color-mix(in oklab, hsl(35 80% 38%) 12%, #fff)" }}>
                <ClockIcon className="size-[13px]" />
                {e.rateLimitCountdown}
              </span>
            </Banner>
          </div>
          <div className="mb-[14px] mt-4">
            <div className={LABEL}>{t.emailLabel}</div>
            <input readOnly value={demoEmail} className={`${FIELD} border-border opacity-55`} />
          </div>
          <div className="mb-[14px]">
            <div className={LABEL}>{t.email.passwordLabel}</div>
            <input readOnly type="password" value="00000000" className={`${FIELD} border-border opacity-55`} />
          </div>
          <span className="flex h-[54px] w-full items-center justify-center rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white opacity-[0.42]" style={{ background: GRADIENT_EMAIL }}>
            {e.rateLimitCta}
          </span>
          <p className="mt-[18px] text-center text-[12px] font-semibold text-muted-foreground">
            {e.rateLimitFootPre}
            <Link href={forgotHref} className="font-extrabold text-primary">
              {e.rateLimitFootReset}
            </Link>{" "}
            ·{" "}
            <Link href="#" className="font-extrabold text-primary">
              {t.entry.helpLink}
            </Link>
          </p>
          <div className="flex-1" />
        </>,
      );
    }

    // 5 — network error
    if (kind === "network") {
      return shell(
        <>
          <div className="flex-1" />
          <div className="flex flex-col items-center text-center">
            <span className="mb-5 flex size-[72px] items-center justify-center rounded-[22px] bg-muted text-muted-foreground">
              <WifiIcon />
            </span>
            <p className="mb-[9px] text-[11px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
              {e.networkEyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[21px] font-black leading-[1.2] tracking-[-0.025em]">
              {e.networkTitle}
            </h1>
            <p className="mt-[11px] max-w-[290px] text-[13.5px] font-semibold leading-[1.6] text-muted-foreground">
              {e.networkBody}
            </p>
          </div>
          <div className="flex-1" />
          <Link
            href="#"
            className="flex h-[52px] w-full items-center justify-center gap-[11px] rounded-[15px] text-[15px] font-extrabold tracking-[-0.01em] text-white"
            style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
          >
            <ArrowRightIcon />
            {e.networkCta}
          </Link>
        </>,
      );
    }

    // 6 — Google sign-in failed (entry + banner)
    return shell(
      <>
        <div className="pt-[30px]">
          <div className="size-[58px]" aria-hidden="true" />
          <div className="wordmark mt-5 text-[33px]">{dictionary.app.name}</div>
          <p className="mt-[7px] text-[14.5px] font-semibold leading-[1.5] text-muted-foreground">
            {t.productSubtitle}
          </p>
          <span
            className="mt-[18px] inline-flex h-[30px] items-center gap-[7px] rounded-full border pl-[11px] pr-[13px] text-[11.5px] font-extrabold text-[hsl(223_54%_22%)]"
            style={{ background: PRIMARY_SOFT, borderColor: PRIMARY_SOFT_BORDER }}
          >
            <ShieldIcon />
            {t.entry.staffSecure}
          </span>
        </div>
        <div className="flex-1" />
        <div className="mb-4">
          <Banner variant="danger" icon={<WarnIcon />} title={e.googleBanner}>
            {e.googleBody}
          </Banner>
        </div>
        <div className="flex flex-col gap-[11px]">
          <form action={signInWithGoogle}>
            <input name="next" type="hidden" value={effectiveNext} />
            <input name="lang" type="hidden" value={locale} />
            <GoogleSubmitButton label={t.entry.continueGoogle} />
          </form>
          <Link
            href={emailHref}
            className="flex h-[54px] w-full items-center justify-center gap-[11px] rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white"
            style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
          >
            <MailIcon />
            {t.entry.continueEmail}
          </Link>
        </div>
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[12px] font-bold text-[hsl(222_10%_62%)]">{t.divider}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <p className="text-center text-[13px] font-semibold text-muted-foreground">
          {t.entry.noAccount}{" "}
          <Link href={signupHref} className="font-extrabold text-primary">
            {t.entry.signUpEmail}
          </Link>
        </p>
        <div className="flex-1" />
      </>,
    );
  }

  // ===== Blocked / suspended states (view=blocked&state=…) =====
  if (params.view === "blocked") {
    const b = t.blocked;
    type BlockedConfig = {
      icon: React.ReactNode;
      iconBg: string;
      iconColor: string;
      eyebrow: string;
      title: string;
      body: string;
      showEmail: boolean;
      primary: string;
      primaryHref: string;
      secondary: string;
    };
    const blockedEmail =
      params.email ??
      (state.status === "disabled"
        ? state.email
        : state.status === "suspended" || state.status === "removed"
          ? state.user.email ?? ""
          : "");
    // Blocked-account recovery CTAs: "contact admin/support" open a prefilled mailto:
    // to NEXT_PUBLIC_SUPPORT_EMAIL (empty recipient falls back to the user's mail client).
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";
    const contactBody = b.contactBody.replace("{email}", blockedEmail);
    const buildMailto = (subject: string) =>
      `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(contactBody)}`;
    const removedRejoinHref = `/onboarding?rejoin=1&lang=${locale}${effectiveNext ? `&next=${encodeURIComponent(effectiveNext)}` : ""}`;
    const configs: Record<string, BlockedConfig> = {
      suspended: {
        icon: <LockIcon />,
        iconBg: "hsl(38 82% 92%)",
        iconColor: "hsl(35 80% 38%)",
        eyebrow: b.suspendedEyebrow,
        title: b.suspendedTitle,
        body: b.suspendedBody,
        showEmail: true,
        primary: b.suspendedCta,
        primaryHref: buildMailto(b.contactSubjectSuspended),
        secondary: b.logout,
      },
      removed: {
        icon: <UserXIcon />,
        iconBg: "hsl(40 22% 90%)",
        iconColor: "hsl(222 10% 44%)",
        eyebrow: b.removedEyebrow,
        title: b.removedTitle,
        body: b.removedBody,
        showEmail: false,
        primary: b.removedCta,
        primaryHref: removedRejoinHref,
        secondary: b.logout,
      },
      disabled: {
        icon: <PowerIcon />,
        iconBg: "hsl(6 70% 95.5%)",
        iconColor: "hsl(4 62% 46%)",
        eyebrow: b.disabledEyebrow,
        title: b.disabledTitle,
        body: b.disabledBody,
        showEmail: true,
        primary: b.disabledCta,
        primaryHref: buildMailto(b.contactSubjectDisabled),
        secondary: b.disabledAltLogin,
      },
    };
    const cfg = configs[params.mode ?? ""] ?? configs.suspended;
    return (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="blocked" />
        </header>

        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <div className="flex-1" />

          <div className="flex flex-col items-center text-center">
            <span
              className="mb-5 flex size-[72px] items-center justify-center rounded-[22px]"
              style={{ background: cfg.iconBg, color: cfg.iconColor }}
            >
              {cfg.icon}
            </span>
            <p className="mb-[9px] text-[11px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
              {cfg.eyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[21px] font-black leading-[1.2] tracking-[-0.025em]">
              {cfg.title}
            </h1>
            <p className="mt-[11px] max-w-[290px] text-[13.5px] font-semibold leading-[1.6] text-muted-foreground">
              {cfg.body}
            </p>
            {cfg.showEmail && blockedEmail && (
              <span className="mt-4 inline-flex items-center gap-[7px] rounded-full bg-muted px-[14px] py-2 text-[12.5px] font-bold text-[hsl(222_20%_28%)]">
                <span className="text-muted-foreground">
                  <MailIcon small />
                </span>
                {blockedEmail}
              </span>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex flex-col gap-[10px]">
            <a
              href={cfg.primaryHref}
              className="flex h-[52px] w-full items-center justify-center rounded-[15px] text-[15px] font-extrabold tracking-[-0.01em] text-white"
              style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
            >
              {cfg.primary}
            </a>
            <form action={signOut}>
              <input name="next" type="hidden" value="/auth/login" />
              <button
                type="submit"
                className="flex h-[50px] w-full items-center justify-center rounded-[15px] border border-border text-[14.5px] font-extrabold text-[hsl(222_20%_28%)]"
              >
                {cfg.secondary}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  // ===== Email signup screen (view=email&mode=signup) =====
  if (params.view === "email" && params.mode === "signup") {
    return (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="email" />
        </header>

        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <div className="mt-2">
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.15] tracking-[-0.03em]">
              {t.email.signupTitle}
            </h1>
            <p className="mt-2 text-[13.5px] font-semibold leading-[1.5] text-muted-foreground">
              {t.email.signupSubtitle}
            </p>
          </div>

          {/* Login / Signup segmented control — Signup tab active. */}
          <div className="mb-5 mt-[22px] flex rounded-[13px] bg-muted p-1">
            <Link
              href={emailHref}
              className="flex h-10 flex-1 items-center justify-center rounded-[10px] text-[13.5px] font-extrabold text-muted-foreground"
            >
              {t.email.tabLogin}
            </Link>
            <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-surface text-[13.5px] font-extrabold text-foreground shadow-[0_2px_6px_rgba(20,32,43,0.12)]">
              {t.email.tabSignup}
            </span>
          </div>

          <EmailSignupForm
            copy={{
              emailLabel: t.emailLabel,
              emailPlaceholder: t.emailPlaceholder,
              passwordLabel: t.email.passwordLabel,
              passwordHint: t.email.passwordPolicy,
              signupCta: t.email.signupCta,
              showPassword: t.email.showPassword,
              hidePassword: t.email.hidePassword,
              termsLink: t.email.termsLink,
              termsConMid: t.email.termsConMid,
              privacyLink: t.email.privacyLink,
              termsConPost: t.email.termsConPost,
            }}
            next={effectiveNext}
            lang={locale}
          />

          <div className="flex-1" />
        </section>
      </main>
    );
  }

  // ===== Email login screen (view=email) =====
  if (params.view === "email") {
    return (
      <main
        className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] text-foreground"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)",
        }}
      >
        {/* Header — no back button (swipe-back is the shared navigation pattern). */}
        <header className="flex h-[50px] flex-none items-center justify-between px-4">
          <span className="w-[38px]" />
          <LanguageSheet locale={locale} next={effectiveNext} view="email" />
        </header>

        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <div className="mt-2">
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.15] tracking-[-0.03em]">
              {t.email.welcomeTitle}
            </h1>
            <p className="mt-2 text-[13.5px] font-semibold leading-[1.5] text-muted-foreground">
              {t.email.loginSubtitle}
            </p>
          </div>

          {/* Login / Signup segmented control. */}
          <div className="mb-5 mt-[22px] flex rounded-[13px] bg-muted p-1">
            <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-surface text-[13.5px] font-extrabold text-foreground shadow-[0_2px_6px_rgba(20,32,43,0.12)]">
              {t.email.tabLogin}
            </span>
            <Link
              href={signupHref}
              className="flex h-10 flex-1 items-center justify-center rounded-[10px] text-[13.5px] font-extrabold text-muted-foreground"
            >
              {t.email.tabSignup}
            </Link>
          </div>

          {params.sent === "password_updated" && (
            <p className="mb-4 rounded-[13px] border border-[hsl(146_50%_32%/0.24)] bg-[hsl(146_44%_96%)] px-[14px] py-3 text-[13px] font-bold leading-[1.5] text-[hsl(146_50%_32%)]">
              {t.email.passwordUpdatedNote}
            </p>
          )}

          {errorMessage && (
            <p className="mb-4 rounded-[13px] border border-[hsl(4_62%_46%/0.24)] bg-[hsl(6_70%_95.5%)] px-[14px] py-3 text-[13px] font-bold leading-[1.5] text-[hsl(4_62%_46%)]">
              {errorMessage}
            </p>
          )}

          <EmailLoginForm
            copy={{
              emailLabel: t.emailLabel,
              emailPlaceholder: t.emailPlaceholder,
              passwordLabel: t.email.passwordLabel,
              passwordPlaceholder: t.email.passwordPlaceholder,
              forgot: t.email.forgot,
              loginCta: t.email.loginCta,
              showPassword: t.email.showPassword,
              hidePassword: t.email.hidePassword,
            }}
            forgotHref={forgotHref}
            initialEmail={params.email ?? ""}
            next={effectiveNext}
            lang={locale}
          />

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[12px] font-bold text-[hsl(222_10%_62%)]">{t.divider}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form action={signInWithGoogle}>
            <input name="next" type="hidden" value={effectiveNext} />
            <input name="lang" type="hidden" value={locale} />
            <GoogleSubmitButton label={t.entry.continueGoogle} compact />
          </form>

          <div className="flex-1" />
        </section>
      </main>
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
      {/* Header — right-aligned language pill → full-screen scrim bottom sheet. */}
      <header className="flex h-[50px] flex-none items-center justify-between px-4">
        <span className="w-[38px]" />
        <LanguageSheet locale={locale} next={effectiveNext} view={params.view} />
      </header>

      <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
        {/* Hero — logo slot intentionally empty (a brand logo is added later). */}
        <div className="pt-[30px]">
          <div className="size-[58px]" aria-hidden="true" />
          <div className="wordmark mt-5 text-[33px]">{dictionary.app.name}</div>
          <p className="mt-[7px] text-[14.5px] font-semibold leading-[1.5] text-muted-foreground">
            {t.productSubtitle}
          </p>
          <span
            className="mt-[18px] inline-flex h-[30px] items-center gap-[7px] rounded-full border pl-[11px] pr-[13px] text-[11.5px] font-extrabold text-[hsl(223_54%_22%)]"
            style={{ background: PRIMARY_SOFT, borderColor: PRIMARY_SOFT_BORDER }}
          >
            <ShieldIcon />
            {t.entry.staffSecure}
          </span>
        </div>

        <div className="flex-1" />

        {errorMessage && (
          <p className="mb-4 rounded-[13px] border border-[hsl(4_62%_46%/0.24)] bg-[hsl(6_70%_95.5%)] px-[14px] py-3 text-[13px] font-bold leading-[1.5] text-[hsl(4_62%_46%)]">
            {errorMessage}
          </p>
        )}

        {/* Equal CTAs — Google (wired) and Email (next design page). */}
        <div className="flex flex-col gap-[11px]">
          <form action={signInWithGoogle}>
            <input name="next" type="hidden" value={effectiveNext} />
            <input name="lang" type="hidden" value={locale} />
            <GoogleSubmitButton label={t.entry.continueGoogle} />
          </form>

          <Link
            href={emailHref}
            className="flex h-[54px] w-full items-center justify-center gap-[11px] rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white"
            style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
          >
            <MailIcon />
            {t.entry.continueEmail}
          </Link>
        </div>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[12px] font-bold text-[hsl(222_10%_62%)]">{t.divider}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <p className="text-center text-[13px] font-semibold text-muted-foreground">
          {t.entry.noAccount}{" "}
          <Link href={signupHref} className="font-extrabold text-primary">
            {t.entry.signUpEmail}
          </Link>
        </p>

        <div
          className="mt-[18px] flex items-start gap-[9px] rounded-[13px] border px-[13px] py-3"
          style={{ background: INFO_BG, borderColor: INFO_BORDER }}
        >
          <span
            className="flex size-7 flex-none items-center justify-center rounded-[9px] text-[hsl(206_70%_40%)]"
            style={{ background: INFO_ICON_BG }}
          >
            <TicketIcon />
          </span>
          <p className="text-[11.5px] font-bold leading-[1.5] text-[hsl(222_20%_28%)]">
            {t.entry.inviteNote}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-[9px] text-[11px] font-semibold text-[hsl(222_10%_62%)]">
          <Link href="#" className="text-muted-foreground">
            {t.entry.termsLink}
          </Link>
          <span className="size-[3px] rounded-full bg-[hsl(222_10%_62%)]" />
          <Link href="#" className="text-muted-foreground">
            {t.entry.privacyLink}
          </Link>
          <span className="size-[3px] rounded-full bg-[hsl(222_10%_62%)]" />
          <Link href="#" className="text-muted-foreground">
            {t.entry.helpLink}
          </Link>
        </div>

        {/* Dev-only seed login (kept so local sign-in still works; not part of the design). */}
        {devSeedLogin && (
          <div className="mt-6 rounded-[13px] border border-dashed border-border bg-surface/60 p-3">
            <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
              {t.devLogin.note}
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href={buildDevSeedLoginHref("admin", isMobileDevice ? "/mobile" : next)}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[13px] font-extrabold text-primary-foreground"
              >
                {isMobileDevice ? t.devLogin.mobileAdmin : t.devLogin.admin}
              </Link>
              {!isMobileDevice && (
                <>
                  <Link
                    href={buildDevSeedLoginHref("staff", next)}
                    className="flex h-11 w-full items-center justify-center rounded-xl border border-primary/35 bg-primary/[0.06] text-[13px] font-extrabold text-primary"
                  >
                    {t.devLogin.staff}
                  </Link>
                  <Link
                    href={buildDevSeedLoginHref("admin", next === "/" ? "/mobile" : next)}
                    className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-surface text-[13px] font-bold text-foreground"
                  >
                    {t.devLogin.mobile}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
