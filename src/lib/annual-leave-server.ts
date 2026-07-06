// Annual leave — server-only DB read/write for the Phase 1 backend (hire_date + self-entered
// balance baseline only; see migration 202607060001 and docs/product/26-annual-leave-workflow.md).
// Strictly self-scoped: every query/write filters by the CURRENT user's id (passed by the caller
// from the authenticated session) AND the organization id.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { computeAnnualLeaveSummary, tokyoToday, type AnnualLeaveSummary } from "@/lib/annual-leave";

type Service = ReturnType<typeof getSupabaseServiceClient>;

export type AnnualLeaveBaselineRow = {
  hireDate: string;
  baseAmount: number;
  bonusAmount: number;
  baselineDate: string;
};

/** Reads `profiles.hire_date` + the user's `annual_leave_baselines` row. Null = not set up yet. */
export async function getAnnualLeaveBaseline(
  service: Service,
  organizationId: string,
  userId: string,
): Promise<AnnualLeaveBaselineRow | null> {
  const [{ data: profileResult }, { data: baselineResult }] = await Promise.all([
    service.from("profiles").select("hire_date").eq("id", userId).maybeSingle(),
    service
      .from("annual_leave_baselines")
      .select("base_amount, bonus_amount, baseline_date")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const profile = profileResult as { hire_date: string | null } | null;
  const baseline = baselineResult as { base_amount: number; bonus_amount: number; baseline_date: string } | null;

  if (!profile?.hire_date || !baseline) return null;

  return {
    hireDate: profile.hire_date,
    baseAmount: Number(baseline.base_amount),
    bonusAmount: Number(baseline.bonus_amount),
    baselineDate: baseline.baseline_date,
  };
}

/**
 * Self-service upsert: sets hire_date on the profile and writes the balance baseline as of today.
 * Overwrites any prior baseline (the employee is expected to do this once at setup).
 */
export async function setAnnualLeaveBaselineForUser(
  service: Service,
  organizationId: string,
  userId: string,
  input: { hireDate: string; baseAmount: number; bonusAmount?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baselineDate = tokyoToday();

  const { error: profileError } = await service
    .from("profiles")
    .update({ hire_date: input.hireDate } as never)
    .eq("id", userId);
  if (profileError) return { ok: false, error: "profile_update_failed" };

  const { error: baselineError } = await service.from("annual_leave_baselines").upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      base_amount: input.baseAmount,
      bonus_amount: input.bonusAmount ?? 0,
      baseline_date: baselineDate,
    } as never,
    { onConflict: "organization_id,user_id" },
  );
  if (baselineError) return { ok: false, error: "baseline_upsert_failed" };

  return { ok: true };
}

/** Reads the baseline and computes today's summary. Null = hire date/baseline not set up yet. */
export async function getMyAnnualLeaveSummary(
  service: Service,
  organizationId: string,
  userId: string,
): Promise<AnnualLeaveSummary | null> {
  const baseline = await getAnnualLeaveBaseline(service, organizationId, userId);
  if (!baseline) return null;

  return computeAnnualLeaveSummary({
    hireDate: baseline.hireDate,
    baselineDate: baseline.baselineDate,
    baselineAmount: baseline.baseAmount,
    bonusBaselineAmount: baseline.bonusAmount,
    asOf: tokyoToday(),
  });
}
