"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { signUpWithEmail } from "@/app/auth/actions";

const GRADIENT_EMAIL =
  "linear-gradient(165deg, hsl(223 50% 42%), hsl(223 54% 22%))";
const SHADOW_EMAIL = "0 18px 36px -20px hsl(223 46% 32% / 0.7)";

const INPUT_BASE =
  "h-[52px] w-full rounded-[13px] border border-border bg-surface px-[14px] text-[15px] font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-[hsl(222_10%_62%)] transition-colors focus:border-primary focus:ring-[3.5px] focus:ring-primary/15";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
      <path d="M5 12l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
      <path d="M9.6 5.8A10 10 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-3 3.7M6.3 7.8A17 17 0 002.5 12S6 18.5 12 18.5a9.6 9.6 0 003.7-.7M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type SegmentState = "on" | "mid" | "off";

function getStrengthSegments(pw: string): SegmentState[] {
  if (!pw) return ["off", "off", "off", "off"];
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const len = pw.length;
  if (len < 4) return ["mid", "off", "off", "off"];
  if (len < 8) return ["mid", "mid", "off", "off"];
  if (!hasLetter || !hasNumber) return ["mid", "mid", "off", "off"];
  if (len < 13) return ["on", "on", "on", "off"];
  return ["on", "on", "on", "on"];
}

function segmentClass(s: SegmentState) {
  if (s === "on") return "bg-[hsl(146_50%_32%)]";
  if (s === "mid") return "bg-[hsl(35_80%_38%)]";
  return "bg-muted";
}

type EmailSignupFormCopy = {
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordHint: string;
  signupCta: string;
  showPassword: string;
  hidePassword: string;
  termsLink: string;
  termsConMid: string;
  privacyLink: string;
  termsConPost: string;
};

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const dim = disabled || pending;
  return (
    <button
      type="submit"
      disabled={dim}
      aria-busy={pending}
      className={`relative mt-[6px] h-[54px] w-full rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white ${
        dim ? "pointer-events-none opacity-[0.42]" : ""
      }`}
      style={{
        background: GRADIENT_EMAIL,
        boxShadow: dim ? "none" : SHADOW_EMAIL,
      }}
    >
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="size-5 animate-spin rounded-full border-[2.4px] border-white/60 border-t-white" />
        </span>
      ) : null}
      <span className={pending ? "opacity-0" : ""}>{label}</span>
    </button>
  );
}

export function EmailSignupForm({
  copy,
  next,
  lang,
  termsHref = "#",
  privacyHref = "#",
}: {
  copy: EmailSignupFormCopy;
  next: string;
  lang: string;
  termsHref?: string;
  privacyHref?: string;
}) {
  const [emailState, setEmailState] = useState<"idle" | "good" | "bad">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (!v) { setEmailState("idle"); return; }
    setEmailState(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "good" : "bad");
  }

  const segments = getStrengthSegments(password);
  const isReady = emailState === "good" && password.length >= 1;

  const emailInputClass = [
    INPUT_BASE,
    emailState === "good"
      ? "border-[hsl(146_50%_32%)] pr-[46px] focus:ring-[hsl(146_50%_32%)/0.15]"
      : emailState === "bad"
      ? "border-[hsl(4_62%_46%)] focus:ring-[hsl(4_62%_46%)/0.12]"
      : "",
  ].join(" ");

  return (
    <form action={signUpWithEmail}>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="lang" value={lang} />

      {/* Email field */}
      <div className="mb-[14px]">
        <div className="mb-[7px] text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]">
          {copy.emailLabel}
        </div>
        <div className="relative">
          <input
            type="email"
            name="email"
            autoComplete="email"
            enterKeyHint="next"
            placeholder={copy.emailPlaceholder}
            className={emailInputClass}
            onChange={handleEmailChange}
            required
          />
          {emailState === "good" && (
            <span
              className="pointer-events-none absolute right-[14px] top-[17px] text-[hsl(146_50%_32%)]"
              aria-hidden="true"
            >
              <CheckIcon />
            </span>
          )}
        </div>
      </div>

      {/* Password field */}
      <div className="mb-[14px]">
        <div className="mb-[7px] text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]">
          {copy.passwordLabel}
        </div>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            enterKeyHint="go"
            placeholder="••••••••"
            className={`${INPUT_BASE} pr-[46px]`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

        {/* Strength meter — 4 segments */}
        <div className="mt-[9px] flex gap-[5px]">
          {segments.map((s, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${segmentClass(s)}`}
            />
          ))}
        </div>
        <p className="mt-[7px] text-[11.5px] font-semibold leading-[1.45] text-[hsl(222_10%_62%)]">
          {copy.passwordHint}
        </p>
      </div>

      <SubmitButton label={copy.signupCta} disabled={!isReady} />

      {/* Terms consent */}
      <p className="mt-[14px] whitespace-pre-line text-center text-[11.5px] font-semibold leading-[1.55] text-[hsl(222_10%_62%)]">
        <a href={termsHref} className="font-extrabold text-muted-foreground">
          {copy.termsLink}
        </a>
        {copy.termsConMid}
        <a href={privacyHref} className="font-extrabold text-muted-foreground">
          {copy.privacyLink}
        </a>
        {copy.termsConPost}
      </p>
    </form>
  );
}
