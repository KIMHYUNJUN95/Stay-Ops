"use client";

import { useFormStatus } from "react-dom";
import { requestPasswordReset } from "@/app/auth/actions";

const GRADIENT_EMAIL =
  "linear-gradient(165deg, hsl(223 50% 42%), hsl(223 54% 22%))";
const SHADOW_EMAIL = "0 18px 36px -20px hsl(223 46% 32% / 0.7)";

const INPUT_BASE =
  "h-[52px] w-full rounded-[13px] border border-border bg-surface px-[14px] text-[15px] font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-[hsl(222_10%_62%)] transition-colors focus:border-primary focus:ring-[3.5px] focus:ring-primary/15";

type EmailResetFormCopy = {
  emailLabel: string;
  emailPlaceholder: string;
  resetHint: string;
  resetCta: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`relative h-[54px] w-full rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white ${
        pending ? "pointer-events-none opacity-70" : ""
      }`}
      style={{ background: GRADIENT_EMAIL, boxShadow: SHADOW_EMAIL }}
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

export function EmailResetForm({
  copy,
  next,
  lang,
}: {
  copy: EmailResetFormCopy;
  next: string;
  lang: string;
}) {
  return (
    <form action={requestPasswordReset}>
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
          placeholder={copy.emailPlaceholder}
          className={INPUT_BASE}
          required
        />
        <p className="mt-[7px] text-[11.5px] font-semibold leading-[1.45] text-[hsl(222_10%_62%)]">
          {copy.resetHint}
        </p>
      </div>

      <SubmitButton label={copy.resetCta} />
    </form>
  );
}
