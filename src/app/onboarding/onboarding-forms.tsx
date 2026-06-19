"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  completeProfile,
  joinOrganizationWithInviteCode,
} from "@/app/onboarding/actions";
import {
  InviteCodeField,
  type InviteCodeFieldCopy,
} from "@/app/onboarding/invite-code-field";
import type { Locale } from "@/lib/i18n";

const inputClass =
  "h-[54px] w-full rounded-lg border border-slate-300/70 bg-white/58 px-4 text-base font-semibold text-slate-950 shadow-[0_1px_0_rgba(255,255,255,0.72)_inset] backdrop-blur-xl outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15";

const primaryButtonClass =
  "h-[54px] w-full rounded-lg bg-primary text-base font-black text-white shadow-[0_14px_34px_hsl(var(--primary-hsl)/0.18)] transition-colors hover:bg-primary/90 disabled:opacity-60";

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={primaryButtonClass} disabled={pending || disabled}>
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="size-4 animate-spin rounded-full border-[2.4px] border-white/60 border-t-white" />
        </span>
      ) : (
        label
      )}
    </button>
  );
}

export type ProfileFormCopy = {
  nameLabel: string;
  namePlaceholder: string;
  birthDateLabel: string;
  birthDatePlaceholder: string;
  birthDateHint: string;
  phoneLabel: string;
  phonePlaceholder: string;
  phoneHint: string;
  languageLabel: string;
  languages: { ko: string; ja: string; en: string };
  continueCta: string;
  joinTeamCta: string;
  invite: InviteCodeFieldCopy;
};

/**
 * needs_profile step — collects the required operational profile (name, birth
 * date, phone, language) plus an OPTIONAL invite code. When a code is verified
 * via the preview flow, the CTA becomes "join this team" and `completeProfile`
 * saves the profile and joins in one step; otherwise the user is routed to the
 * membership step.
 */
export function ProfileForm({
  copy,
  locale,
  safeNext,
  defaultName = "",
  defaultBirthDate = "",
  defaultPhone = "",
}: {
  copy: ProfileFormCopy;
  locale: Locale;
  safeNext: string;
  defaultName?: string;
  defaultBirthDate?: string;
  defaultPhone?: string;
}) {
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);

  return (
    <form action={completeProfile} className="mt-6 grid gap-4">
      {safeNext && <input name="next" type="hidden" value={safeNext} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-bold text-slate-950">{copy.nameLabel}</span>
          <input
            className={inputClass}
            name="name"
            placeholder={copy.namePlaceholder}
            defaultValue={defaultName}
            required
            type="text"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-bold text-slate-950">{copy.birthDateLabel}</span>
          <input
            className={inputClass}
            name="birthDate"
            placeholder={copy.birthDatePlaceholder}
            defaultValue={defaultBirthDate}
            required
            type="date"
          />
          <span className="block text-[13px] font-medium leading-5 text-slate-500">
            {copy.birthDateHint}
          </span>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-bold text-slate-950">{copy.phoneLabel}</span>
          <input
            className={inputClass}
            name="phoneNumber"
            placeholder={copy.phonePlaceholder}
            defaultValue={defaultPhone}
            required
            type="tel"
          />
          <span className="block text-[13px] font-medium leading-5 text-slate-500">
            {copy.phoneHint}
          </span>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-bold text-slate-950">{copy.languageLabel}</span>
          <select
            className={`${inputClass} w-full`}
            defaultValue={locale}
            name="preferredLanguage"
          >
            <option value="ko">{copy.languages.ko}</option>
            <option value="ja">{copy.languages.ja}</option>
            <option value="en">{copy.languages.en}</option>
          </select>
        </label>
      </div>

      <InviteCodeField copy={copy.invite} onVerifiedChange={setVerifiedCode} />
      {verifiedCode && <input name="inviteCode" type="hidden" value={verifiedCode} />}

      <SubmitButton label={verifiedCode ? copy.joinTeamCta : copy.continueCta} />
    </form>
  );
}

export type JoinFormCopy = {
  joinTeamCta: string;
  invite: InviteCodeFieldCopy;
};

/**
 * needs_membership step — the profile is already complete; the user just needs
 * to join an organization. The join button is disabled until an invite code is
 * verified via the preview flow.
 */
export function JoinForm({
  copy,
  safeNext,
}: {
  copy: JoinFormCopy;
  safeNext: string;
}) {
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);

  return (
    <form action={joinOrganizationWithInviteCode} className="mt-6 space-y-4">
      {safeNext && <input name="next" type="hidden" value={safeNext} />}
      <InviteCodeField copy={copy.invite} onVerifiedChange={setVerifiedCode} />
      {verifiedCode && <input name="inviteCode" type="hidden" value={verifiedCode} />}
      <SubmitButton label={copy.joinTeamCta} disabled={!verifiedCode} />
    </form>
  );
}
