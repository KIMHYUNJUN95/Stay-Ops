"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { signUpWithEmail } from "@/app/auth/actions";

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
  if (s === "on") return "on";
  if (s === "mid") return "mid";
  return "";
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
    <button type="submit" disabled={dim} aria-busy={pending} className={`submit${dim ? " dim" : ""}`}>
      {pending ? (
        <span className="size-5 animate-spin rounded-full border-[2.4px] border-white/60 border-t-white" aria-hidden="true" />
      ) : (
        label
      )}
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
  const emailStateClass = emailState === "good" ? " good" : emailState === "bad" ? " bad" : "";

  return (
    <form action={signUpWithEmail}>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="lang" value={lang} />

      {/* Email field */}
      <div className="field">
        <div className="field__l">{copy.emailLabel}</div>
        <div className={`inp${emailStateClass}`}>
          <input
            type="email"
            name="email"
            autoComplete="email"
            enterKeyHint="next"
            placeholder={copy.emailPlaceholder}
            onChange={handleEmailChange}
            required
          />
          {emailState === "good" && (
            <span className="inp__ok" aria-hidden="true">
              <span className="ic"><CheckIcon /></span>
            </span>
          )}
        </div>
      </div>

      {/* Password field */}
      <div className="field">
        <div className="field__l">{copy.passwordLabel}</div>
        <div className="inp pw">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            enterKeyHint="go"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? copy.hidePassword : copy.showPassword}
            className="inp__eye"
          >
            <span className="ic">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</span>
          </button>
        </div>

        <div className="pw-meter">
          {segments.map((s, i) => (
            <i key={i} className={segmentClass(s)} />
          ))}
        </div>
        <div className="field__hint">{copy.passwordHint}</div>
      </div>

      <SubmitButton label={copy.signupCta} disabled={!isReady} />

      <p className="field__hint" style={{ textAlign: "center", marginTop: 14, whiteSpace: "pre-line", lineHeight: 1.55 }}>
        <a href={termsHref} style={{ color: "var(--muted)", fontWeight: 800 }}>{copy.termsLink}</a>
        {copy.termsConMid}
        <a href={privacyHref} style={{ color: "var(--muted)", fontWeight: 800 }}>{copy.privacyLink}</a>
        {copy.termsConPost}
      </p>
    </form>
  );
}
