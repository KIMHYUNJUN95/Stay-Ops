import { redirect } from "next/navigation";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { canAccessOpsAdmin, type OpsAdminScreen } from "@/lib/ops-admin";

/**
 * 운영 관리자 화면 다섯 개가 **같은 문 하나**를 쓴다.
 *
 * 메뉴 숨김은 UI 편의이지 보안이 아니다 — 경로를 직접 쳐서 들어와도 여기서 막는다
 * (docs/product/32-ops-admin-area.md → 「진입점」).
 *
 * 권한이 없으면 오류를 띄우지 않고 대시보드로 보낸다. 있는 줄도 몰랐던 화면에서 「권한 없음」을
 * 보여 봐야 알려줄 것이 없고, 채용 콘솔이 이미 같은 방식이다.
 */
export async function requireOpsAdminPage(screen: OpsAdminScreen) {
  const session = await requireAdminPageSession({ nextPath: `/admin/ops/${screen}` });
  if (!canAccessOpsAdmin(session)) redirect("/admin");
  return session;
}
