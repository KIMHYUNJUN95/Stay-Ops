import { AdminShell } from "@/components/shell/admin-shell";
import "@/components/admin/ops/ops-console.css";
import { getDictionary } from "@/lib/i18n";
import { opsNavId } from "@/lib/ops-admin";
import { requireOpsAdminPage } from "../ops-page-session";

/**
 * 아직 만들지 않은 화면. 메뉴와 권한 게이트는 먼저 붙여 둔다 —
 * 라우트가 있어야 사이드바가 완성되고, 게이트가 뒤늦게 붙으면 그 사이에 열려 있게 된다.
 *
 * 설계: docs/product/34-metrics-and-automation.md
 */
export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const session = await requireOpsAdminPage("automation");
  const dictionary = getDictionary(session.user.preferredLanguage);

  return (
    <AdminShell activeItem={opsNavId("automation")} title={dictionary.opsAdmin.areaName}>
      <div className="ops">
        <div className="opsg">
          <div className="ops__empty">
            <h2>{dictionary.opsAdmin.soonTitle}</h2>
            <p>{dictionary.opsAdmin.soonBody}</p>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
