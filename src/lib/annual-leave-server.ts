// Annual leave — server-only DB read/write for the Phase 1 backend (hire_date + self-entered
// balance baseline only; see migration 202607060001 and docs/product/26-annual-leave-workflow.md).
// Strictly self-scoped: every query/write filters by the CURRENT user's id (passed by the caller
// from the authenticated session) AND the organization id.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getRpcClient } from "@/lib/supabase/rpc";
import {
  computeAnnualLeaveSummary,
  tokyoToday,
  type AnnualLeaveSummary,
  type LeaveUsageEvent,
} from "@/lib/annual-leave";

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
  const [profileQuery, baselineQuery] = await Promise.all([
    service.from("profiles").select("hire_date").eq("id", userId).maybeSingle(),
    service
      .from("annual_leave_baselines")
      .select("base_amount, bonus_amount, baseline_date")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profileQuery.error) throw profileQuery.error;
  if (baselineQuery.error) throw baselineQuery.error;
  const profileResult = profileQuery.data;
  const baselineResult = baselineQuery.data;
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
 * Sets hire_date and the balance baseline atomically. Self-service callers may create the baseline
 * once; approver-gated admin callers explicitly opt into overwrite.
 *
 * **검증이 여기 있는 이유 (2026-08-03).** 이 함수는 service-role 클라이언트로 쓰므로 RLS 가
 * 아무것도 막지 않는다. 상한·자격 검사가 관리자 경로(`saveEmployeeLeaveBaseline`)에만 있어서,
 * 모바일 자가 설정 액션은 **부여일수·입사일을 무제한으로 자기부여**할 수 있었다. 급여와 직결되는
 * 값이라 호출자마다 따로 막으면 언젠가 또 갈라진다 — **유일한 쓰기 지점인 여기서** 막는다.
 * 상한 값(40 / 8)과 시급직 제외 규칙은 관리자 경로에 있던 것을 그대로 옮겨 왔다.
 */
export const MAX_LEAVE_GRANT = 40;
export const MAX_LEAVE_BONUS = 8;
/** 시급·파트타임은 연차 대상이 아니다(확정 정책). 그 외 조직 역할은 전부 월급제 정규직으로 본다. */
export const LEAVE_HOURLY_ROLE = "part_time_staff";

export async function setAnnualLeaveBaselineForUser(
  service: Service,
  organizationId: string,
  userId: string,
  input: { hireDate: string; baseAmount: number; bonusAmount?: number },
  options: { allowOverwrite?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.hireDate)) return { ok: false, error: "invalid_dates" };
  if (!Number.isFinite(input.baseAmount) || input.baseAmount < 0 || input.baseAmount > MAX_LEAVE_GRANT) {
    return { ok: false, error: "invalid_grant" };
  }
  const bonus = input.bonusAmount ?? 0;
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > MAX_LEAVE_BONUS) {
    return { ok: false, error: "invalid_bonus" };
  }

  // 활성 멤버십 + 시급직 제외. 조직 스코프로 조회하므로 남의 조직 사용자에게는 쓸 수 없다.
  const { data: memData, error: memberError } = await service
    .from("memberships")
    .select("status, role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) return { ok: false, error: "membership_lookup_failed" };
  const membership = memData as { status: string; role: string } | null;
  if (!membership || membership.status !== "active") return { ok: false, error: "target_not_found" };
  if (membership.role === LEAVE_HOURLY_ROLE) return { ok: false, error: "hourly_excluded" };

  const baselineDate = tokyoToday();

  const { data, error } = await getRpcClient(service).rpc<string>("set_annual_leave_baseline_atomic", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_hire_date: input.hireDate,
    p_base_amount: input.baseAmount,
    p_bonus_amount: bonus,
    p_baseline_date: baselineDate,
    p_allow_overwrite: options.allowOverwrite ?? false,
  });
  if (error) return { ok: false, error: "baseline_update_failed" };
  if (data !== "ok") return { ok: false, error: data || "baseline_update_failed" };

  return { ok: true };
}

/**
 * Approved leave days that draw down the balance pools: 유급(paid) → base pool, 특별(special) → bonus
 * pool. 경조(annual, company-granted) and 기타(other, unpaid) draw from neither. Single source of truth
 * so the mobile self-summary and the admin balance views always agree.
 */
export async function sumApprovedLeaveUsage(
  service: Service,
  organizationId: string,
  userId: string,
): Promise<{ base: number; bonus: number }> {
  const events = await getApprovedLeaveUsageEvents(service, organizationId, userId);
  return events.reduce(
    (sum, event) => {
      sum[event.pool] += event.amount;
      return sum;
    },
    { base: 0, bonus: 0 },
  );
}

export async function getApprovedLeaveUsageEvents(
  service: Service,
  organizationId: string,
  userId: string,
): Promise<LeaveUsageEvent[]> {
  const { data, error } = await service
    .from("annual_leave_requests")
    .select("leave_type, start_date, days_count")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "approved");
  if (error) throw new Error(`annual_leave_usage_read_failed:${error.message}`);
  const events: LeaveUsageEvent[] = [];
  for (const row of (data ?? []) as {
    leave_type: string;
    start_date: string;
    days_count: number;
  }[]) {
    if (row.leave_type === "paid") {
      events.push({ date: row.start_date, amount: Number(row.days_count), pool: "base" });
    } else if (row.leave_type === "special") {
      events.push({ date: row.start_date, amount: Number(row.days_count), pool: "bonus" });
    }
  }
  return events;
}

/** Reads the baseline and computes today's summary, with approved usage deducted. Null = not set up. */
export async function getMyAnnualLeaveSummary(
  service: Service,
  organizationId: string,
  userId: string,
): Promise<AnnualLeaveSummary | null> {
  const baseline = await getAnnualLeaveBaseline(service, organizationId, userId);
  if (!baseline) return null;

  const usageEvents = await getApprovedLeaveUsageEvents(service, organizationId, userId);
  return computeAnnualLeaveSummary({
    hireDate: baseline.hireDate,
    baselineDate: baseline.baselineDate,
    baselineAmount: baseline.baseAmount,
    bonusBaselineAmount: baseline.bonusAmount,
    usageEvents,
    asOf: tokyoToday(),
  });
}
