import { OpsRevenueConsole } from "@/components/admin/ops/ops-revenue-console";
import { AdminShell } from "@/components/shell/admin-shell";
import { toJstDateString } from "@/lib/admin-calendar-dashboard";
import { adminLocaleTag } from "@/lib/admin-export-meta";
import { getDictionary } from "@/lib/i18n";
import { opsNavId } from "@/lib/ops-admin";
import {
  comparisonRange,
  normalizeRange,
  REVENUE_COMPARES,
  REVENUE_MODES,
  type RevenueCompare,
  type RevenueMode,
} from "@/lib/ops-revenue";
import { getOpsRevenueData } from "@/lib/ops-revenue-server";
import { requireOpsAdminPage } from "../ops-page-session";

/**
 * 매출 — 기간별 매출 · 수수료 · 가동률 · ADR · RevPAR, 건물별 표와 「건물 × 월」 매트릭스 (2026-10-06, 시안 A v2).
 *
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「매출 화면」
 *
 * 식은 판매 캘린더 「매출 요약」과 같다(같은 읽기 · 같은 계산 모듈). 기간은 주소에 있다 — 월은 공용 월 선택기의
 * `?ym=`, 그 밖은 `?mode=…&from=…(&to=…)`. 비교 기간은 `?cmp=1y|2y|3y|custom(&cfrom=…&cto=…)`. 주소 값은 믿지 않고
 * 모드마다 모양을 바로잡는다.
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OpsRevenuePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireOpsAdminPage("revenue");
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const today = toJstDateString(new Date());
  const requested = one("mode");
  const mode: RevenueMode = REVENUE_MODES.includes(requested as RevenueMode) ? (requested as RevenueMode) : "month";
  const range = normalizeRange(mode, { from: one("from"), to: one("to"), ym: one("ym") }, today);
  const requestedCompare = one("cmp");
  const compare: RevenueCompare = REVENUE_COMPARES.includes(requestedCompare as RevenueCompare)
    ? (requestedCompare as RevenueCompare)
    : "1y";
  const previousRange = comparisonRange(compare, range, { from: one("cfrom"), to: one("cto") });
  const data = await getOpsRevenueData(session, { compare, mode, previousRange, range });

  return (
    <AdminShell activeItem={opsNavId("revenue")} title={dictionary.opsAdmin.areaName}>
      <OpsRevenueConsole
        copy={dictionary.opsRevenue}
        data={data}
        initialTab={one("tab") === "matrix" ? "matrix" : "report"}
        localeTag={adminLocaleTag(locale)}
        shared={dictionary.admin.shared}
      />
    </AdminShell>
  );
}
