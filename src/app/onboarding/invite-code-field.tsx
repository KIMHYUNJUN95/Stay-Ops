"use client";

import { useState } from "react";
import { previewInviteCode } from "@/app/onboarding/actions";

export type InviteCodeFieldCopy = {
  label: string;
  placeholder: string;
  hint: string;
  verifyCta: string;
  verifiedBadge: string;
  orgLabel: string;
  roleLabel: string;
  changeCode: string;
  /** `onboarding.errors.*` map, for resolving the returned error key. */
  errors: Record<string, string>;
  /** `onboarding.roleCategories.*` map, for resolving the returned category key. */
  roleCategories: Record<string, string>;
};

const inputClass =
  "h-[54px] w-full rounded-lg border border-slate-300/70 bg-white/58 px-4 text-base font-semibold text-slate-950 shadow-[0_1px_0_rgba(255,255,255,0.72)_inset] backdrop-blur-xl outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15";

type Status = "idle" | "verifying" | "ok" | "error";

/**
 * Invite-code input with a "verify → preview → confirm" flow.
 *
 * On verify it calls the real `previewInviteCode` server action and, on success,
 * renders the resolved organization + role-category preview. It reports the
 * verified code (or null when cleared) to the parent via `onVerifiedChange` so
 * the parent form can submit it and gate its join button on a confirmed preview.
 */
export function InviteCodeField({
  copy,
  onVerifiedChange,
}: {
  copy: InviteCodeFieldCopy;
  onVerifiedChange: (code: string | null) => void;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<{
    organizationName: string;
    roleCategory: string;
  } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function verify() {
    const trimmed = code.trim();
    if (!trimmed) {
      setStatus("error");
      setErrorKey("missing_invite");
      onVerifiedChange(null);
      return;
    }
    setStatus("verifying");
    setErrorKey(null);
    const result = await previewInviteCode(trimmed);
    if (result.ok) {
      setPreview({
        organizationName: result.organizationName,
        roleCategory: result.roleCategory,
      });
      setStatus("ok");
      onVerifiedChange(trimmed);
    } else {
      setPreview(null);
      setStatus("error");
      setErrorKey(result.errorKey);
      onVerifiedChange(null);
    }
  }

  function reset() {
    setStatus("idle");
    setPreview(null);
    setErrorKey(null);
    onVerifiedChange(null);
  }

  // ── Confirmed preview state ───────────────────────────────────────────────
  if (status === "ok" && preview) {
    const roleLabel = copy.roleCategories[preview.roleCategory] ?? preview.roleCategory;
    return (
      <div className="space-y-2">
        <span className="text-sm font-bold text-slate-950">{copy.label}</span>
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.05] shadow-[0_1px_0_rgba(255,255,255,0.62)_inset]">
          <div className="flex items-center justify-between border-b border-primary/15 px-4 py-3">
            <span className="font-mono text-sm font-bold tracking-[0.04em] text-slate-950">
              {code.trim().toUpperCase()}
            </span>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-extrabold text-primary">
              {copy.verifiedBadge}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 px-4 py-3">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {copy.orgLabel}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-extrabold text-slate-950">
                {preview.organizationName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {copy.roleLabel}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-extrabold text-slate-950">
                {roleLabel}
              </dd>
            </div>
          </dl>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-[13px] font-bold text-primary underline-offset-2 hover:underline"
        >
          {copy.changeCode}
        </button>
      </div>
    );
  }

  // ── Input / verify state ──────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <span className="text-sm font-bold text-slate-950">{copy.label}</span>
      <div className="flex gap-2">
        <input
          autoCapitalize="characters"
          className={inputClass}
          name="inviteCodeRaw"
          placeholder={copy.placeholder}
          type="text"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (status !== "idle") setStatus("idle");
            if (errorKey) setErrorKey(null);
          }}
        />
        <button
          type="button"
          onClick={verify}
          disabled={status === "verifying"}
          className="h-[54px] flex-none rounded-lg bg-primary px-5 text-sm font-black text-white shadow-[0_14px_34px_hsl(var(--primary-hsl)/0.18)] transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {copy.verifyCta}
        </button>
      </div>
      {errorKey && (
        <p className="text-[13px] font-bold leading-5 text-red-600">
          {copy.errors[errorKey] ?? errorKey}
        </p>
      )}
      {!errorKey && <p className="text-[13px] font-medium leading-5 text-slate-500">{copy.hint}</p>}
    </div>
  );
}
