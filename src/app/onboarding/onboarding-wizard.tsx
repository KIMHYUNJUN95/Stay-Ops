"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  previewInviteCode,
  submitOnboardingProfile,
} from "@/app/onboarding/actions";
import {
  ProfileForm,
  type ProfileFormCopy,
} from "@/app/onboarding/onboarding-forms";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type { Locale } from "@/lib/i18n";

// Navy accent gradient + shadow pulled from the design tokens (matches the auth screens).
const GRADIENT = "linear-gradient(165deg, hsl(223 50% 42%), hsl(223 54% 22%))";
const SHADOW = "0 18px 36px -20px hsl(223 46% 32% / 0.7)";
const IVORY_BG =
  "radial-gradient(120% 50% at 50% -6%, hsl(42 36% 95%) 42%, hsl(42 30% 93%) 100%)";
const PRIMARY_SOFT =
  "color-mix(in oklab, hsl(223 46% 32%) 8%, hsl(44 52% 98.5%))";

// Numbered steps shown in the progress bar: name → dob → phone → invite.
// (Language is intentionally not a wizard step — it's already chosen at login.)
const TOTAL_STEPS = 4;

export type OnboardingIntroCopy = {
  title: string;
  subtitle: string;
  itemBasicsTitle: string;
  itemBasicsSub: string;
  itemLangTitle: string;
  itemLangSub: string;
  itemInviteTitle: string;
  itemInviteSub: string;
  startCta: string;
};

export type OnboardingStepsCopy = {
  basicsEyebrow: string;
  continueCta: string;
  nameTitle: string;
  nameSubtitle: string;
  nameLabel: string;
  nameHint: string;
  dobTitle: string;
  dobSubtitle: string;
  dobYearLabel: string;
  dobMonthLabel: string;
  dobDayLabel: string;
  dobYearPlaceholder: string;
  dobMonthPlaceholder: string;
  dobDayPlaceholder: string;
  dobHint: string;
  dobSheetTitle: string;
  dobConfirm: string;
  phoneTitle: string;
  phoneSubtitle: string;
  phoneNumLabel: string;
  phoneInputPlaceholder: string;
  phoneHint: string;
  phoneCountrySheetTitle: string;
};

export type OnboardingJoinCopy = {
  inviteEyebrow: string;
  inviteTitle: string;
  inviteSubtitle: string;
  caseHint: string;
  verifyCta: string;
  checking: string;
  skip: string;
  invalidTitle: string;
  confirmEyebrow: string;
  confirmTitle: string;
  confirmSubtitle: string;
  roleLabel: string;
  verified: string;
  joinCta: string;
  // reused copy
  codePlaceholder: string;
  orgLabel: string;
  errors: Record<string, string>;
  roleCategories: Record<string, string>;
};

export type OnboardingReviewCopy = {
  title: string;
  subtitle: string;
  rowName: string;
  rowDob: string;
  rowPhone: string;
  rowLang: string;
  rowOrg: string;
  rowRole: string;
  edit: string;
  infoTitle: string;
  infoBody: string;
  submit: string;
};

export type OnboardingSuccessCopy = {
  eyebrow: string;
  welcomePrefix: string;
  welcomeSuffix: string;
  bodyJoined: string;
  bodyNoTeam: string;
  startCta: string;
};

type Country = { iso: string; flag: string; dial: string };

// Curated country codes (common for hospitality staff in Japan). Names are i18n-driven.
const COUNTRIES: Country[] = [
  { iso: "jp", flag: "🇯🇵", dial: "+81" },
  { iso: "kr", flag: "🇰🇷", dial: "+82" },
  { iso: "cn", flag: "🇨🇳", dial: "+86" },
  { iso: "tw", flag: "🇹🇼", dial: "+886" },
  { iso: "vn", flag: "🇻🇳", dial: "+84" },
  { iso: "ph", flag: "🇵🇭", dial: "+63" },
  { iso: "th", flag: "🇹🇭", dial: "+66" },
  { iso: "us", flag: "🇺🇸", dial: "+1" },
  { iso: "gb", flag: "🇬🇧", dial: "+44" },
];

const pad2 = (v: number) => String(v).padStart(2, "0");
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 19.5c1.3-3.3 4-4.9 7-4.9s5.7 1.6 7 4.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5S14.4 18.2 12 20.5C9.6 18.2 8.4 15.2 8.4 12S9.6 5.8 12 3.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden="true">
      <path d="M4 7.5A1.5 1.5 0 015.5 6h13A1.5 1.5 0 0120 7.5V10a2 2 0 000 4v2.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 16.5V14a2 2 0 000-4V7.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 6v12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden="true">
      <path d="M5 12l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[14px]" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[12px]" aria-hidden="true">
      <path d="M12 3l7 2.5v5.2c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[17px]" aria-hidden="true">
      <path d="M12 4l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[17px]" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** Primary submit button with an in-place spinner (final join submission). */
function SpinnerButton({
  label,
  onClick,
  busy,
  disabled,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = busy || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      aria-busy={busy}
      className={`relative flex h-[54px] w-full items-center justify-center rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white ${
        off ? "pointer-events-none opacity-80" : ""
      }`}
      style={{ background: GRADIENT, boxShadow: off ? "none" : SHADOW }}
    >
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="size-5 animate-spin rounded-full border-[2.4px] border-white/60 border-t-white" />
        </span>
      ) : null}
      <span className={busy ? "opacity-0" : ""}>{label}</span>
    </button>
  );
}

function ChecklistRow({
  icon,
  title,
  sub,
  divider,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  divider: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-[13px] ${
        divider ? "border-t border-[hsl(40_24%_89%)]" : ""
      }`}
    >
      <span className="flex size-[34px] flex-none items-center justify-center rounded-[10px] bg-muted text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-extrabold text-foreground">{title}</div>
        <div className="text-[11.5px] font-semibold text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

/** Progress header — numbered count + bar. No back chevron (swipe / OS back is the shared pattern). */
function ProgressHeader({ step }: { step: number }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <header className="flex-none px-[26px] pb-[10px] pt-1">
      <div className="flex h-[44px] items-center justify-between">
        <span className="w-9" />
        <span className="text-[12.5px] font-extrabold tabular-nums text-muted-foreground">
          <b className="text-foreground">{step}</b> / {TOTAL_STEPS}
        </span>
        <span className="w-9" />
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-muted">
        <i
          className="block h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: GRADIENT }}
        />
      </div>
    </header>
  );
}

function StickyCta({
  label,
  onClick,
  disabled,
  withArrow,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  withArrow?: boolean;
}) {
  return (
    <div className="flex-none px-[26px] py-[14px] pb-[max(14px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white ${
          disabled ? "opacity-40" : ""
        }`}
        style={{ background: GRADIENT, boxShadow: disabled ? "none" : SHADOW }}
      >
        {label}
        {withArrow && <ArrowRightIcon />}
      </button>
    </div>
  );
}

const WHEEL_H = 200;
const ITEM_H = 42;
const WHEEL_PAD = (WHEEL_H - ITEM_H) / 2;

/** iOS-style scroll-snap wheel column. */
function Wheel({
  values,
  value,
  onChange,
  format,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const idx = Math.max(0, values.indexOf(value));
  const [active, setActive] = useState(idx);

  // Snap to the bound value on mount and whenever it changes externally (e.g. day clamp).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 2) el.scrollTop = target;
    setActive(idx);
  }, [idx]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(
      values.length - 1,
      Math.max(0, Math.round(el.scrollTop / ITEM_H)),
    );
    setActive(i);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const v = values[i];
      if (v !== value) onChange(v);
    }, 110);
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="flex-1 snap-y snap-mandatory overflow-y-auto text-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        height: WHEEL_H,
        WebkitMaskImage:
          "linear-gradient(180deg, transparent, #000 32%, #000 68%, transparent)",
        maskImage:
          "linear-gradient(180deg, transparent, #000 32%, #000 68%, transparent)",
      }}
    >
      <div style={{ height: WHEEL_PAD }} />
      {values.map((v, i) => (
        <div
          key={v}
          className={`snap-center text-[17px] tabular-nums ${
            i === active
              ? "font-extrabold text-foreground"
              : Math.abs(i - active) === 1
                ? "font-semibold text-muted-foreground"
                : "font-semibold text-[hsl(222_10%_62%)]"
          }`}
          style={{ height: ITEM_H, lineHeight: `${ITEM_H}px` }}
        >
          {format ? format(v) : v}
        </div>
      ))}
      <div style={{ height: WHEEL_PAD }} />
    </div>
  );
}

type DateParts = { year: number; month: number; day: number };

function BirthDateSheet({
  title,
  confirmLabel,
  initial,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  initial: DateParts;
  onConfirm: (parts: DateParts) => void;
  onClose: () => void;
}) {
  const maxYear = new Date().getFullYear();
  const years = range(1940, maxYear);
  const months = range(1, 12);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  const maxDay = daysInMonth(year, month);
  const days = range(1, maxDay);

  // Clamp the day in the year/month handlers (not an effect) when the range shrinks.
  function pickYear(y: number) {
    setYear(y);
    setDay((d) => Math.min(d, daysInMonth(y, month)));
  }
  function pickMonth(m: number) {
    setMonth(m);
    setDay((d) => Math.min(d, daysInMonth(year, m)));
  }

  return (
    <BottomSheet
      onClose={onClose}
      header={
        <p className="pb-[12px] pt-1 text-center text-[15px] font-extrabold text-foreground">
          {title}
        </p>
      }
    >
      {({ close }) => (
        <div>
          <div className="relative flex gap-[6px]" style={{ height: WHEEL_H }}>
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 h-[42px] -translate-y-1/2 rounded-[12px]"
              style={{ background: PRIMARY_SOFT }}
            />
            <Wheel values={years} value={year} onChange={pickYear} />
            <Wheel values={months} value={month} onChange={pickMonth} format={pad2} />
            <Wheel values={days} value={day} onChange={setDay} format={pad2} />
          </div>
          <button
            type="button"
            onClick={() => {
              onConfirm({ year, month, day });
              close();
            }}
            className="mt-[14px] flex h-[54px] w-full items-center justify-center rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white"
            style={{ background: GRADIENT, boxShadow: SHADOW }}
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

function DateCell({
  label,
  value,
  placeholder,
  grow,
  onClick,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  grow?: boolean;
  onClick: () => void;
}) {
  return (
    <div className={grow ? "flex-[1.4]" : "flex-1"}>
      <div className="mb-[6px] text-center text-[11px] font-extrabold uppercase tracking-[0.05em] text-[hsl(222_10%_62%)]">
        {label}
      </div>
      <button
        type="button"
        onClick={onClick}
        className="h-[54px] w-full rounded-[14px] border border-border bg-surface text-center text-[16px] font-semibold text-foreground"
      >
        {value ?? (
          <span className="font-medium text-[hsl(222_10%_62%)]">{placeholder}</span>
        )}
      </button>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  editLabel,
  onEdit,
  divider,
}: {
  label: string;
  value: string;
  editLabel: string;
  onEdit?: () => void;
  divider: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-[14px] ${
        divider ? "border-t border-[hsl(40_24%_89%)]" : ""
      }`}
    >
      <span className="w-[78px] flex-none text-[12px] font-bold text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-foreground">
        {value}
      </span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="flex-none text-[12px] font-extrabold text-primary"
        >
          {editLabel}
        </button>
      )}
    </div>
  );
}

function CountrySheet({
  title,
  countryNames,
  selectedIso,
  onSelect,
  onClose,
}: {
  title: string;
  countryNames: Record<string, string>;
  selectedIso: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      onClose={onClose}
      className="max-h-[72dvh]"
      header={
        <p className="pb-[12px] pt-1 text-center text-[15px] font-extrabold text-foreground">
          {title}
        </p>
      }
    >
      {({ close }) => (
        <div className="-mx-1 max-h-[58dvh] overflow-y-auto px-1">
          {COUNTRIES.map((c) => {
            const on = c.iso === selectedIso;
            return (
              <button
                key={c.iso}
                type="button"
                onClick={() => {
                  onSelect(c.iso);
                  close();
                }}
                className={`flex w-full items-center gap-3 rounded-[13px] px-3 py-[13px] text-left ${
                  on ? "bg-primary/[0.08]" : ""
                }`}
              >
                <span className="text-[22px] leading-none">{c.flag}</span>
                <span className="flex-1 text-[15px] font-bold text-foreground">
                  {countryNames[c.iso] ?? c.iso.toUpperCase()}
                </span>
                <span className="font-mono text-[14px] font-bold tabular-nums text-muted-foreground">
                  {c.dial}
                </span>
                {on && (
                  <span className="text-primary">
                    <CheckIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * Multi-step onboarding wizard (redesign — Profile Setup handoff).
 *
 * Implemented screens: 0 intro · 1 name · 2 date of birth (wheel picker). Advancing
 * past dob reveals the existing profile form (with name + birth date carried forward)
 * so the flow stays fully functional while the remaining steps are redesigned.
 *
 * Back navigation uses the browser history (push/popstate) so OS / edge-swipe back
 * moves to the previous step — no in-screen back button (shared navigation pattern).
 */
export function OnboardingWizard({
  intro,
  steps,
  countries,
  join,
  review,
  success,
  languageName,
  profile,
}: {
  intro: OnboardingIntroCopy;
  steps: OnboardingStepsCopy;
  countries: Record<string, string>;
  join: OnboardingJoinCopy;
  review: OnboardingReviewCopy;
  success: OnboardingSuccessCopy;
  languageName: string;
  profile: { copy: ProfileFormCopy; locale: Locale; safeNext: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState<DateParts | null>(null);
  const [dobSheet, setDobSheet] = useState(false);
  const [countryIso, setCountryIso] = useState("jp");
  const [phone, setPhone] = useState("");
  const [countrySheet, setCountrySheet] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "verifying" | "error"
  >("idle");
  const [inviteErrorKey, setInviteErrorKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    organizationName: string;
    roleCategory: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErrorKey, setSubmitErrorKey] = useState<string | null>(null);
  const [dest, setDest] = useState("/mobile");

  async function submit() {
    setSubmitting(true);
    setSubmitErrorKey(null);
    const result = await submitOnboardingProfile({
      name: name.trim(),
      birthDate,
      phoneNumber: phoneE164,
      preferredLanguage: profile.locale,
      inviteCode: preview ? inviteCode.trim() : "",
      next: profile.safeNext,
    });
    if (result.ok) {
      setDest(result.redirectTo);
      goTo(7);
    } else {
      setSubmitErrorKey(result.errorKey);
      setSubmitting(false);
    }
  }

  async function verifyInvite() {
    const trimmed = inviteCode.trim();
    if (!trimmed) return;
    setInviteStatus("verifying");
    setInviteErrorKey(null);
    const result = await previewInviteCode(trimmed);
    if (result.ok) {
      setPreview({
        organizationName: result.organizationName,
        roleCategory: result.roleCategory,
      });
      setInviteStatus("idle");
      goTo(5);
    } else {
      setPreview(null);
      setInviteErrorKey(result.errorKey);
      setInviteStatus("error");
    }
  }

  useEffect(() => {
    window.history.replaceState({ obStep: 0 }, "");
    const onPop = (e: PopStateEvent) => {
      const s =
        e.state && typeof e.state.obStep === "number" ? e.state.obStep : 0;
      setStep(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function goTo(next: number) {
    window.history.pushState({ obStep: next }, "");
    setStep(next);
  }

  const birthDate = dob ? `${dob.year}-${pad2(dob.month)}-${pad2(dob.day)}` : "";

  const selectedCountry =
    COUNTRIES.find((c) => c.iso === countryIso) ?? COUNTRIES[0];
  // E.164: country dial code + national number with the leading trunk "0" stripped.
  const nationalDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const phoneE164 = nationalDigits
    ? `${selectedCountry.dial}${nationalDigits}`
    : "";
  const phoneValid = nationalDigits.length >= 6;

  // ── Fallback · existing all-in-one profile form (unreachable in the normal flow) ─
  if (step >= 8) {
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <ProgressHeader step={4} />
        <section className="mx-auto w-full max-w-[460px] flex-1 px-[26px] pb-[max(26px,env(safe-area-inset-bottom))]">
          <ProfileForm
            copy={profile.copy}
            locale={profile.locale}
            safeNext={profile.safeNext}
            defaultName={name.trim()}
            defaultBirthDate={birthDate}
            defaultPhone={phoneE164}
          />
        </section>
      </main>
    );
  }

  // ── Step 7 · Success / welcome ───────────────────────────────────────────────
  if (step === 7) {
    const roleLabel = preview
      ? join.roleCategories[preview.roleCategory] ?? preview.roleCategory
      : "";
    const body = preview
      ? success.bodyJoined
          .replace("{org}", preview.organizationName)
          .replace("{role}", roleLabel)
      : success.bodyNoTeam;
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <header className="h-[48px] flex-none" />
        <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="mb-5 flex size-[76px] items-center justify-center rounded-[24px] bg-[hsl(146_44%_92%)] text-[hsl(146_50%_32%)]">
              <CheckIcon />
            </span>
            <p className="mb-[9px] text-[11px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
              {success.eyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[23px] font-black leading-[1.2] tracking-[-0.03em]">
              {success.welcomePrefix}
              {name.trim()}
              {success.welcomeSuffix}
            </h1>
            <p className="mt-3 max-w-[290px] text-[13.5px] font-semibold leading-[1.6] text-muted-foreground">
              {body}
            </p>
          </div>

          <StickyCta
            label={success.startCta}
            onClick={() => router.push(dest)}
            withArrow
          />
        </section>
      </main>
    );
  }

  // ── Step 6 · Review all entered info ─────────────────────────────────────────
  if (step === 6) {
    const roleLabel = preview
      ? join.roleCategories[preview.roleCategory] ?? preview.roleCategory
      : "";
    const dobDisplay = dob
      ? `${dob.year}. ${pad2(dob.month)}. ${pad2(dob.day)}`
      : "";
    const phoneDisplay = `${selectedCountry.dial} ${nationalDigits}`;
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <ProgressHeader step={4} />
        <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
          <div className="flex-1 overflow-y-auto pt-2">
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
              {review.title}
            </h1>
            <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
              {review.subtitle}
            </p>

            <div className="mt-[22px] rounded-[18px] border border-border bg-surface px-4 py-[2px] shadow-[0_14px_34px_-30px_rgba(20,32,43,0.5)]">
              <ReviewRow
                label={review.rowName}
                value={name.trim()}
                editLabel={review.edit}
                onEdit={() => goTo(1)}
                divider={false}
              />
              <ReviewRow
                label={review.rowDob}
                value={dobDisplay}
                editLabel={review.edit}
                onEdit={() => goTo(2)}
                divider
              />
              <ReviewRow
                label={review.rowPhone}
                value={phoneDisplay}
                editLabel={review.edit}
                onEdit={() => goTo(3)}
                divider
              />
              {/* Language is chosen at login (not a wizard step) — shown read-only. */}
              <ReviewRow
                label={review.rowLang}
                value={languageName}
                editLabel={review.edit}
                divider
              />
              {preview && (
                <>
                  <ReviewRow
                    label={review.rowOrg}
                    value={preview.organizationName}
                    editLabel={review.edit}
                    onEdit={() => goTo(4)}
                    divider
                  />
                  <ReviewRow
                    label={review.rowRole}
                    value={roleLabel}
                    editLabel={review.edit}
                    onEdit={() => goTo(4)}
                    divider
                  />
                </>
              )}
            </div>

            {submitErrorKey ? (
              <div className="mt-[14px] flex items-start gap-[11px] rounded-[14px] border border-[hsl(4_62%_46%/0.24)] bg-[hsl(6_70%_95.5%)] px-[14px] py-[13px]">
                <span className="mt-[1px] flex-none text-[hsl(4_62%_46%)]">
                  <WarnIcon />
                </span>
                <div className="text-[12px] font-semibold leading-[1.5] text-[hsl(4_62%_46%)]">
                  {join.errors[submitErrorKey] ?? submitErrorKey}
                </div>
              </div>
            ) : (
              <div
                className="mt-[14px] flex items-start gap-[11px] rounded-[14px] border px-[14px] py-[13px]"
                style={{
                  background: "hsl(206 66% 93%)",
                  borderColor: "color-mix(in oklab, hsl(206 70% 40%) 22%, transparent)",
                }}
              >
                <span className="mt-[1px] flex-none text-[hsl(206_70%_40%)]">
                  <InfoIcon />
                </span>
                <div>
                  <div className="text-[12.5px] font-extrabold text-[hsl(206_70%_40%)]">
                    {review.infoTitle}
                  </div>
                  <div className="mt-[2px] text-[11.5px] font-semibold leading-[1.5] text-[hsl(222_20%_28%)]">
                    {review.infoBody}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-none py-[14px] pb-[max(14px,env(safe-area-inset-bottom))]">
            <SpinnerButton label={review.submit} onClick={submit} busy={submitting} />
          </div>
        </section>
      </main>
    );
  }

  // ── Step 5 · Organization / role confirmation (after a verified invite code) ──
  if (step === 5 && preview) {
    const roleLabel = join.roleCategories[preview.roleCategory] ?? preview.roleCategory;
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <ProgressHeader step={4} />
        <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
          <div className="flex-1 overflow-y-auto pt-2">
            <p className="mb-[10px] mt-[14px] text-[12px] font-extrabold uppercase tracking-[0.04em] text-primary">
              {join.confirmEyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
              {join.confirmTitle}
            </h1>
            <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
              {join.confirmSubtitle}
            </p>

            <div className="mt-[22px] overflow-hidden rounded-[18px] border border-border shadow-[0_18px_40px_-28px_rgba(20,32,43,0.5)]">
              <div className="relative px-[18px] pb-4 pt-[18px] text-white" style={{ background: GRADIENT }}>
                <span className="absolute -right-[30px] -top-[30px] size-[120px] rounded-full border-[24px] border-white/[0.07]" />
                <div className="relative flex items-center gap-[11px]">
                  <span className="flex size-[42px] flex-none items-center justify-center rounded-[12px] bg-white/[0.16] text-[15px] font-extrabold">
                    {preview.organizationName.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-extrabold tracking-[-0.01em]">
                      {preview.organizationName}
                    </div>
                  </div>
                  <span className="ml-auto inline-flex flex-none items-center gap-1 rounded-full bg-white/20 px-[9px] py-1 text-[10.5px] font-extrabold">
                    <ShieldIcon />
                    {join.verified}
                  </span>
                </div>
              </div>
              <div className="bg-surface px-[18px] py-[15px]">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
                  {join.roleLabel}
                </div>
                <div className="mt-2 text-[16px] font-extrabold tracking-[-0.01em]">
                  {roleLabel}
                </div>
              </div>
            </div>
          </div>

          <StickyCta label={join.joinCta} onClick={() => goTo(6)} />
        </section>
      </main>
    );
  }

  // ── Step 4 · Invite code entry (verify → preview, or skip) ───────────────────
  if (step === 4) {
    const verifying = inviteStatus === "verifying";
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <ProgressHeader step={4} />
        <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
          <div className="flex-1 overflow-y-auto pt-2">
            <p className="mb-[10px] mt-[14px] text-[12px] font-extrabold uppercase tracking-[0.04em] text-primary">
              {join.inviteEyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
              {join.inviteTitle}
            </h1>
            <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
              {join.inviteSubtitle}
            </p>

            <div className="mt-[22px]">
              <input
                autoFocus
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  if (inviteStatus === "error") {
                    setInviteStatus("idle");
                    setInviteErrorKey(null);
                  }
                }}
                placeholder={join.codePlaceholder}
                autoCapitalize="characters"
                className={`h-[56px] w-full rounded-[14px] border bg-surface px-[15px] text-center font-mono text-[19px] font-bold tracking-[0.12em] text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-[15px] placeholder:font-medium placeholder:tracking-normal placeholder:text-[hsl(222_10%_62%)] ${
                  inviteStatus === "error"
                    ? "border-[hsl(4_62%_46%)]"
                    : "border-border focus:border-primary focus:ring-[3.5px] focus:ring-primary/15"
                }`}
              />
              {inviteStatus === "error" ? (
                <div className="mt-[18px] flex items-start gap-[11px] rounded-[14px] border border-[hsl(4_62%_46%/0.24)] bg-[hsl(6_70%_95.5%)] px-[14px] py-[13px]">
                  <span className="mt-[1px] flex-none text-[hsl(4_62%_46%)]">
                    <WarnIcon />
                  </span>
                  <div>
                    <div className="text-[13px] font-extrabold text-[hsl(4_62%_46%)]">
                      {join.invalidTitle}
                    </div>
                    <div className="mt-[3px] text-[11.5px] font-semibold leading-[1.5] text-[hsl(222_20%_28%)]">
                      {(inviteErrorKey && join.errors[inviteErrorKey]) ?? join.invalidTitle}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-[14px] text-[11.5px] font-semibold text-[hsl(222_10%_62%)]">
                  {join.caseHint}
                </p>
              )}
            </div>
          </div>

          <div className="flex-none py-[14px] pb-[max(14px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={verifyInvite}
              disabled={!inviteCode.trim() || verifying}
              className={`flex h-[54px] w-full items-center justify-center rounded-[15px] text-[15.5px] font-extrabold tracking-[-0.01em] text-white ${
                !inviteCode.trim() || verifying ? "opacity-40" : ""
              }`}
              style={{
                background: GRADIENT,
                boxShadow: !inviteCode.trim() || verifying ? "none" : SHADOW,
              }}
            >
              {verifying ? join.checking : join.verifyCta}
            </button>
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  goTo(6);
                }}
                className="text-[13px] font-extrabold text-muted-foreground"
              >
                {join.skip}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ── Step 3 · Phone number ────────────────────────────────────────────────────
  if (step === 3) {
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <ProgressHeader step={3} />
        <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
          <div className="flex-1 overflow-y-auto pt-2">
            <p className="mb-[10px] mt-[14px] text-[12px] font-extrabold uppercase tracking-[0.04em] text-primary">
              {steps.basicsEyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
              {steps.phoneTitle}
            </h1>
            <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
              {steps.phoneSubtitle}
            </p>

            <div className="mt-[22px]">
              <div className="mb-2 text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]">
                {steps.phoneNumLabel}
              </div>
              <div className="flex gap-[10px]">
                <button
                  type="button"
                  onClick={() => setCountrySheet(true)}
                  className="flex h-[54px] flex-none items-center gap-[7px] rounded-[14px] border border-border bg-surface px-[13px] text-[15px] font-bold text-foreground"
                >
                  <span className="text-[17px] leading-none">
                    {selectedCountry.flag}
                  </span>
                  {selectedCountry.dial}
                  <span className="text-[hsl(222_10%_62%)]">
                    <ChevronDownIcon />
                  </span>
                </button>
                <input
                  autoFocus
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={steps.phoneInputPlaceholder}
                  className="h-[54px] flex-1 rounded-[14px] border border-border bg-surface px-[15px] text-[16px] font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-[hsl(222_10%_62%)] focus:border-primary focus:ring-[3.5px] focus:ring-primary/15"
                />
              </div>
              <p className="mt-2 text-[11.5px] font-semibold leading-[1.5] text-[hsl(222_10%_62%)]">
                {steps.phoneHint}
              </p>
            </div>
          </div>

          <StickyCta
            label={steps.continueCta}
            onClick={() => goTo(4)}
            disabled={!phoneValid}
            withArrow
          />
        </section>

        {countrySheet && (
          <CountrySheet
            title={steps.phoneCountrySheetTitle}
            countryNames={countries}
            selectedIso={countryIso}
            onSelect={setCountryIso}
            onClose={() => setCountrySheet(false)}
          />
        )}
      </main>
    );
  }

  // ── Step 2 · Date of birth ───────────────────────────────────────────────────
  if (step === 2) {
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <ProgressHeader step={2} />
        <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
          <div className="flex-1 overflow-y-auto pt-2">
            <p className="mb-[10px] mt-[14px] text-[12px] font-extrabold uppercase tracking-[0.04em] text-primary">
              {steps.basicsEyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
              {steps.dobTitle}
            </h1>
            <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
              {steps.dobSubtitle}
            </p>

            <div className="mt-[22px] flex gap-[10px]">
              <DateCell
                label={steps.dobYearLabel}
                value={dob ? String(dob.year) : null}
                placeholder={steps.dobYearPlaceholder}
                grow
                onClick={() => setDobSheet(true)}
              />
              <DateCell
                label={steps.dobMonthLabel}
                value={dob ? pad2(dob.month) : null}
                placeholder={steps.dobMonthPlaceholder}
                onClick={() => setDobSheet(true)}
              />
              <DateCell
                label={steps.dobDayLabel}
                value={dob ? pad2(dob.day) : null}
                placeholder={steps.dobDayPlaceholder}
                onClick={() => setDobSheet(true)}
              />
            </div>
            <p className="mt-2 text-[11.5px] font-semibold leading-[1.45] text-[hsl(222_10%_62%)]">
              {steps.dobHint}
            </p>
          </div>

          <StickyCta
            label={steps.continueCta}
            onClick={() => goTo(3)}
            disabled={!dob}
            withArrow
          />
        </section>

        {dobSheet && (
          <BirthDateSheet
            title={steps.dobSheetTitle}
            confirmLabel={steps.dobConfirm}
            initial={dob ?? { year: 2000, month: 1, day: 1 }}
            onConfirm={(parts) => setDob(parts)}
            onClose={() => setDobSheet(false)}
          />
        )}
      </main>
    );
  }

  // ── Step 1 · Name ────────────────────────────────────────────────────────────
  if (step === 1) {
    const isGood = name.trim().length > 0;
    return (
      <main
        className="flex min-h-dvh flex-col text-foreground"
        style={{ background: IVORY_BG }}
      >
        <ProgressHeader step={1} />
        <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
          <div className="flex-1 overflow-y-auto pt-2">
            <p className="mb-[10px] mt-[14px] text-[12px] font-extrabold uppercase tracking-[0.04em] text-primary">
              {steps.basicsEyebrow}
            </p>
            <h1 className="whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
              {steps.nameTitle}
            </h1>
            <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
              {steps.nameSubtitle}
            </p>

            <div className="mt-[22px]">
              <div className="mb-2 text-[12.5px] font-extrabold text-[hsl(222_20%_28%)]">
                {steps.nameLabel}
              </div>
              <div className="relative">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`h-[54px] w-full rounded-[14px] border bg-surface px-[15px] pr-[46px] text-[16px] font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-[hsl(222_10%_62%)] focus:ring-[3.5px] focus:ring-primary/15 ${
                    isGood ? "border-[hsl(146_50%_32%)]" : "border-border focus:border-primary"
                  }`}
                />
                {isGood && (
                  <span className="pointer-events-none absolute right-[15px] top-[18px] text-[hsl(146_50%_32%)]">
                    <CheckIcon />
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11.5px] font-semibold leading-[1.45] text-[hsl(222_10%_62%)]">
                {steps.nameHint}
              </p>
            </div>
          </div>

          <StickyCta
            label={steps.continueCta}
            onClick={() => goTo(2)}
            disabled={!isGood}
            withArrow
          />
        </section>
      </main>
    );
  }

  // ── Step 0 · Intro ───────────────────────────────────────────────────────────
  return (
    <main
      className="flex min-h-dvh flex-col text-foreground"
      style={{ background: IVORY_BG }}
    >
      <header className="h-[48px] flex-none" />
      <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-[26px]">
        <div className="flex-1 overflow-y-auto pt-2">
          {/* Logo slot intentionally empty (a brand logo is added later). */}
          <div className="size-14" aria-hidden="true" />

          <h1 className="mt-[6px] whitespace-pre-line text-[25px] font-black leading-[1.18] tracking-[-0.03em]">
            {intro.title}
          </h1>
          <p className="mt-[10px] text-[13.5px] font-semibold leading-[1.55] text-muted-foreground">
            {intro.subtitle}
          </p>

          <div className="mt-6 rounded-[18px] border border-border bg-surface px-4 py-[4px] shadow-[0_14px_34px_-30px_rgba(20,32,43,0.5)]">
            <ChecklistRow
              icon={<UserIcon />}
              title={intro.itemBasicsTitle}
              sub={intro.itemBasicsSub}
              divider={false}
            />
            <ChecklistRow
              icon={<GlobeIcon />}
              title={intro.itemLangTitle}
              sub={intro.itemLangSub}
              divider
            />
            <ChecklistRow
              icon={<TicketIcon />}
              title={intro.itemInviteTitle}
              sub={intro.itemInviteSub}
              divider
            />
          </div>
        </div>

        <StickyCta label={intro.startCta} onClick={() => goTo(1)} withArrow />
      </section>
    </main>
  );
}
