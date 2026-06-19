"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { signInWithEmailPassword } from "@/app/auth/actions";

const GRADIENT_EMAIL =
  "linear-gradient(165deg, hsl(223 50% 42%), hsl(223 54% 22%))";
const SHADOW_EMAIL = "0 18px 36px -20px hsl(223 46% 32% / 0.7)";

const INPUT_BASE =
  "h-[52px] w-full rounded-[13px] border border-border bg-surface px-[14px] text-[15px] font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-[hsl(222_10%_62%)] focus:border-primary focus:ring-[3.5px] focus:ring-primary/15";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
      <path
        d="M9.6 5.8A10 10 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-3 3.7M6.3 7.8A17 17 0 002.5 12S6 18.5 12 18.5a9.6 9.6 0 003.7-.7M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type EmailLoginFormCopy = {
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  forgot: string;
  loginCta: string;
  showPassword: string;
  hidePassword: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`relative mt-[14px] h-[54px] w-full rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white ${
        pending ? "pointer-events-none opacity-70" : ""
      }`}
      style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
    >
      {pending ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="size-5 animate-spin rounded-full border-[2.4px] border-white/60 border-t-white" />
        </span>
      ) : null}
      <span className={pending ? "opacity-0" : ""}>{label}</span>
    </button>
  );
}

export function EmailLoginForm({
  copy,
  forgotHref,
  initialEmail = "",
  next,
  lang,
}: {
  copy: EmailLoginFormCopy;
  forgotHref: string;
  initialEmail?: string;
  next: string;
  lang: string;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={signInWithEmailPassword}>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="lang" value={lang} />

      <div className="mb-[14px]">
        <div className="mb-[7px] text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]">
          {copy.emailLabel}
        </div>
        <input
          type="email"
          name="email"
          autoComplete="email"
          defaultValue={initialEmail}
          placeholder={copy.emailPlaceholder}
          className={INPUT_BASE}
          required
        />
      </div>

      <div className="mb-[14px]">
        <div className="mb-[7px] flex items-center justify-between text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]">
          {copy.passwordLabel}
          <a href={forgotHref} className="text-[12px] font-extrabold text-primary">
            {copy.forgot}
          </a>
        </div>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder={copy.passwordPlaceholder}
            className={`${INPUT_BASE} pr-[46px]`}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? copy.hidePassword : copy.showPassword}
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-[9px] text-[hsl(222_10%_62%)]"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      <SubmitButton label={copy.loginCta} />
    </form>
  );
}
