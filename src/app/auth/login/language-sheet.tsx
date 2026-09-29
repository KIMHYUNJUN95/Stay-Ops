"use client";

import { useEffect, useRef, useState } from "react";
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

// 데스크톱 콘솔 폭(브랜드 패널이 보이는 폭, auth-console.css 의 1080px 분기와 같다)에서는
// 관리자 대시보드의 `.dd` 드롭다운처럼 버튼 아래로 펼친다. 그보다 좁으면 모바일 BottomSheet 계약.
const DESKTOP_QUERY = "(min-width: 1081px)";

export function LanguageSheet({ locale, next, view }: LanguageSheetProps) {
  const [open, setOpen] = useState<null | "menu" | "sheet">(null);
  const rootRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (open !== "menu") return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(null);
      return;
    }
    setOpen(window.matchMedia(DESKTOP_QUERY).matches ? "menu" : "sheet");
  }

  return (
    <div className="langdd" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup={open === "menu" ? "listbox" : "dialog"}
        aria-expanded={open !== null}
        aria-label={SHEET_TITLE}
        className="langpill"
      >
        <span className="ic">
          <GlobeIcon />
        </span>
        {current.name}
        <span className="ic chev">
          <ChevronDownIcon />
        </span>
      </button>

      {open === "menu" && (
        <div className="langdd__menu" role="listbox" aria-label={SHEET_TITLE}>
          {OPTIONS.map((o) => {
            const active = o.code === locale;
            return (
              <button
                key={o.code}
                type="button"
                role="option"
                aria-selected={active}
                className={`langdd__opt${active ? " on" : ""}`}
                onClick={() => {
                  setOpen(null);
                  select(o.code);
                }}
              >
                <span className="langdd__flag">{o.flag}</span>
                <span className="langdd__k">
                  <b>{o.name}</b>
                  <small>{o.roman}</small>
                </span>
                {active && (
                  <span className="langdd__chk">
                    <CheckIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {open === "sheet" && (
        <BottomSheet onClose={() => setOpen(null)} ariaLabel={SHEET_TITLE}>
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
    </div>
  );
}
