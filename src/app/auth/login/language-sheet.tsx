"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setLocaleCookie } from "@/app/auth/actions";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type { Locale } from "@/lib/i18n";

// Native language names + romanization + flag glyph (shown identically in every locale).
// i18n-ignore-start: language picker intentionally shows native language names.
const OPTIONS: { code: Locale; name: string; roman: string; flag: string }[] = [
  { code: "ko", name: "한국어", roman: "Korean", flag: "한" },
  { code: "ja", name: "日本語", roman: "Japanese", flag: "あ" },
  { code: "en", name: "English", roman: "English", flag: "A" },
];

// Deliberately bilingual, language-agnostic header (matches the design handoff).
const SHEET_TITLE = "언어 선택 · Language";
// i18n-ignore-end

const PRIMARY_SOFT =
  "color-mix(in oklab, hsl(223 46% 32%) 8%, hsl(44 52% 98.5%))";

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[15px]" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5S14.4 18.2 12 20.5C9.6 18.2 8.4 15.2 8.4 12S9.6 5.8 12 3.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[13px]" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path d="M5 12l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type LanguageSheetProps = {
  locale: Locale;
  next: string;
  view?: string;
};

export function LanguageSheet({ locale, next, view }: LanguageSheetProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const current = OPTIONS.find((o) => o.code === locale) ?? OPTIONS[0];

  function select(code: Locale) {
    if (code !== locale) {
      // Persist to cookie so the selection survives redirects through
      // the auth/onboarding flow even without the ?lang= param.
      setLocaleCookie(code);
      const params = new URLSearchParams();
      params.set("lang", code);
      params.set("next", next);
      if (view) params.set("view", view);
      router.push(`/auth/login?${params.toString()}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={SHEET_TITLE}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-border bg-surface/70 pl-[11px] pr-3 text-[12.5px] font-bold text-[hsl(222_20%_28%)]"
      >
        <span className="text-muted-foreground">
          <GlobeIcon />
        </span>
        {current.name}
        <span className="text-[hsl(222_10%_62%)]">
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <BottomSheet onClose={() => setOpen(false)} ariaLabel={SHEET_TITLE}>
          {({ close }) => (
            <div className="pt-1">
              <p className="mb-[14px] text-center text-[15px] font-extrabold text-foreground">
                {SHEET_TITLE}
              </p>
              {OPTIONS.map((o) => {
                const active = o.code === locale;
                return (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => {
                      select(o.code);
                      close();
                    }}
                    className="mt-0.5 flex w-full items-center gap-3 rounded-[14px] p-[14px] text-left first:mt-0"
                    style={active ? { background: PRIMARY_SOFT } : undefined}
                  >
                    <span
                      className={
                        active
                          ? "flex size-[30px] flex-none items-center justify-center rounded-full bg-primary text-[13px] font-extrabold text-primary-foreground"
                          : "flex size-[30px] flex-none items-center justify-center rounded-full bg-muted text-[13px] font-extrabold text-[hsl(222_20%_28%)]"
                      }
                    >
                      {o.flag}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold text-foreground">{o.name}</span>
                      <span className="mt-px block text-[11.5px] font-semibold text-[hsl(222_10%_62%)]">
                        {o.roman}
                      </span>
                    </span>
                    {active && (
                      <span className="ml-auto text-primary">
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}
